import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ErrorCode,
  LeadStatus,
  QualificationProvider,
  QualificationStatus,
  QualificationType,
} from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/domain-exception';
import { AuditService } from '../audit/audit.service';
import { LeadLifecycleService } from '../leads/lead-lifecycle.service';

export interface QualifyLeadResult {
  status: QualificationStatus;
  /** Safe, non-PII reasons only (e.g. "NO_CONTACT_ON_FILE") — never a raw contact value. */
  reasons: string[];
}

/**
 * Qualification (docs/03 §2, docs/08 §3, docs/11 §7). MVP scope, and nothing more: syntactic
 * validation of the lead's contact fields, plus an OPTIONAL mock email/phone "verification"
 * step that always simulates success (never a real send/check — CLAUDE.md §3). No credit
 * bureau or income verification exists anywhere in this service, ever.
 *
 * **Exactly what "qualification passing" means here** (documented per the Phase 6 task
 * description): the lead has at least one syntactically well-formed contact field on file
 * (a normalized, non-empty email and/or phone — re-checked here independently of the
 * intake-time validation in `leads.service.ts`, as defense in depth and to produce its own
 * auditable `QualificationRecord`). Qualification deliberately does NOT check consent/
 * permission scope at all — that is `RoutingService`'s job (docs/08 §4), kept strictly
 * separate so a lead can become `ELIGIBLE` (qualified to be *considered* for routing)
 * independently of which purpose it actually consented to; a lead with no `LENDER_CONTACT`
 * consent will still fail routing later with `CONSENT_NOT_GRANTED`, never silently delivered.
 *
 * Qualification may be run from `NEW` or `NEEDS_REVIEW` (docs/08 §1); it is NOT idempotent in
 * the delivery/billing sense — each call records a fresh `QualificationRecord` — because
 * re-running it is a legitimate, safe, side-effect-free (no money, no external send) business
 * operation, unlike delivery.
 */
@Injectable()
export class QualificationService {
  private readonly logger = new Logger(QualificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: LeadLifecycleService,
    private readonly audit: AuditService,
  ) {}

  async qualify(leadId: string, correlationId: string): Promise<QualifyLeadResult> {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException();

    if (lead.status !== LeadStatus.New && lead.status !== LeadStatus.NeedsReview) {
      throw new DomainException(ErrorCode.LeadNotInExpectedStatus, HttpStatus.CONFLICT, {
        status: [`Lead must be NEW or NEEDS_REVIEW to qualify; was "${lead.status}".`],
      });
    }

    const hasEmail = Boolean(lead.contactEmail && lead.contactEmail.includes('@'));
    const hasPhone = Boolean(lead.contactPhone && lead.contactPhone.replace(/\D/g, '').length >= 7);
    const contactFormatValid = hasEmail || hasPhone;

    await this.prisma.qualificationRecord.create({
      data: {
        leadId,
        type: QualificationType.ContactFormat,
        provider: QualificationProvider.SyntacticValidator,
        status: contactFormatValid ? QualificationStatus.Passed : QualificationStatus.Failed,
        completedAt: new Date(),
        resultSummary: { hasEmail, hasPhone },
        correlationId,
      },
    });

    if (!contactFormatValid) {
      await this.prisma.leadEvent.create({
        data: {
          leadId,
          eventType: 'QUALIFICATION_FAILED',
          correlationId,
          metadata: { reason: 'NO_VALID_CONTACT' },
        },
      });
      await this.audit.record({
        organizationId: lead.sourceOrganizationId,
        action: 'lead.qualification_failed',
        outcome: 'DENIED',
        correlationId,
        resourceType: 'Lead',
        resourceId: leadId,
        metadata: { reason: 'NO_VALID_CONTACT' },
      });
      return { status: QualificationStatus.Failed, reasons: ['NO_VALID_CONTACT'] };
    }

    // Optional mock contact verification (docs/08 §3) — always simulates success; never a
    // real send/check (CLAUDE.md §3, §7).
    if (hasEmail) {
      await this.prisma.qualificationRecord.create({
        data: {
          leadId,
          type: QualificationType.EmailVerification,
          provider: QualificationProvider.MockEmailVerification,
          status: QualificationStatus.Passed,
          completedAt: new Date(),
          resultSummary: { simulated: true },
          correlationId,
        },
      });
    }
    if (hasPhone) {
      await this.prisma.qualificationRecord.create({
        data: {
          leadId,
          type: QualificationType.PhoneVerification,
          provider: QualificationProvider.MockPhoneVerification,
          status: QualificationStatus.Passed,
          completedAt: new Date(),
          resultSummary: { simulated: true },
          correlationId,
        },
      });
    }

    await this.lifecycle.transition(
      leadId,
      lead.status as LeadStatus,
      LeadStatus.Eligible,
      correlationId,
    );
    await this.prisma.leadEvent.create({
      data: { leadId, eventType: 'QUALIFICATION_PASSED', correlationId, metadata: {} },
    });
    await this.audit.record({
      organizationId: lead.sourceOrganizationId,
      action: 'lead.qualified',
      outcome: 'SUCCESS',
      correlationId,
      resourceType: 'Lead',
      resourceId: leadId,
      metadata: {},
    });

    return { status: QualificationStatus.Passed, reasons: [] };
  }
}
