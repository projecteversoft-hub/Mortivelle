import { HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/config';
import {
  computeLeadMatchToken,
  ConsentPurpose,
  ErrorCode,
  isOriginAllowed,
  LeadStatus,
  requiredPurposeForAction,
  resolveChannelForPurpose,
  sha256Hex,
  type AgentLeadSummary,
  type PaginatedResult,
  type PaginationQuery,
  type SubmitLeadRequest,
  type SubmitLeadResponse,
} from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/domain-exception';
import { AuditService } from '../audit/audit.service';
import { WidgetsService } from '../widgets/widgets.service';
import { DisclosuresService } from './disclosures.service';
import { SuppressionService } from './suppression.service';
import { ConsentService } from './consent.service';
import { LeadLifecycleService } from './lead-lifecycle.service';
import { toAgentLeadSummary } from './lead-response-mapping';

export interface SubmitLeadInput {
  body: SubmitLeadRequest;
  correlationId: string;
  originHeader: string | null;
}

/** Deterministic JSON stringification (keys sorted recursively) so the idempotency hash does
 * not depend on key insertion order (docs/04 §1, docs/08 §6). */
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

/**
 * Lead intake orchestration (docs/04 §3, docs/08 §2, docs/07 §5). The single entry point for
 * `POST /api/v1/public/leads`. See the Phase 5 final report for the full documented design
 * (dedup/HMAC, suppression behavior, idempotency, PII handling).
 */
@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly widgets: WidgetsService,
    private readonly disclosures: DisclosuresService,
    private readonly suppression: SuppressionService,
    private readonly consent: ConsentService,
    private readonly lifecycle: LeadLifecycleService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async submit(input: SubmitLeadInput): Promise<SubmitLeadResponse> {
    const { body, correlationId, originHeader } = input;
    const matchSecret = this.config.LEAD_MATCH_HMAC_SECRET;

    const widget = await this.widgets.findByPublicKeyForLeadIntake(body.widgetPublicKey);
    // Generic 404 regardless of why the key doesn't resolve — same convention as the other
    // public widget endpoints (docs/06 §4).
    if (!widget) throw new NotFoundException();

    if (originHeader && !isOriginAllowed(originHeader, widget.allowedOrigins)) {
      this.logger.warn(`Rejected lead submission for widget ${widget.id}: origin not on allowlist`);
      throw new DomainException(ErrorCode.OriginNotAllowed, HttpStatus.FORBIDDEN);
    }

    // Idempotency (docs/04 §1, docs/08 §6): checked before any business validation so a
    // retried request with an already-processed key always replays the prior outcome, even
    // if something about the wider world (e.g. the widget's status) changed meanwhile.
    const requestHash = await sha256Hex(canonicalJsonStringify(body));
    const existingKey = await this.prisma.leadIdempotencyKey.findUnique({
      where: {
        widgetId_idempotencyKey: { widgetId: widget.id, idempotencyKey: body.idempotencyKey },
      },
    });
    if (existingKey) {
      if (existingKey.requestHash !== requestHash) {
        throw new DomainException(ErrorCode.IdempotencyConflict, HttpStatus.CONFLICT);
      }
      return existingKey.responseSnapshot as unknown as SubmitLeadResponse;
    }

    // docs/06 §8 "Paused widgets stop new lead capture". This is about the widget's own
    // business state, not about any individual's data, so (unlike suppression) it is safe to
    // surface distinctly rather than folding into the neutral response.
    if (widget.status !== 'ACTIVE') {
      throw new DomainException(ErrorCode.WidgetNotActive, HttpStatus.FORBIDDEN);
    }

    // Fail-closed consent validation (docs/07 §5, docs/08 §2) — happens before any lead/
    // consent record is touched, so a rejected request leaves nothing behind.
    const requiredPurpose = requiredPurposeForAction(body.requestedAction);
    if (!body.consentSelections.includes(requiredPurpose)) {
      throw new DomainException(ErrorCode.ConsentRequired, HttpStatus.BAD_REQUEST, {
        consentSelections: [
          `requestedAction "${body.requestedAction}" requires "${requiredPurpose}" in consentSelections.`,
        ],
      });
    }
    if (body.consentSelections.includes(ConsentPurpose.RateAlerts) && !body.contact.email) {
      throw new DomainException(ErrorCode.ValidationFailed, HttpStatus.BAD_REQUEST, {
        contact: ['An email address is required to select RATE_ALERTS.'],
      });
    }

    const response = await this.processValidatedSubmission(
      body,
      widget,
      correlationId,
      matchSecret,
    );

    // Store the idempotency record last, catching a concurrent-request race on the same key.
    try {
      await this.prisma.leadIdempotencyKey.create({
        data: {
          widgetId: widget.id,
          idempotencyKey: body.idempotencyKey,
          requestHash,
          responseSnapshot: response as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
      // Another concurrent request with the same key won the race; both produced the same
      // neutral response shape, so there is nothing further to reconcile.
    }

    return response;
  }

  private async processValidatedSubmission(
    body: SubmitLeadRequest,
    widget: { id: string; organizationId: string },
    correlationId: string,
    matchSecret: string,
  ): Promise<SubmitLeadResponse> {
    const emailMatchToken = body.contact.email
      ? await computeLeadMatchToken(matchSecret, body.contact.email)
      : null;
    const phoneMatchToken = body.contact.phone
      ? await computeLeadMatchToken(matchSecret, body.contact.phone)
      : null;

    const { lead, isNew } = await this.findOrCreateLead(
      body,
      widget,
      emailMatchToken,
      phoneMatchToken,
      correlationId,
    );

    await this.ensureRelationship(lead.id, widget.organizationId);

    const selections = [...new Set(body.consentSelections)];
    const requiredPurpose = requiredPurposeForAction(body.requestedAction);
    let requiredPurposeSuppressed = false;

    for (const purpose of selections) {
      const channel = resolveChannelForPurpose(purpose, body.contact);
      const relevantToken =
        channel === 'EMAIL' ? emailMatchToken : channel === 'PHONE' ? phoneMatchToken : null;

      const suppressed = relevantToken
        ? await this.suppression.isSuppressed(relevantToken, purpose, channel)
        : false;

      if (suppressed) {
        if (purpose === requiredPurpose) requiredPurposeSuppressed = true;
        await this.prisma.leadEvent.create({
          data: {
            leadId: lead.id,
            eventType: 'SUPPRESSION_BLOCKED',
            correlationId,
            metadata: { purpose, channel },
          },
        });
        await this.audit.record({
          organizationId: widget.organizationId,
          action: 'lead.suppression_blocked',
          outcome: 'DENIED',
          correlationId,
          resourceType: 'Lead',
          resourceId: lead.id,
          metadata: { purpose, channel },
        });
        continue;
      }

      const disclosure = await this.disclosures.getActiveVersion(purpose);
      await this.consent.recordConsent({
        leadId: lead.id,
        disclosureVersionId: disclosure.id,
        purpose,
        channel,
        recipientScope: purpose === ConsentPurpose.LenderContact ? 'PLATFORM_NETWORK_LENDER' : null,
        sourceWidgetId: widget.id,
        correlationId,
        evidenceMetadata: {
          requestedAction: body.requestedAction,
          disclosureVersion: disclosure.version,
        },
      });
      await this.prisma.leadEvent.create({
        data: {
          leadId: lead.id,
          eventType: 'CONSENT_RECORDED',
          correlationId,
          metadata: { purpose, channel },
        },
      });
      await this.audit.record({
        organizationId: widget.organizationId,
        action: 'consent.recorded',
        outcome: 'SUCCESS',
        correlationId,
        resourceType: 'Lead',
        resourceId: lead.id,
        metadata: { purpose, channel, disclosureVersion: disclosure.version },
      });
    }

    // docs/08 §1: "NEW -> SUPPRESSED when a suppression match is found" — only applied when
    // the submission's PRIMARY requested purpose itself was suppressed, and only from a lead
    // that is still NEW (a lead already past NEW from a prior submission keeps its status;
    // the transition table has no path out of SUPPRESSED/NEEDS_REVIEW/CLOSED back through
    // this branch, so attempting it again would simply throw — guarded here instead of
    // relying on that throw). See the Phase 5 final report for why a secondary/optional
    // purpose being suppressed does NOT suppress the whole lead.
    if (requiredPurposeSuppressed && lead.status === LeadStatus.New) {
      await this.lifecycle.transition(
        lead.id,
        LeadStatus.New,
        LeadStatus.Suppressed,
        correlationId,
      );
    }

    await this.audit.record({
      organizationId: widget.organizationId,
      action: 'lead.captured',
      outcome: 'SUCCESS',
      correlationId,
      resourceType: 'Lead',
      resourceId: lead.id,
      metadata: { requestedAction: body.requestedAction, isNewLead: isNew },
    });

    return { received: true };
  }

  private async findOrCreateLead(
    body: SubmitLeadRequest,
    widget: { id: string; organizationId: string },
    emailMatchToken: string | null,
    phoneMatchToken: string | null,
    correlationId: string,
  ): Promise<{ lead: { id: string; status: LeadStatus }; isNew: boolean }> {
    // Dedup is scoped to the submitting widget's own organization (docs/02 §4 tenant
    // isolation, docs/03 §5 "Define conflict handling for existing leads"): Org A's
    // submission can only ever match an Org A lead, never silently attach to Org B's.
    const tokenFilters: Prisma.LeadWhereInput[] = [];
    if (emailMatchToken) tokenFilters.push({ emailMatchToken });
    if (phoneMatchToken) tokenFilters.push({ phoneMatchToken });

    const existing =
      tokenFilters.length > 0
        ? await this.prisma.lead.findFirst({
            where: { sourceOrganizationId: widget.organizationId, OR: tokenFilters },
          })
        : null;

    if (existing) {
      await this.prisma.leadEvent.create({
        data: {
          leadId: existing.id,
          eventType: 'LEAD_MATCHED_EXISTING',
          correlationId,
          metadata: { requestedAction: body.requestedAction },
        },
      });
      return { lead: { id: existing.id, status: existing.status as LeadStatus }, isNew: false };
    }

    const created = await this.prisma.lead.create({
      data: {
        contactEmail: body.contact.email ?? null,
        contactPhone: body.contact.phone ?? null,
        emailMatchToken,
        phoneMatchToken,
        status: LeadStatus.New,
        sourceWidgetId: widget.id,
        sourceOrganizationId: widget.organizationId,
        purchaseIntentTimeline: body.purchaseIntent?.timeline ?? null,
        purchaseIntentState: body.purchaseIntent?.state ?? null,
        purchaseIntentZip: body.purchaseIntent?.zip ?? null,
        purchaseIntentPriceMin: body.purchaseIntent?.priceRangeMin ?? null,
        purchaseIntentPriceMax: body.purchaseIntent?.priceRangeMax ?? null,
        // Phase 6 addition (docs/08 §4) — see packages/shared/src/leads.ts's comment on
        // `purchaseIntentSchema.buyerStatus`.
        purchaseIntentBuyerStatus: body.purchaseIntent?.buyerStatus ?? null,
      },
    });
    await this.prisma.leadEvent.create({
      data: {
        leadId: created.id,
        eventType: 'LEAD_CREATED',
        correlationId,
        metadata: { requestedAction: body.requestedAction },
      },
    });
    return { lead: { id: created.id, status: created.status as LeadStatus }, isNew: true };
  }

  private async ensureRelationship(leadId: string, organizationId: string): Promise<void> {
    const existing = await this.prisma.leadRelationship.findFirst({
      where: { leadId, organizationId, relationshipType: 'SOURCE_ORGANIZATION' },
      select: { id: true },
    });
    if (existing) return;
    try {
      await this.prisma.leadRelationship.create({
        data: { leadId, organizationId, relationshipType: 'SOURCE_ORGANIZATION' },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
      // Lost a create race against an identical, already-recorded relationship — fine.
    }
  }

  /**
   * `GET /api/v1/agent/leads` (docs/04 §2 "only records authorized for that organization").
   * Tenant visibility is resolved through `LeadRelationship`, never through `Lead.
   * sourceOrganizationId` directly — the same join Phase 6 would extend for a lender's own
   * delivered-to visibility, so this query shape does not need to change later (docs/02 §4,
   * docs/03 §3 "A lender user can access only deliveries associated with their lender
   * organization"). The response is PII-minimized by default (see lead-response-mapping.ts).
   */
  async listForOrganization(
    organizationId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<AgentLeadSummary>> {
    const relationships = await this.prisma.leadRelationship.findMany({
      where: { organizationId },
      select: { leadId: true },
    });
    const leadIds = relationships.map((r) => r.leadId);
    if (leadIds.length === 0) {
      return { items: [], total: 0, limit: pagination.limit, offset: pagination.offset };
    }

    const where: Prisma.LeadWhereInput = { id: { in: leadIds } };
    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pagination.limit,
        skip: pagination.offset,
      }),
      this.prisma.lead.count({ where }),
    ]);

    const consentRows =
      rows.length > 0
        ? await this.prisma.consentRecord.findMany({
            where: { leadId: { in: rows.map((r) => r.id) }, revokedAt: null },
            select: { leadId: true, purpose: true },
          })
        : [];
    const consentsByLead = new Map<string, Array<{ purpose: ConsentPurpose }>>();
    for (const c of consentRows) {
      const list = consentsByLead.get(c.leadId) ?? [];
      list.push({ purpose: c.purpose });
      consentsByLead.set(c.leadId, list);
    }

    return {
      items: rows.map((row) => toAgentLeadSummary(row, consentsByLead.get(row.id) ?? [])),
      total,
      limit: pagination.limit,
      offset: pagination.offset,
    };
  }
}
