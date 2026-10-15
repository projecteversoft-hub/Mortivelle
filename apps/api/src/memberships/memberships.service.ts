import { Injectable } from '@nestjs/common';
import type {
  MembershipResponse,
  MyMembershipResponse,
  PaginatedResult,
  PaginationQuery,
} from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedService } from '../common/tenant-scoped.service';

/**
 * Proves the tenant-scoped repository pattern (CLAUDE.md §4, docs/02 §4): every query here
 * goes through `scopedWhere`, so `organizationId` can never be silently dropped from the
 * filter. `organizationId` must come from the caller's verified TenantContext
 * (TenantGuard) — this service has no way to know it otherwise.
 */
@Injectable()
export class MembershipsService extends TenantScopedService {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForOrganization(
    organizationId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<MembershipResponse>> {
    const where = this.scopedWhere(organizationId, {});
    const [rows, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pagination.limit,
        skip: pagination.offset,
      }),
      this.prisma.membership.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        organizationId: row.organizationId,
        role: row.role,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      limit: pagination.limit,
      offset: pagination.offset,
    };
  }

  /**
   * The caller's own ACTIVE memberships, for the agent dashboard's login-to-org-selection
   * flow (Phase 4; see packages/shared/src/memberships.ts). Filtered only by the already-
   * verified `userId` from AuthGuard -- never a client-supplied value -- so this can never
   * return another user's memberships.
   */
  async listForUser(userId: string): Promise<MyMembershipResponse[]> {
    const rows = await this.prisma.membership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { organization: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      organizationId: row.organizationId,
      organizationName: row.organization.name,
      role: row.role,
    }));
  }
}
