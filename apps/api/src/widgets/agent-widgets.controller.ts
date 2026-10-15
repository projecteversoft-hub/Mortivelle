import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  createWidgetRequestSchema,
  paginationQuerySchema,
  Role,
  updateWidgetRequestSchema,
  type CreateWidgetRequest,
  type PaginatedResult,
  type PaginationQuery,
  type UpdateWidgetRequest,
  type WidgetResponse,
} from '@tech-realty-rentals/shared';
import { AuthGuard } from '../tenancy/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RolesGuard } from '../tenancy/roles.guard';
import { Roles } from '../tenancy/roles.decorator';
import { CurrentOrg } from '../tenancy/current-org.decorator';
import { CurrentUser } from '../tenancy/current-user.decorator';
import type { TenantContext, AuthenticatedUser } from '../tenancy/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { WidgetsService } from './widgets.service';

const widgetIdParamSchema = z.string().uuid();

/**
 * Agent-authenticated widget management (docs/02 §2, docs/04 §2, docs/06 §2/§6).
 * `AuthGuard` + `TenantGuard` + `RolesGuard` mirrors `MembershipsController` exactly.
 *
 * Reads (`GET /agent/widgets`) are open to both `AGENT_ADMIN` and `AGENT_MEMBER` (docs/02 §2:
 * "AGENT_MEMBER: view permitted organization-level widgets"). Mutations require
 * `AGENT_ADMIN` specifically, not the full cross-tenant-type `ADMIN_ROLES` list -- a
 * lender/platform admin has no legitimate reason to manage an agent org's widget.
 *
 * Every create/update/pause is audited (docs/02 §6: "widget domain changes" is explicitly
 * high-risk), and `WidgetsService.updateForOrganization` enforces the tenant check (the
 * widget must belong to the caller's active org) before any read or write -- never just a
 * role check (docs/02 §2: "Roles are not substitutes for resource-level authorization").
 */
@Controller('agent/widgets')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class AgentWidgetsController {
  constructor(
    private readonly widgets: WidgetsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Roles(Role.AgentAdmin, Role.AgentMember)
  async list(
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(paginationQuerySchema)) pagination: PaginationQuery,
  ): Promise<PaginatedResult<WidgetResponse>> {
    return this.widgets.listForOrganization(org.organizationId, pagination);
  }

  @Post()
  @Roles(Role.AgentAdmin)
  async create(
    @CurrentOrg() org: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createWidgetRequestSchema)) body: CreateWidgetRequest,
    @Req() req: Request,
  ): Promise<WidgetResponse> {
    const widget = await this.widgets.createForOrganization(org.organizationId, body);
    await this.audit.record({
      actorUserId: user.id,
      organizationId: org.organizationId,
      action: 'widget.created',
      outcome: 'SUCCESS',
      correlationId: req.requestId ?? 'unknown',
      resourceType: 'Widget',
      resourceId: widget.id,
      metadata: { configVersion: widget.configVersion },
    });
    return widget;
  }

  @Patch(':id')
  @Roles(Role.AgentAdmin)
  async update(
    @CurrentOrg() org: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(widgetIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(updateWidgetRequestSchema)) body: UpdateWidgetRequest,
    @Req() req: Request,
  ): Promise<WidgetResponse> {
    const result = await this.widgets.updateForOrganization(org.organizationId, id, body);
    if (result.changedFields.length > 0) {
      await this.audit.record({
        actorUserId: user.id,
        organizationId: org.organizationId,
        action: this.auditActionFor(result.changedFields, body),
        outcome: 'SUCCESS',
        correlationId: req.requestId ?? 'unknown',
        resourceType: 'Widget',
        resourceId: result.widget.id,
        metadata: {
          configVersion: result.widget.configVersion,
          changedFields: result.changedFields.join(','),
        },
      });
    }
    return result.widget;
  }

  /** Precise audit-action naming (docs/02 §6 "widget domain changes" is high-risk; docs/10
   * §2 "changes are auditable"): a status flip is named explicitly, an origin-list change is
   * named explicitly (its own high-risk category), and anything else is a generic update. */
  private auditActionFor(
    changedFields: string[],
    body: UpdateWidgetRequest,
  ): 'widget.paused' | 'widget.resumed' | 'widget.origins_updated' | 'widget.updated' {
    if (changedFields.includes('status')) {
      return body.status === 'PAUSED' ? 'widget.paused' : 'widget.resumed';
    }
    if (changedFields.includes('allowedOrigins')) return 'widget.origins_updated';
    return 'widget.updated';
  }
}
