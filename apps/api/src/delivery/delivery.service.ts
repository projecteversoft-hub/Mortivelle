import { HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DELIVERY_PAYLOAD_SCHEMA_VERSION,
  DeliveryProviderOutcome,
  DeliveryRejectionReason,
  DeliveryStatus,
  ErrorCode,
  LeadStatus,
  sha256Hex,
  type DeliveryPayloadV1,
} from '@tech-realty-rentals/shared';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/domain-exception';
import { AuditService } from '../audit/audit.service';
import { LeadLifecycleService } from '../leads/lead-lifecycle.service';
import {
  LEAD_DELIVERY_PROVIDER,
  type LeadDeliveryProvider,
} from './providers/lead-delivery-provider';
import { BillingService } from './billing.service';

/** Deterministic JSON stringification (keys sorted recursively) — mirrors
 * apps/api/src/leads/leads.service.ts's `canonicalJsonStringify` EXACTLY, per the Phase 6
 * task description ("mirror this EXACT pattern for delivery idempotency ... don't reinvent
 * it"). Duplicated rather than imported/extracted: it is a small, self-contained pure
 * function and `leads.service.ts` does not export it, so copying keeps this phase's change
 * surface confined to its own files. */
function canonicalJsonStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJsonStringify((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface AttemptDeliveryInput {
  leadId: string;
  lenderId: string;
  routingAttemptId: string;
  correlationId: string;
  /** Test-only / controllable simulated-outcome hook, threaded straight through to the mock
   * provider (docs/08 §5). Never part of the canonical payload whose hash drives
   * idempotency-conflict detection. */
  simulateOutcome?: DeliveryProviderOutcome;
}

export interface AttemptDeliveryResult {
  delivery: {
    id: string;
    status: string;
    acknowledgedAt: Date | null;
    errorCode: string | null;
    retryCount: number;
  };
  /** True when this call returned a PRIOR result for an already-processed idempotency key
   * (the "duplicate retry" path) rather than invoking the provider again. */
  replay: boolean;
}

/**
 * Mock delivery adapter orchestration (docs/03 §2, docs/08 §5-6, docs/11 §7) — the ONLY
 * caller of `LeadDeliveryProvider`. Owns:
 * - Building the typed, versioned delivery payload.
 * - Idempotency (docs/04 §1, docs/08 §6): same key + same payload -> prior result; same key +
 *   different payload -> 409 conflict. Mirrors `LeadsService.submit`'s exact pattern.
 * - The retry policy: only `TRANSIENT_ERROR` is retried, up to `DELIVERY_MAX_RETRIES`
 *   additional attempts with a small fixed backoff (`DELIVERY_RETRY_BACKOFF_MS`) — simple and
 *   synchronous, no Redis/queue (CLAUDE.md §3). A `TIMEOUT` is NEVER retried from here; it is
 *   landed in `RECONCILIATION_PENDING` and left for `reconcile()`.
 * - Creating exactly one `BillingEntry` per delivery that reaches `ACKNOWLEDGED` (via
 *   `BillingService`, itself independently idempotent).
 * - The one Lead-lifecycle transition out of `ROUTING` that each terminal/ambiguous outcome
 *   implies.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: LeadLifecycleService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    @Inject(LEAD_DELIVERY_PROVIDER) private readonly provider: LeadDeliveryProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async attemptDelivery(input: AttemptDeliveryInput): Promise<AttemptDeliveryResult> {
    const lead = await this.prisma.lead.findUnique({ where: { id: input.leadId } });
    if (!lead) throw new NotFoundException();
    const lender = await this.prisma.lender.findUnique({ where: { id: input.lenderId } });
    if (!lender) throw new NotFoundException();

    const payload: DeliveryPayloadV1 = {
      schemaVersion: DELIVERY_PAYLOAD_SCHEMA_VERSION,
      leadId: lead.id,
      lenderId: lender.id,
      routingAttemptId: input.routingAttemptId,
      contact: { email: lead.contactEmail, phone: lead.contactPhone },
      purchaseIntent: {
        timeline: lead.purchaseIntentTimeline as DeliveryPayloadV1['purchaseIntent']['timeline'],
        state: lead.purchaseIntentState,
        zip: lead.purchaseIntentZip,
        priceMin: lead.purchaseIntentPriceMin,
        priceMax: lead.purchaseIntentPriceMax,
        buyerStatus:
          lead.purchaseIntentBuyerStatus as DeliveryPayloadV1['purchaseIntent']['buyerStatus'],
      },
    };

    // The routing attempt's own id is the natural, stable idempotency key: "deliver for THIS
    // routing attempt" is a single logical request that may be retried verbatim, exactly
    // mirroring how `LeadsService.submit` treats its client-supplied `idempotencyKey`.
    const idempotencyKey = input.routingAttemptId;
    const requestHash = await sha256Hex(canonicalJsonStringify(payload));

    const existing = await this.prisma.leadDelivery.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new DomainException(ErrorCode.IdempotencyConflict, HttpStatus.CONFLICT);
      }
      this.logger.debug(`Replaying prior delivery result for idempotency key ${idempotencyKey}`);
      return { delivery: existing, replay: true };
    }

    // Persist the attempt BEFORE invoking the provider (same discipline as RoutingAttempt —
    // docs/08 §4/§6).
    const delivery = await this.prisma.leadDelivery.create({
      data: {
        leadId: lead.id,
        lenderId: lender.id,
        routingAttemptId: input.routingAttemptId,
        status: DeliveryStatus.Pending,
        payloadVersion: DELIVERY_PAYLOAD_SCHEMA_VERSION,
        idempotencyKey,
        requestHash,
      },
    });
    await this.prisma.leadEvent.create({
      data: {
        leadId: lead.id,
        eventType: 'DELIVERY_ATTEMPTED',
        correlationId: input.correlationId,
        metadata: { lenderId: lender.id, routingAttemptId: input.routingAttemptId },
      },
    });

    const maxAttempts = 1 + this.config.DELIVERY_MAX_RETRIES;
    let attempt = 0;
    let retryCount = 0;
    let final: {
      status: string;
      acknowledgedAt: Date | null;
      errorCode: string | null;
      providerCorrelationId: string | null;
    };

    while (true) {
      attempt += 1;
      const result = await this.provider.deliver(payload, {
        timeoutMs: this.config.DELIVERY_TIMEOUT_MS,
        simulateOutcome: input.simulateOutcome,
      });

      if (result.outcome === DeliveryProviderOutcome.Acknowledged) {
        final = {
          status: DeliveryStatus.Acknowledged,
          acknowledgedAt: new Date(),
          errorCode: null,
          providerCorrelationId: result.providerCorrelationId,
        };
        break;
      }
      if (result.outcome === DeliveryProviderOutcome.Rejected) {
        final = {
          status: DeliveryStatus.Rejected,
          acknowledgedAt: null,
          errorCode: result.rejectionReason ?? DeliveryRejectionReason.TechnicalFailure,
          providerCorrelationId: result.providerCorrelationId,
        };
        break;
      }
      if (result.outcome === DeliveryProviderOutcome.Timeout) {
        // Ambiguous — never retried, never silently treated as success or failure.
        final = {
          status: DeliveryStatus.ReconciliationPending,
          acknowledgedAt: null,
          errorCode: null,
          providerCorrelationId: result.providerCorrelationId,
        };
        break;
      }
      // TRANSIENT_ERROR — the only retryable category.
      if (attempt < maxAttempts) {
        retryCount += 1;
        if (this.config.DELIVERY_RETRY_BACKOFF_MS > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.DELIVERY_RETRY_BACKOFF_MS * attempt),
          );
        }
        continue;
      }
      // Retries exhausted — dead-letter/manual-review state (docs/08 §6).
      final = {
        status: DeliveryStatus.Failed,
        acknowledgedAt: null,
        errorCode: DeliveryRejectionReason.TechnicalFailure,
        providerCorrelationId: result.providerCorrelationId,
      };
      break;
    }

    const updated = await this.prisma.leadDelivery.update({
      where: { id: delivery.id },
      data: {
        status: final.status as never,
        acknowledgedAt: final.acknowledgedAt,
        errorCode: final.errorCode as never,
        providerCorrelationId: final.providerCorrelationId,
        retryCount,
      },
    });

    await this.finalizeOutcome(lead.id, lender.organizationId, updated, input.correlationId);

    return {
      delivery: {
        id: updated.id,
        status: updated.status,
        acknowledgedAt: updated.acknowledgedAt,
        errorCode: updated.errorCode,
        retryCount: updated.retryCount,
      },
      replay: false,
    };
  }

  /**
   * Resolves a `RECONCILIATION_PENDING` delivery (docs/08 §5-6: "a later reconciliation step
   * (even a simple manual/internal service method, doesn't need a UI)"). This is the ONLY way
   * out of `RECONCILIATION_PENDING` — nothing auto-retries or auto-resolves it.
   */
  async reconcile(
    deliveryId: string,
    resolution: 'ACKNOWLEDGED' | 'REJECTED',
    correlationId: string,
  ): Promise<{ id: string; status: string }> {
    const delivery = await this.prisma.leadDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException();
    if (delivery.status !== DeliveryStatus.ReconciliationPending) {
      throw new DomainException(ErrorCode.DeliveryNotReconcilable, HttpStatus.CONFLICT, {
        status: [`Delivery must be RECONCILIATION_PENDING to reconcile; was "${delivery.status}".`],
      });
    }

    const lender = await this.prisma.lender.findUnique({ where: { id: delivery.lenderId } });

    const updated = await this.prisma.leadDelivery.update({
      where: { id: deliveryId },
      data:
        resolution === 'ACKNOWLEDGED'
          ? { status: DeliveryStatus.Acknowledged, acknowledgedAt: new Date() }
          : {
              status: DeliveryStatus.Rejected,
              errorCode: DeliveryRejectionReason.TechnicalFailure,
            },
    });

    await this.prisma.leadEvent.create({
      data: {
        leadId: delivery.leadId,
        eventType: 'DELIVERY_RECONCILED',
        correlationId,
        metadata: { resolution },
      },
    });
    await this.audit.record({
      organizationId: lender?.organizationId ?? null,
      action: 'delivery.reconciled',
      outcome: 'SUCCESS',
      correlationId,
      resourceType: 'LeadDelivery',
      resourceId: deliveryId,
      metadata: { resolution },
    });

    await this.finalizeOutcome(
      delivery.leadId,
      lender?.organizationId ?? null,
      updated,
      correlationId,
    );

    return { id: updated.id, status: updated.status };
  }

  /** Shared tail for both the first-attempt path and `reconcile()`: the Lead-lifecycle
   * transition and (on success) the one billing entry. */
  private async finalizeOutcome(
    leadId: string,
    lenderOrganizationId: string | null,
    delivery: { id: string; status: string; errorCode: string | null },
    correlationId: string,
  ): Promise<void> {
    if (delivery.status === DeliveryStatus.Acknowledged) {
      await this.prisma.leadEvent.create({
        data: { leadId, eventType: 'DELIVERY_ACKNOWLEDGED', correlationId, metadata: {} },
      });
      await this.audit.record({
        organizationId: lenderOrganizationId,
        action: 'delivery.acknowledged',
        outcome: 'SUCCESS',
        correlationId,
        resourceType: 'LeadDelivery',
        resourceId: delivery.id,
        metadata: {},
      });
      await this.transitionLeadIfPossible(leadId, LeadStatus.Delivered, correlationId);
      await this.billing.createEntryForDelivery({
        leadDeliveryId: delivery.id,
        organizationId: lenderOrganizationId,
        correlationId,
      });
      return;
    }

    if (delivery.status === DeliveryStatus.Rejected || delivery.status === DeliveryStatus.Failed) {
      await this.prisma.leadEvent.create({
        data: {
          leadId,
          eventType: 'DELIVERY_REJECTED',
          correlationId,
          metadata: { errorCode: delivery.errorCode ?? 'UNKNOWN' },
        },
      });
      await this.audit.record({
        organizationId: lenderOrganizationId,
        action: 'delivery.rejected',
        outcome: 'FAILURE',
        correlationId,
        resourceType: 'LeadDelivery',
        resourceId: delivery.id,
        metadata: { errorCode: delivery.errorCode ?? 'UNKNOWN' },
      });
      await this.transitionLeadIfPossible(leadId, LeadStatus.Rejected, correlationId);
      return;
    }

    if (delivery.status === DeliveryStatus.ReconciliationPending) {
      await this.prisma.leadEvent.create({
        data: { leadId, eventType: 'DELIVERY_RECONCILIATION_PENDING', correlationId, metadata: {} },
      });
      await this.audit.record({
        organizationId: lenderOrganizationId,
        action: 'delivery.reconciliation_pending',
        outcome: 'DENIED',
        correlationId,
        resourceType: 'LeadDelivery',
        resourceId: delivery.id,
        metadata: {},
      });
      // Deliberately no lead-status transition: the lead stays in ROUTING until a human/ops
      // reconciliation step resolves this delivery (docs/08 §5-6).
    }
  }

  /** `ROUTING -> DELIVERED`/`ROUTING -> REJECTED` only apply when the lead is still in
   * `ROUTING` — guards against a double-apply if `reconcile()` is ever called more than once
   * for the same delivery (it cannot be per the status guard above, but this keeps the
   * lifecycle write itself safe-by-construction too). */
  private async transitionLeadIfPossible(
    leadId: string,
    to: LeadStatus,
    correlationId: string,
  ): Promise<void> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { status: true },
    });
    if (!lead || lead.status !== LeadStatus.Routing) return;
    await this.lifecycle.transition(leadId, LeadStatus.Routing, to, correlationId);
  }
}
