# Tech Realty Rentals Mortgage Platform Specification Pack

This folder is the pre-implementation specification for a first-party homebuyer and mortgage lead distribution platform.

## Review status
**Status: ALL GATES (0–7) APPROVED. Phases 1-7 are implemented and approved. The MVP implementation plan (docs/11) is complete, release-ready for a controlled staging deployment — see `docs/release-readiness-checklist.md`. Production, real lender delivery, real payments, and the items listed in docs/11 §9 (credit/income integration, ping/post auctions, SMS/calling, Redis/microservices) all remain unauthorized and require a new scoped specification, threat review, and separate approval.**

**Reminder:** all lender delivery and billing in this codebase is 100% simulated/mocked. No real lender integration, no real payment processing exists anywhere. Real lender delivery remains disabled per CLAUDE.md §4 and docs/11 Gate 6 until separately authorized.

**Compliance note:** all disclosure/consent copy introduced in Phase 5 is synthetic placeholder text, explicitly marked as such in code and UI, and MUST be replaced with qualified US counsel-reviewed language before any production use (CLAUDE.md §4, docs/07 §1).

Docker/Postgres are now available in the dev environment used so far, and all 5 migrations have been applied and verified against both a live database and a from-empty scratch database — see `docs/runbooks/02-database-migration-and-rollback.md`.

**Phase 7 update:** `apps/api`'s Vitest suite, previously blocked in this environment by a native-binding ACL issue, now runs — the fix was pinning `@swc/core` to `1.10.1` via a root-level `overrides` entry in `package.json` (a newer `@swc/core` minor version added an ACL-validated native-binding cache that this environment's Windows ACLs fail; the pinned version predates that check). `npm run test` now passes 123/123 tests across `apps/api` and `apps/web`. The 34 pre-existing `npm audit` findings have been triaged (see `docs/release-readiness-checklist.md`) — all require a major/breaking dependency bump to fix and none were applied; none are in a code path this product's runtime actually exercises for untrusted input. Playwright E2E smoke tests have been added (`apps/web/e2e/`, run via `npm run test:e2e -w @tech-realty-rentals/web`) now that Phases 3-6 ship real user-facing flows.

Known open items (tracked for a future remediation pass, not blocking a staging deployment): password hashing uses `hash-wasm` instead of native `argon2` due to a local Windows ACL issue blocking native addons; no resend-verification-email endpoint yet; the organization/membership invite flow is intentionally unspecified/deferred; **no API endpoint exists yet for consent revocation or suppression, or for a self-service "create my organization" flow** — see `docs/runbooks/05-consent-revocation-and-suppression.md` and `docs/release-readiness-checklist.md`.

## Read order
1. `CLAUDE.md` — operating instructions and hard guardrails.
2. `docs/00-product-brief-and-scope.md`
3. `docs/01-architecture-and-system-context.md`
4. `docs/02-roles-tenancy-and-access-control.md`
5. `docs/03-domain-model-and-database.md`
6. `docs/04-api-contracts-and-events.md`
7. `docs/05-homebuyer-experience-and-calculators.md`
8. `docs/06-agent-white-label-and-attribution.md`
9. `docs/07-consent-privacy-and-compliance-controls.md`
10. `docs/08-lead-lifecycle-routing-and-delivery.md`
11. `docs/09-security-testing-and-operations.md`
12. `docs/10-ui-acceptance-criteria.md`
13. `docs/11-implementation-plan-and-review-gates.md`

## Important
The platform is designed for the US mortgage ecosystem. Legal, privacy, advertising, credit-reporting, mortgage referral, and state licensing requirements must be reviewed by qualified US counsel before any real consumer data is processed or lead monetization begins.

The initial release must use mock integrations and synthetic data. Credit pulls, income verification, ping/post auctions, loan origination, and production lender transfers are out of scope until separately approved.

## Local setup (Phase 1)
Requirements: Node 22 (`.nvmrc`), npm 10, Docker (for PostgreSQL 16).

```bash
cp .env.example .env        # synthetic local values only
npm ci                      # lockfile-based install
npm run db:up               # PostgreSQL 16 via Docker Compose
npm run db:generate         # generate the Prisma client
npm run db:migrate          # apply migrations to the local database
npm run build -w @tech-realty-rentals/shared   # shared package build (required before API dev/start)
npm run dev:api             # http://localhost:3001/api/v1/health/ready
npm run dev:web             # http://localhost:5173 (proxies /api to the API)
```

Quality checks: `npm run check` (format check, lint, typecheck, tests, build).
Reset the database: `npm run db:reset` then `npm run db:migrate`.

Playwright E2E smoke tests (added in Phase 7): with both dev servers running, provision a fixture agent account once (`node apps/web/e2e/fixtures/provision-agent-fixture.mjs` — see that file for why this one manual step is currently needed), then `npm run test:e2e -w @tech-realty-rentals/web`.

## Operational runbooks and release readiness
See `docs/runbooks/` for the 8 operational runbooks (local setup/reset, migration/rollback, secret rotation, failed delivery/reconciliation, consent revocation/suppression, data access/deletion, incident response, backup/restore), `docs/observability.md` for what's queryable today, `docs/security-regression-summary.md` for the Phase 7 security regression pass, and `docs/release-readiness-checklist.md` for the Gate 7 release-readiness checklist.
