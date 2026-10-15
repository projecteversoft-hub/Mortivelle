import { z } from 'zod';
import { membershipStatusSchema, roleSchema } from './roles';

/** A single membership row as returned by the tenant-scoped membership listing endpoint. */
export const membershipResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  role: roleSchema,
  status: membershipStatusSchema,
  createdAt: z.string(),
});
export type MembershipResponse = z.infer<typeof membershipResponseSchema>;

/**
 * One of the caller's own ACTIVE memberships (`GET /api/v1/memberships/me`, added in Phase 4
 * so the agent dashboard has a way to discover which organization(s) the logged-in user may
 * act as -- nothing in Phase 1-3 ever returned this; see docs/02 §4, apps/web/src/agent).
 * Self-scoped by the caller's own verified user ID only; never another user's data.
 */
export const myMembershipResponseSchema = z.object({
  organizationId: z.string().uuid(),
  organizationName: z.string(),
  role: roleSchema,
});
export type MyMembershipResponse = z.infer<typeof myMembershipResponseSchema>;
