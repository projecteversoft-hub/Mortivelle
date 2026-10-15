import { z } from 'zod';

/**
 * Mirrors the Prisma `Role` enum (apps/api/prisma/schema.prisma). Kept as a plain literal
 * union here (not imported from @prisma/client) so packages/shared has no Prisma/DB
 * dependency. Keep in sync with the Prisma enum by hand; a schema test in apps/api
 * guards against drift.
 */
export const Role = {
  PlatformAdmin: 'PLATFORM_ADMIN',
  PlatformSupport: 'PLATFORM_SUPPORT',
  AgentAdmin: 'AGENT_ADMIN',
  AgentMember: 'AGENT_MEMBER',
  LenderAdmin: 'LENDER_ADMIN',
  LenderMember: 'LENDER_MEMBER',
  ComplianceReviewer: 'COMPLIANCE_REVIEWER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const roleSchema = z.enum([
  Role.PlatformAdmin,
  Role.PlatformSupport,
  Role.AgentAdmin,
  Role.AgentMember,
  Role.LenderAdmin,
  Role.LenderMember,
  Role.ComplianceReviewer,
]);

export const membershipStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']);
export type MembershipStatusValue = z.infer<typeof membershipStatusSchema>;

/** Admin-tier roles authorized to manage their own organization's membership. */
export const ADMIN_ROLES: readonly Role[] = [Role.PlatformAdmin, Role.AgentAdmin, Role.LenderAdmin];
