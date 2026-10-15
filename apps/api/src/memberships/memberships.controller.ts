import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ADMIN_ROLES,
  paginationQuerySchema,
  type MembershipResponse,
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
import { AuditService } from '../audit/audit.service';
import { MembershipsService } from './memberships.service';

/**
 * The one real protected, tenant-scoped example endpoint (docs/11 §3 Phase 2 task list):
 * proves AuthGuard + TenantGuard + RolesGuard + the tenant-scoped service pattern together,
 * and is the target of the mandatory cross-tenant IDOR test suite (docs/02 §3).
 */
@Controller('orgs/me')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class MembershipsController {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly audit: AuditService,
  ) {}

  @Get('members')
  @Roles(...ADMIN_ROLES)
  async listMembers(
    @CurrentOrg() org: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Query(new ZodValidationPipe(paginationQuerySchema)) pagination: PaginationQuery,
  ): Promise<PaginatedResult<MembershipResponse>> {
    const result = await this.memberships.listForOrganization(org.organizationId, pagination);
    await this.audit.record({
      actorUserId: user.id,
      organizationId: org.organizationId,
      action: 'membership.list',
      outcome: 'SUCCESS',
      correlationId: req.requestId ?? 'unknown',
      resourceType: 'Membership',
      metadata: { count: result.items.length, total: result.total },
    });
    return result;
  }
}
