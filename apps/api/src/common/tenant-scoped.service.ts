/**
 * Base for services that own tenant-scoped (per-organization) Prisma queries/mutations
 * (docs/02 §4, CLAUDE.md §4: "Tenant isolation must be enforced in the service layer for
 * every tenant-owned query and mutation"). `scopedWhere` forces every call site to pass an
 * explicit, non-empty `organizationId` — sourced only from the already-verified
 * `TenantContext` (TenantGuard), never from an arbitrary client field — so a tenant filter
 * can never be silently omitted from a `where` clause. This is a code-level convention, not
 * a database-level control: Prisma middleware/RLS remain defense-in-depth only (docs/02 §4).
 */
export abstract class TenantScopedService {
  protected scopedWhere<T extends Record<string, unknown>>(
    organizationId: string,
    where: T,
  ): T & { organizationId: string } {
    if (!organizationId || typeof organizationId !== 'string') {
      throw new Error('organizationId is required for a tenant-scoped query');
    }
    return { ...where, organizationId };
  }
}
