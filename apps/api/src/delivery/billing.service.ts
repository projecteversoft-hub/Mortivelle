import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BillingEventType,
  SIMULATED_LEAD_DELIVERY_FEE_AMOUNT_CENTS,
  SIMULATED_LEAD_DELIVERY_FEE_CURRENCY,
} from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface BillingEntryRow {
  id: string;
  leadDeliveryId: string;
  eventType: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: Date;
}

/**
 * Simulated billing ledger (docs/03 §2, docs/08 §8, docs/11 §7). No real payment processor is
 * integrated — `externalReference` is always `null` (CLAUDE.md §3, §7).
 *
 * **The billing-idempotency guarantee**: `createEntryForDelivery` is called by
 * `DeliveryService` exactly once per delivery-attempt that reaches `ACKNOWLEDGED` (the one
 * documented "eligible billable event" in this phase — docs/08 §8), and it is itself
 * idempotent on `leadDeliveryId`: the very first call inserts the row; every subsequent call
 * for the SAME `leadDeliveryId` (whether from a genuine retry of an already-acknowledged
 * delivery, a re-dispatched reconciliation, or any other code path) hits the
 * `BillingEntry.leadDeliveryId` UNIQUE constraint, catches the resulting `P2002` the same way
 * `leads.service.ts`'s `ensureRelationship` does, and returns the EXISTING row unchanged
 * rather than creating a second one. This makes "no duplicate charge" a database-enforced
 * invariant, not merely a service-layer promise — see the Phase 6 final report's proof test
 * (`test/delivery.e2e.test.ts`, "no duplicate charge").
 *
 * Adjustments (credits/corrections) are explicitly OUT of scope for this phase — see the
 * final report's documented deviation. If/when built, they must be new ledger rows
 * referencing the original, never edits or deletes (docs/08 §8, docs/03 §3).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createEntryForDelivery(input: {
    leadDeliveryId: string;
    organizationId?: string | null;
    correlationId: string;
  }): Promise<{ entry: BillingEntryRow; created: boolean }> {
    try {
      const entry = await this.prisma.billingEntry.create({
        data: {
          leadDeliveryId: input.leadDeliveryId,
          eventType: BillingEventType.LeadDeliveryFee,
          amountCents: SIMULATED_LEAD_DELIVERY_FEE_AMOUNT_CENTS,
          currency: SIMULATED_LEAD_DELIVERY_FEE_CURRENCY,
          status: 'POSTED',
          externalReference: null,
        },
      });
      await this.prisma.leadEvent.create({
        data: {
          leadId: await this.leadIdForDelivery(input.leadDeliveryId),
          eventType: 'BILLING_ENTRY_CREATED',
          correlationId: input.correlationId,
          metadata: { amountCents: entry.amountCents, currency: entry.currency },
        },
      });
      await this.audit.record({
        organizationId: input.organizationId ?? null,
        action: 'billing.entry_created',
        outcome: 'SUCCESS',
        correlationId: input.correlationId,
        resourceType: 'BillingEntry',
        resourceId: entry.id,
        metadata: { leadDeliveryId: input.leadDeliveryId, amountCents: entry.amountCents },
      });
      return { entry, created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.billingEntry.findUnique({
          where: { leadDeliveryId: input.leadDeliveryId },
        });
        if (existing) {
          this.logger.debug(
            `Billing entry already exists for delivery ${input.leadDeliveryId} — not duplicated.`,
          );
          return { entry: existing, created: false };
        }
      }
      throw error;
    }
  }

  private async leadIdForDelivery(leadDeliveryId: string): Promise<string> {
    const delivery = await this.prisma.leadDelivery.findUnique({
      where: { id: leadDeliveryId },
      select: { leadId: true },
    });
    if (!delivery) throw new Error('leadDelivery not found when recording billing event');
    return delivery.leadId;
  }
}
