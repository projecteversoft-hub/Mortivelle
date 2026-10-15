# Runbook — Database Migration and Rollback Strategy

## Current migrations (`apps/api/prisma/migrations/`)
1. `20261014000000_init_identity_tenancy`
2. `20261015000000_add_auth_sessions_and_audit`
3. `20261016000000_add_widgets_and_attribution`
4. `20261017000000_add_leads_and_consent`
5. `20261018000000_add_delivery_routing_and_billing`

Prisma tracks applied migrations in `_prisma_migrations`. There is no down-migration tooling configured (Prisma Migrate does not generate reverse migrations automatically).

## Applying migrations
- Local/staging: `npm run db:migrate` (= `prisma migrate deploy -w @tech-realty-rentals/api`). This only applies pending migrations; it never generates new ones and never drops data.
- **Never** run `prisma migrate dev` against a shared/staging database — it can prompt for destructive resets when it detects drift. `migrate dev` is for local schema-authoring only.

## Verified in Phase 7 (2026-10-15): fresh-from-empty apply
A throwaway container was started (`docker run ... postgres:16-alpine`, a database never touched by any prior migration), and `prisma migrate deploy` was pointed at it via `DATABASE_URL`:
```
Applying migration `20261014000000_init_identity_tenancy`
Applying migration `20261015000000_add_auth_sessions_and_audit`
Applying migration `20261016000000_add_widgets_and_attribution`
Applying migration `20261017000000_add_leads_and_consent`
Applying migration `20261018000000_add_delivery_routing_and_billing`
All migrations have been successfully applied.
```
`prisma migrate status` afterward reported "Database schema is up to date!" and the resulting schema had 23 tables (22 application tables + `_prisma_migrations`), matching the long-lived dev database. This confirms the full migration chain is replayable from empty, not just incrementally — this had never been verified end-to-end before this phase. The scratch container was removed after the test (`docker rm -f eversoft-migrate-scratch`).

## Rollback strategy (no automated down-migrations exist)
Because there is no generated rollback SQL, treat rollback as one of:
1. **Forward fix** (preferred): write a new migration that corrects the problem, rather than reversing the old one. This is the only supported path for a database that already has production-shaped data in it.
2. **Restore from backup**: for a destructive/broken migration caught quickly in staging, restore the most recent verified backup (see `docs/runbooks/08-backup-restore-validation.md`) rather than attempting a manual reverse migration.
3. **Manual reverse SQL**: only for schema-only changes (no destructive column/table drops) applied minutes ago with zero or synthetic data — write and review the reverse DDL by hand before running it, outside of Prisma's migration history (do not edit `_prisma_migrations` directly).

There is no automated CI gate today that diff-checks a migration against the live schema before deploy; `prisma migrate status` should be run manually in each environment before `migrate deploy`.

## Constraint checks worth re-running after any migration change
- `billing_entries.lead_delivery_id` is `@unique` in `prisma/schema.prisma` (line ~739) — this is the DB-level guarantee against double-billing a delivery (docs/08, Phase 6 acceptance). Re-verified present after the from-empty migration test in this phase via `\d billing_entries` showing the unique index.
- Every FK from a lead-owned table (`consent_records`, `lead_events`, `lead_relationships`, `qualification_records`, `routing_attempts`, `lead_deliveries`) back to `leads.id` is `ON DELETE RESTRICT`. See `docs/runbooks/06-data-access-and-deletion-requests.md` for why this matters operationally.
