import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BuyerStatus,
  ConsentPurpose,
  DeliveryProviderOutcome,
  ErrorCode,
  LeadStatus,
  RoutingAttemptStatus,
  RoutingFailureReason,
  evaluateRoutingEligibility,
  type RoutingEligibilityConditions,
} from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/domain-exception';
import { AuditService } from '../audit/audit.service';
import { LeadLifecycleService } from '../leads/lead-lifecycle.service';
import { ConsentService } from '../leads/consent.service';
import { DeliveryService } from './delivery.service';

export interface RouteLeadResult {
  routingAttemptId: string;
  status: RoutingAttemptStatus;
  failureReason?: RoutingFailureReason;
  lenderId?: string;
  deliveryId?: string;
  deliveryStatus?: string;
}

/**
 * Exclusive routing (docs/03 §2, docs/08 §4, docs/11 §7). Given an `ELIGIBLE` lead:
 * 1. Finds every ACTIVE `RoutingPolicy` whose lender is also ACTIVE, evaluates the pure
 *    `evaluateRoutingEligibility` match against the lead's non-sensitive attributes
 *    (territory/price/buyer-status ONLY — never a protected trait, because the schema
 *    structurally cannot encode one), and picks the highest-`priority` match (ties broken by
 *    the earliest-created policy, so the tie-break is itself deterministic and auditable, not
 *    arbitrary).
 * 2. Confirms the matched lender's SIMULATED contract approval (`contractApprovedAt`).
 * 3. Confirms `ConsentService.isPurposeCurrentlyGranted(leadId, LENDER_CONTACT)` — fail
 *    closed: a missing OR revoked consent blocks routing identically.
 * 4. Persists the `RoutingAttempt` BEFORE calling `DeliveryService` — true even for every
 *    FAILURE branch above: a routing attempt that never reaches step 4 (no match / lender not
 *    approved / consent denied) still gets its own `RoutingAttempt` row, so every outcome is
 *    traceable (docs/11 §7 acceptance criterion), not just the successful path.
 *
 * None of the three failure branches changes the lead's status — it stays `ELIGIBLE`,
 * documented in packages/shared/src/leads.ts, so a later retry (consent re-granted, a new
 * policy added, a lender approved) remains possible without manual intervention.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: LeadLifecycleService,
    private readonly consent: ConsentService,
    private readonly delivery: DeliveryService,
    private readonly audit: AuditService,
  ) {}

  async routeEligibleLead(
    leadId: string,
    correlationId: string,
    options: { simulateOutcome?: DeliveryProviderOutcome } = {},
  ): Promise<RouteLeadResult> {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException();
    if (lead.status !== LeadStatus.Eligible) {
      throw new DomainException(ErrorCode.LeadNotInExpectedStatus, HttpStatus.CONFLICT, {
        status: [`Lead must be ELIGIBLE to route; was "${lead.status}".`],
      });
    }

    const match = await this.findMatchingPolicy(leadId, lead);

    if (!match) {
      return this.recordFailedAttempt(leadId, correlationId, {
        failureReason: RoutingFailureReason.NoEligiblePolicy,
      });
    }

    if (match.lender.status !== 'ACTIVE' || !match.lender.contractApprovedAt) {
      return this.recordFailedAttempt(leadId, correlationId, {
        failureReason: RoutingFailureReason.LenderNotApproved,
        routingPolicyId: match.policy.id,
        policyVersion: match.policy.version,
        lenderId: match.lender.id,
      });
    }

    // Fail-closed consent check (docs/08 §4, docs/07 §5) — the single most important gate in
    // this service. A revoked or never-granted LENDER_CONTACT consent blocks routing
    // identically; ConsentService.isPurposeCurrentlyGranted never returns true unless an
    // unrevoked record for exactly this purpose covers this lead.
    const consentGranted = await this.consent.isPurposeCurrentlyGranted(
      leadId,
      ConsentPurpose.LenderContact,
    );
    if (!consentGranted) {
      return this.recordFailedAttempt(leadId, correlationId, {
        failureReason: RoutingFailureReason.ConsentNotGranted,
        routingPolicyId: match.policy.id,
        policyVersion: match.policy.version,
        lenderId: match.lender.id,
      });
    }

    // All checks passed — persist the RoutingAttempt BEFORE calling the delivery adapter
    // (docs/08 §4 "Persist routing attempt before sending").
    const attempt = await this.prisma.routingAttempt.create({
      data: {
        leadId,
        routingPolicyId: match.policy.id,
        policyVersion: match.policy.version,
        lenderId: match.lender.id,
        status: RoutingAttemptStatus.Pending,
        idempotencyKey: randomUUID(),
        correlationId,
      },
    });

    await this.lifecycle.transition(leadId, LeadStatus.Eligible, LeadStatus.Routing, correlationId);
    await this.prisma.leadEvent.create({
      data: {
        leadId,
        eventType: 'ROUTING_STARTED',
        correlationId,
        metadata: { lenderId: match.lender.id, routingPolicyId: match.policy.id },
      },
    });
    await this.audit.record({
      organizationId: match.lender.organizationId,
      action: 'routing.started',
      outcome: 'SUCCESS',
      correlationId,
      resourceType: 'RoutingAttempt',
      resourceId: attempt.id,
      metadata: { lenderId: match.lender.id, routingPolicyId: match.policy.id },
    });

    await this.prisma.routingAttempt.update({
      where: { id: attempt.id },
      data: { status: RoutingAttemptStatus.Dispatched, completedAt: new Date() },
    });

    const deliveryResult = await this.delivery.attemptDelivery({
      leadId,
      lenderId: match.lender.id,
      routingAttemptId: attempt.id,
      correlationId,
      simulateOutcome: options.simulateOutcome,
    });

    return {
      routingAttemptId: attempt.id,
      status: RoutingAttemptStatus.Dispatched,
      lenderId: match.lender.id,
      deliveryId: deliveryResult.delivery.id,
      deliveryStatus: deliveryResult.delivery.status,
    };
  }

  private async findMatchingPolicy(
    leadId: string,
    lead: {
      purchaseIntentState: string | null;
      purchaseIntentPriceMin: number | null;
      purchaseIntentPriceMax: number | null;
      purchaseIntentBuyerStatus: string | null;
    },
  ): Promise<{
    policy: { id: string; version: number; priority: number; createdAt: Date };
    lender: { id: string; organizationId: string; status: string; contractApprovedAt: Date | null };
  } | null> {
    const policies = await this.prisma.routingPolicy.findMany({
      where: { status: 'ACTIVE' },
      include: { lender: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    const attributes = {
      state: lead.purchaseIntentState,
      priceMin: lead.purchaseIntentPriceMin,
      priceMax: lead.purchaseIntentPriceMax,
      buyerStatus:
        (lead.purchaseIntentBuyerStatus as BuyerStatus | null) ?? BuyerStatus.Unspecified,
    };

    for (const policy of policies) {
      const conditions = policy.eligibilityConditions as unknown as RoutingEligibilityConditions;
      if (evaluateRoutingEligibility(conditions, attributes)) {
        this.logger.debug(
          `Lead ${leadId} matched routing policy ${policy.id} (priority ${policy.priority})`,
        );
        return { policy, lender: policy.lender };
      }
    }
    return null;
  }

  private async recordFailedAttempt(
    leadId: string,
    correlationId: string,
    input: {
      failureReason: RoutingFailureReason;
      routingPolicyId?: string;
      policyVersion?: number;
      lenderId?: string;
    },
  ): Promise<RouteLeadResult> {
    const attempt = await this.prisma.routingAttempt.create({
      data: {
        leadId,
        routingPolicyId: input.routingPolicyId ?? null,
        policyVersion: input.policyVersion ?? null,
        lenderId: input.lenderId ?? null,
        status: RoutingAttemptStatus.Failed,
        failureReason: input.failureReason,
        idempotencyKey: randomUUID(),
        correlationId,
        completedAt: new Date(),
      },
    });
    await this.prisma.leadEvent.create({
      data: {
        leadId,
        eventType: 'ROUTING_FAILED',
        correlationId,
        metadata: { failureReason: input.failureReason },
      },
    });
    await this.audit.record({
      organizationId: null,
      action: 'routing.failed',
      outcome: 'DENIED',
      correlationId,
      resourceType: 'RoutingAttempt',
      resourceId: attempt.id,
      metadata: { failureReason: input.failureReason },
    });
    return {
      routingAttemptId: attempt.id,
      status: RoutingAttemptStatus.Failed,
      failureReason: input.failureReason,
      lenderId: input.lenderId,
    };
  }
}
