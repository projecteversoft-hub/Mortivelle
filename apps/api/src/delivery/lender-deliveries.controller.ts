import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  acknowledgeDeliveryResponseSchema,
  deliveryIdParamSchema,
  LeadStatus,
  maskEmail,
  maskPhone,
  paginationQuerySchema,
  Role,
  type AcknowledgeDeliveryResponse,
  type LenderDeliveryDetail,
  type LenderDeliverySummary,
  type PaginatedResult,
  type PaginationQuery,
} from '@tech-realty-rentals/shared';
import { AuthGuard } from '../tenancy/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RolesGuard } from '../tenancy/roles.guard';
import { Roles } from '../tenancy/roles.decorator';
import { CurrentOrg } from '../tenancy/current-org.decorator';
import { CurrentUser } from '../tenancy/current-user.decorator';
import type { TenantContext, AuthenticatedUser } from '../tenancy/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LeadLifecycleService } from '../leads/lead-lifecycle.service';

/**
 * Lender-facing delivery portal (docs/04 §2, docs/10 §4, docs/11 §7). The ONLY lender-facing
 * surface this phase builds. `AuthGuard` + `TenantGuard` + `RolesGuard` mirrors
 * `AgentWidgetsController`/`AgentLeadsController` exactly, gated to `LENDER_ADMIN`/
 * `LENDER_MEMBER` instead of the agent roles.
 *
 * Tenant isolation (docs/02 §3, docs/03 §3 "A lender user can access only deliveries
 * associated with their lender organization"): every query below resolves the caller's own
 * `Lender` row from `TenantContext.organizationId` (never trusts a client-supplied lender ID)
 * and scopes every list/detail/acknowledge query to `lenderId = thatLender.id`. A delivery
 * belonging to a different lender organization — including a real delivery ID guessed from
 * another org's response — resolves identically to "not found" (404), never a distinguishing
 * 403, so this surface also never confirms another lender's existence to an IDOR attempt.
 *
 * No broad search across all platform leads (docs/10 §4): there is deliberately no filter
 * parameter here beyond pagination, and the underlying query is always scoped to the
 * caller's own lenderId.
 */
@Controller('lender/deliveries')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class LenderDeliveriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lifecycle: LeadLifecycleService,
  ) {}

  @Get()
  @Roles(Role.LenderAdmin, Role.LenderMember)
  async list(
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(paginationQuerySchema)) pagination: PaginationQuery,
  ): Promise<PaginatedResult<LenderDeliverySummary>> {
    const lender = await this.resolveLenderForOrg(org.organizationId);

    const where = { lenderId: lender.id };
    const [rows, total] = await Promise.all([
      this.prisma.leadDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pagination.limit,
        skip: pagination.offset,
        include: { lead: { select: { contactEmail: true, contactPhone: true } } },
      }),
      this.prisma.leadDelivery.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toSummary(row)),
      total,
      limit: pagination.limit,
      offset: pagination.offset,
    };
  }

  @Get(':id')
  @Roles(Role.LenderAdmin, Role.LenderMember)
  async detail(
    @CurrentOrg() org: TenantContext,
    @Param('id', new ZodValidationPipe(deliveryIdParamSchema)) id: string,
  ): Promise<LenderDeliveryDetail> {
    const lender = await this.resolveLenderForOrg(org.organizationId);
    const row = await this.prisma.leadDelivery.findFirst({
      where: { id, lenderId: lender.id },
      include: { lead: true },
    });
    if (!row) throw new NotFoundException();

    return {
      id: row.id,
      leadId: row.leadId,
      status: row.status as LenderDeliveryDetail['status'],
      payloadVersion: row.payloadVersion,
      attemptedAt: row.attemptedAt.toISOString(),
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      lenderAcknowledgedAt: row.lenderAcknowledgedAt?.toISOString() ?? null,
      errorCode: row.errorCode as LenderDeliveryDetail['errorCode'],
      createdAt: row.createdAt.toISOString(),
      contact: { email: row.lead.contactEmail, phone: row.lead.contactPhone },
      purchaseIntent: {
        timeline: row.lead
          .purchaseIntentTimeline as LenderDeliveryDetail['purchaseIntent']['timeline'],
        state: row.lead.purchaseIntentState,
        zip: row.lead.purchaseIntentZip,
        priceMin: row.lead.purchaseIntentPriceMin,
        priceMax: row.lead.purchaseIntentPriceMax,
        buyerStatus: row.lead
          .purchaseIntentBuyerStatus as LenderDeliveryDetail['purchaseIntent']['buyerStatus'],
      },
    };
  }

  /**
   * `POST /lender/deliveries/:id/acknowledge` (docs/04 §2, docs/10 §4 "idempotent and
   * auditable"). Acknowledging twice is a no-op that returns the SAME result — never an
   * error, never a second audit "change", never a second billing event (acknowledgment never
   * creates billing entries at all; only a successful adapter delivery does — see
   * `DeliveryService`/`BillingService`). This is the lender-portal's own confirmation layer,
   * distinct from (and layered on top of) the mock adapter's transmission acknowledgment —
   * see `LeadDelivery.lenderAcknowledgedAt`'s comment in schema.prisma.
   */
  @Post(':id/acknowledge')
  @Roles(Role.LenderAdmin, Role.LenderMember)
  async acknowledge(
    @CurrentOrg() org: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(deliveryIdParamSchema)) id: string,
    @Req() req: Request,
  ): Promise<AcknowledgeDeliveryResponse> {
    const lender = await this.resolveLenderForOrg(org.organizationId);
    const row = await this.prisma.leadDelivery.findFirst({ where: { id, lenderId: lender.id } });
    if (!row) throw new NotFoundException();

    const correlationId = req.requestId ?? 'unknown';

    if (row.lenderAcknowledgedAt) {
      // Idempotent no-op replay — same result, no new write, no new audit "change" event
      // (still logged at DENIED-free SUCCESS outcome is misleading for a no-op, so this path
      // is intentionally NOT re-audited; the original acknowledgment's audit event already
      // exists).
      return acknowledgeDeliveryResponseSchema.parse({
        id: row.id,
        lenderAcknowledgedAt: row.lenderAcknowledgedAt.toISOString(),
      });
    }

    const updated = await this.prisma.leadDelivery.update({
      where: { id: row.id },
      data: { lenderAcknowledgedAt: new Date() },
    });
    await this.prisma.leadEvent.create({
      data: { leadId: row.leadId, eventType: 'LENDER_ACKNOWLEDGED', correlationId, metadata: {} },
    });
    await this.audit.record({
      actorUserId: user.id,
      organizationId: org.organizationId,
      action: 'lender.delivery_acknowledged',
      outcome: 'SUCCESS',
      correlationId,
      resourceType: 'LeadDelivery',
      resourceId: row.id,
      metadata: {},
    });

    // DELIVERED -> ACCEPTED, only when the lead is still DELIVERED (safe-by-construction
    // guard, same style as DeliveryService.transitionLeadIfPossible — a lead already moved
    // on by some other path is left alone rather than forced).
    const lead = await this.prisma.lead.findUnique({
      where: { id: row.leadId },
      select: { status: true },
    });
    if (lead && lead.status === LeadStatus.Delivered) {
      await this.lifecycle.transition(
        row.leadId,
        LeadStatus.Delivered,
        LeadStatus.Accepted,
        correlationId,
      );
    }

    return acknowledgeDeliveryResponseSchema.parse({
      id: updated.id,
      lenderAcknowledgedAt: updated.lenderAcknowledgedAt!.toISOString(),
    });
  }

  private toSummary(row: {
    id: string;
    leadId: string;
    status: string;
    payloadVersion: number;
    attemptedAt: Date;
    acknowledgedAt: Date | null;
    lenderAcknowledgedAt: Date | null;
    errorCode: string | null;
    createdAt: Date;
    lead: { contactEmail: string | null; contactPhone: string | null };
  }): LenderDeliverySummary {
    return {
      id: row.id,
      leadId: row.leadId,
      status: row.status as LenderDeliverySummary['status'],
      payloadVersion: row.payloadVersion,
      maskedEmail: row.lead.contactEmail ? maskEmail(row.lead.contactEmail) : null,
      maskedPhone: row.lead.contactPhone ? maskPhone(row.lead.contactPhone) : null,
      attemptedAt: row.attemptedAt.toISOString(),
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      lenderAcknowledgedAt: row.lenderAcknowledgedAt?.toISOString() ?? null,
      errorCode: row.errorCode as LenderDeliverySummary['errorCode'],
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Resolves the caller's own `Lender` row from their active organization context — never
   * from a client-supplied lender ID (docs/02 §3). An organization with no associated
   * `Lender` row (e.g. a membership somehow granted in a non-lender org) is treated as
   * Forbidden, never as a hint about what might exist. */
  private async resolveLenderForOrg(
    organizationId: string,
  ): Promise<{ id: string; organizationId: string }> {
    const lender = await this.prisma.lender.findUnique({ where: { organizationId } });
    if (!lender) throw new ForbiddenException();
    return lender;
  }
}
