import { Controller, Get, UseGuards } from '@nestjs/common';
import type { MyMembershipResponse } from '@tech-realty-rentals/shared';
import { AuthGuard } from '../tenancy/auth.guard';
import { CurrentUser } from '../tenancy/current-user.decorator';
import type { AuthenticatedUser } from '../tenancy/types';
import { MembershipsService } from './memberships.service';

/**
 * `GET /api/v1/memberships/me` (Phase 4 addition, docs/02 §4). Deliberately `AuthGuard` only
 * -- no `TenantGuard` -- because its entire purpose is letting an authenticated user
 * discover which organization(s) they may act as *before* any `x-organization-id` context
 * exists to pass to a tenant-scoped endpoint. Still fully safe: it is hard-scoped to the
 * caller's own verified user ID (`MembershipsService.listForUser`), never a client-supplied
 * one, so it can never return another user's memberships.
 */
@Controller('memberships')
@UseGuards(AuthGuard)
export class MyMembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get('me')
  async listMine(@CurrentUser() user: AuthenticatedUser): Promise<MyMembershipResponse[]> {
    return this.memberships.listForUser(user.id);
  }
}
