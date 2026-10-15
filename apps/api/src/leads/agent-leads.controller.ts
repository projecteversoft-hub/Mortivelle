import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  paginationQuerySchema,
  Role,
  type AgentLeadSummary,
  type PaginatedResult,
  type PaginationQuery,
} from '@tech-realty-rentals/shared';
import { AuthGuard } from '../tenancy/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RolesGuard } from '../tenancy/roles.guard';
import { Roles } from '../tenancy/roles.decorator';
import { CurrentOrg } from '../tenancy/current-org.decorator';
import type { TenantContext } from '../tenancy/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LeadsService } from './leads.service';

/**
 * Agent-authenticated lead visibility (docs/04 §2 "only records authorized for that
 * organization", docs/02 §2, docs/11 §6). `AuthGuard` + `TenantGuard` + `RolesGuard` mirrors
 * `AgentWidgetsController` exactly. Open to both `AGENT_ADMIN` and `AGENT_MEMBER` (read-only;
 * there is no mutation here — no public export endpoint exists in Phase 5, deliberately: see
 * the Phase 5 final report's documented deferral of bulk export, docs/06 §6).
 *
 * `LeadsService.listForOrganization` enforces the tenant scope itself via `LeadRelationship`
 * (never trusting a client-supplied organization ID) and returns a PII-minimized shape —
 * masked contact fields only (CLAUDE.md §4, docs/02 §3).
 */
@Controller('agent/leads')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class AgentLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @Roles(Role.AgentAdmin, Role.AgentMember)
  async list(
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(paginationQuerySchema)) pagination: PaginationQuery,
  ): Promise<PaginatedResult<AgentLeadSummary>> {
    return this.leads.listForOrganization(org.organizationId, pagination);
  }
}
