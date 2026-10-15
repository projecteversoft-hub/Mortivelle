import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode } from '@tech-realty-rentals/shared';
import { DomainException } from '../common/domain-exception';
import { PrismaService } from '../prisma/prisma.service';

export const ORGANIZATION_HEADER = 'x-organization-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the request's tenant context from an existing, ACTIVE Membership row — the
 * client-supplied `X-Organization-Id` header is only a *selector* (which of the caller's
 * own memberships to act as), never proof of authorization by itself (docs/02 §3-4). Must
 * run after AuthGuard (needs `req.user`).
 *
 * A header naming an organization the caller does not belong to — including a real org ID
 * belonging to another tenant — is rejected identically to a non-existent org ID (plain
 * 403, no DomainException detail), so this endpoint never confirms or denies another
 * tenant's existence to an IDOR attempt.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) {
      // Programmer error: TenantGuard used without AuthGuard. Fail closed.
      throw new ForbiddenException();
    }

    const organizationId = req.header(ORGANIZATION_HEADER);
    if (!organizationId || !UUID_PATTERN.test(organizationId)) {
      throw new DomainException(ErrorCode.OrganizationContextRequired, HttpStatus.BAD_REQUEST);
    }

    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: req.user.id, organizationId } },
      select: { role: true, status: true },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException();
    }

    req.tenant = { organizationId, role: membership.role };
    return true;
  }
}
