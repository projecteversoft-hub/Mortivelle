import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  reportsSummaryQuerySchema,
  Role,
  type ReportsSummaryQuery,
  type ReportsSummaryResponse,
} from '@tech-realty-rentals/shared';
import { AuthGuard } from '../tenancy/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RolesGuard } from '../tenancy/roles.guard';
import { Roles } from '../tenancy/roles.decorator';
import { CurrentOrg } from '../tenancy/current-org.decorator';
import type { TenantContext } from '../tenancy/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WidgetsService } from './widgets.service';

/**
 * Aggregated attribution analytics scoped to the caller's own organization (docs/04 §2,
 * docs/06 §6 "Review aggregated traffic", docs/10 §2 "Agent sees aggregated analytics scoped
 * to their organization"). Open to `AGENT_ADMIN` and `AGENT_MEMBER` alike (docs/02 §2) --
 * this is read-only aggregate reporting, not widget configuration.
 */
@Controller('agent/reports')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class AgentReportsController {
  constructor(private readonly widgets: WidgetsService) {}

  @Get('summary')
  @Roles(Role.AgentAdmin, Role.AgentMember)
  async summary(
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(reportsSummaryQuerySchema)) query: ReportsSummaryQuery,
  ): Promise<ReportsSummaryResponse> {
    return this.widgets.reportsSummary(org.organizationId, query.windowDays);
  }
}
