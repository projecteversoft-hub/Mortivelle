import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ConsentChannel, ConsentPurpose } from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordConsentInput {
  leadId: string;
  disclosureVersionId: string;
  purpose: ConsentPurpose;
  channel: ConsentChannel;
  recipientScope?: string | null;
  sourceWidgetId: string;
  correlationId: string;
  /** Safe metadata only — never raw contact values (CLAUDE.md §4, docs/07 §3). */
  evidenceMetadata?: Record<string, unknown>;
}

/**
 * Purpose-specific permission records (docs/07 §2-3). `recordConsent` always creates exactly
 * one new row per call — callers (`LeadsService`) are responsible for calling it once per
 * purpose selected, never once for several purposes at a time (docs/07 §2 "Do not bundle
 * optional purposes").
 *
 * `revoke` exists as a service-level capability only (no public endpoint in Phase 5 — see the
 * Phase 5 final report's documented limitation: there is no user-facing revoke flow yet,
 * since nothing downstream consumes revoked consent until Phase 6 delivery exists). It is
 * exercised directly by unit/e2e tests to prove the fail-closed behavior a future delivery
 * check would need (docs/07 §5 step 4 "Check current revocation/suppression state").
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordConsent(input: RecordConsentInput): Promise<{ id: string }> {
    const row = await this.prisma.consentRecord.create({
      data: {
        leadId: input.leadId,
        disclosureVersionId: input.disclosureVersionId,
        purpose: input.purpose,
        channel: input.channel,
        recipientScope: input.recipientScope ?? null,
        sourceWidgetId: input.sourceWidgetId,
        correlationId: input.correlationId,
        evidenceMetadata: (input.evidenceMetadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
    return { id: row.id };
  }

  async revoke(consentRecordId: string, reason: string): Promise<void> {
    await this.prisma.consentRecord.update({
      where: { id: consentRecordId },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /**
   * Fail-closed check a future delivery/communication gate would call (docs/07 §5 step 2-4):
   * covers "no consent recorded at all for this purpose/channel", "consent recorded but
   * revoked", and "consent recorded for a different purpose/channel" — every case returns
   * `false` (never implicitly `true`) unless an unrevoked record for the exact purpose
   * covers the lead. Not wired into any route yet since no Phase 5 action actually re-checks
   * consent after capture (delivery, which would, is Phase 6 scope) — exercised directly by
   * tests as a forward-looking unit of the enforcement logic.
   */
  async isPurposeCurrentlyGranted(leadId: string, purpose: ConsentPurpose): Promise<boolean> {
    const row = await this.prisma.consentRecord.findFirst({
      where: { leadId, purpose, revokedAt: null },
      select: { id: true },
    });
    return row !== null;
  }
}
