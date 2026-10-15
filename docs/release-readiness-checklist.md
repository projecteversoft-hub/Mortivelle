# Release-Readiness Checklist — Gate 7 (docs/11 §8)

Maps directly to docs/11 §8's acceptance criterion: "release-readiness checklist is satisfied for a controlled staging deployment." Every item below is checked against real evidence produced in Phase 7 (2026-10-15), not assumed. This checklist determines readiness for a **controlled staging deployment only** — never production, and never real consumer data or live lender delivery, per docs/11 §8/§9 and CLAUDE.md §8.

Legend: ✅ done, with evidence — ⚠️ partial / documented gap, not blocking — ❌ not done, flag for reviewer decision.

## Engineering quality gates
- ✅ **Format/lint clean** — `npm run format:check` and `npm run lint` both pass with zero issues, repo-wide, as of this phase.
- ✅ **Typecheck clean** — `npm run typecheck` passes for `packages/shared`, `apps/api`, `apps/web`.
- ✅ **Full automated test suite runs and passes** — `npm run test`: **123/123 tests pass** (apps/api: 14 files / 105 tests; apps/web: 3 files / 18 tests). This is the first time the apps/api suite has ever actually executed, across all 6 prior phases — see "Known issues" below for the fix that made this possible.
- ✅ **Build succeeds** — `npm run build` succeeds for all three workspaces; `apps/web` emits `index.html`, `embed.html`, `agent.html` as separate bundles.
- ✅ **Migration-from-empty verified** — all 5 Prisma migrations apply cleanly in sequence against a fresh, never-migrated Postgres container; `prisma migrate status` reports clean. See `docs/runbooks/02-database-migration-and-rollback.md`.
- ✅ **E2E/Playwright smoke suite added and passing** — 9/9 tests across calculator journey, embed widget rendering + computation + lead capture, agent dashboard login + widget creation, and an API-only smoke check for the UI-less ops/lender routes. Re-run twice for stability; both runs green. See `apps/web/e2e/` and `docs/*` references below.

## Security
- ✅ **Security headers reviewed against docs/09 §1** — `helmet()` defaults produce CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, etc. on every API response (verified via live `curl -I`). CSP's `frame-ancestors 'self'` only applies to API JSON responses, which are never framed directly — confirmed no functional conflict with the widget-embed use case, because the actual framed document (`embed.html`) is served by the web app, which currently sets no frame-blocking headers at all (confirmed live). **Flag for staging deployment**: whatever hosts `apps/web` in staging must not have a platform default that adds `X-Frame-Options: DENY` or a restrictive `frame-ancestors`, or third-party widget embedding will silently break. No staging hosting config exists yet to check this against.
- ✅ **Rate limiting reviewed** — every docs/09 §1-required bucket (login/reset, public widgets, lead intake, calculators, analytics) exists and is centrally registered (`apps/api/src/rate-limit/rate-limit.module.ts`), live-confirmed via a real 429 during this phase's own testing. Authenticated-only endpoints (lender portal, ops, agent widget management) have no bucket — reviewed and judged acceptable for this spec's stated scope (docs/09 §1 only requires the five above), but flagged as a residual hardening opportunity, not a blocker. See `docs/security-regression-summary.md` §3.
- ✅ **Security regression pass completed** — see `docs/security-regression-summary.md`: CSRF guard, password-reset enumeration, cross-tenant IDOR, widget origin spoofing, and the billing-duplicate DB constraint all re-verified live, no regressions found.
- ⚠️ **Dependency vulnerability triage** — `npm audit`: 34 pre-existing findings (4 low, 14 moderate, 14 high, 2 critical), unchanged since Gate 1. Triaged this phase (not just re-counted):
  - **Zero can be fixed without a breaking/major dependency bump** — `npm audit fix` (non-force) was run and changed nothing; every finding's only available fix requires `@nestjs/core`/`@nestjs/platform-express`/`@nestjs/testing` 10.x→12.x, `@nestjs/cli` 10.x→12.x, `vitest` 2.x→5.x, or `tailwindcss` 3.x→4.x — all explicitly gated behind approval per CLAUDE.md §9 ("Never install new major dependencies... without explaining why and receiving approval"). None were applied.
  - **Production-exposed** (apps/api's actual runtime dependency graph): `@nestjs/core`, `@nestjs/platform-express`, `body-parser`, `multer`, `file-type` (via `@nestjs/common`), `qs` — 6 package families, all moderate/high severity, all requiring the NestJS 10→12 bump to fix.
  - **DevDependency-only** (no production exposure): the remaining ~15 package families — `vitest`/`@vitest/mocker`/`tinypool`/`vite`/`vite-node`/`esbuild` (test/dev-server tooling), `@nestjs/cli` and its own `@angular-devkit`/`ajv`/`webpack`/`inquirer`/`tmp`/`glob`/`picomatch`/`chokidar`/`braces`/`micromatch` toolchain (code-gen CLI, never shipped), `tailwindcss`/`postcss-selector-parser`/`postcss-nested`/`fast-glob` (CSS build-time only).
  - **Recommendation**: accept-risk for this staging gate (none are exploitable through a code path this product's runtime actually uses for untrusted input — `multer`/`file-type` in particular are present only because `@nestjs/platform-express`/`@nestjs/common` bundle them; this product has no file-upload endpoint). Revisit the NestJS 10→12 upgrade path as its own explicitly-approved, scoped piece of work before any production consideration, since it also touches `@nestjs/testing` and would need the full suite re-run.
- ✅ **CORS/widget-origin controls verified** — live-tested this phase: attacker origin gets no `Access-Control-Allow-Origin` reflected; allowed origin does.

## Backups and data durability
- ✅ **Backup/restore procedure defined and actually tested** — real `pg_dump`/`pg_restore` cycle against the live dev database into a disposable scratch container; all 6 key-table row counts matched exactly (organizations, leads, lead_deliveries, billing_entries, users, audit_events). See `docs/runbooks/08-backup-restore-validation.md` for exact commands and output.
- ❌ **No automated/scheduled backup job** — today this is a manual runbook procedure only. Not built this phase (explicitly out of scope — operational automation, not a hardening/documentation task); required before any production consideration.

## Privacy / retention / access
- ⚠️ **Data access request**: fulfillable only via manual, non-product-surfaced `psql` queries (no export API). Walked through for a real synthetic lead this phase — see `docs/runbooks/06-data-access-and-deletion-requests.md`.
- ⚠️ **Data deletion request**: **cannot currently be fulfilled via a literal `DELETE`** — every FK from a lead-owned table to `leads.id` is `ON DELETE RESTRICT` (confirmed via `pg_constraint`), and `audit_events`/`billing_entries` retention is an unresolved legal-hold-vs-deletion tension (docs/07 §8) with no documented resolution. Manual procedure exists (see the same runbook) but requires a per-request legal/compliance judgment call this repository cannot make on its own.
- ⚠️ **Consent revocation / suppression**: no API endpoint exists for either (`ConsentService.revoke` and any `suppression_records` write path are both service-level-only, confirmed by code search). Manual `psql`/direct-service-call procedure documented in `docs/runbooks/05-consent-revocation-and-suppression.md`. **This is the single most significant functional gap found this phase** — delivery's consent gate depends on revocation data existing, but nothing in the product can create it today.
- ✅ **PII minimization in audit logs** — `AuditService.sanitizeMetadata` strips any metadata key matching a sensitive-looking pattern at write time; not independently audited against every historical row this phase (documented as unverified, not as clean).

## Observability
- ✅ **Structured request logs with correlation IDs** — confirmed present and unchanged (path/status/duration only, no bodies/headers).
- ✅ **Audit event coverage reviewed** — spans auth, widgets, consent/leads, routing/delivery/billing across all phases; documented and mapped to docs/09 §5's metric list with example `psql` queries in `docs/observability.md`.
- ⚠️ **No real metrics backend / dashboards** — everything above is queryable via `psql` today, not via a dashboard. Explicitly out of scope to build this phase; documented as the honest current state.
- ⚠️ **No historical rate-limit (429) tracking** — the throttler is in-memory only (Redis deferred per CLAUDE.md §3); a 429 is visible only in the request log at the moment it happens.

## Operational runbooks (docs/09 §6 — all 8 present)
✅ `docs/runbooks/01-local-setup-and-reset.md`
✅ `docs/runbooks/02-database-migration-and-rollback.md`
✅ `docs/runbooks/03-secret-rotation.md`
✅ `docs/runbooks/04-failed-lead-delivery-and-reconciliation.md`
✅ `docs/runbooks/05-consent-revocation-and-suppression.md`
✅ `docs/runbooks/06-data-access-and-deletion-requests.md`
✅ `docs/runbooks/07-incident-response-and-breach-escalation.md`
✅ `docs/runbooks/08-backup-restore-validation.md`

## Scope discipline
- ✅ No new product/business scope added this phase (no new calculators, widget features, lead/consent fields, or real lender integration).
- ✅ No real external integration, real payment processing, or production data path enabled.
- ✅ No approved-stack major version bumped (NestJS 10, Prisma 5, React 18, Vite 5, Tailwind 3 all untouched; only a devDependency pin — see Known Issues).
- ✅ No Windows ACL/permission changes made.
- ✅ No git operations performed (no repository in this project).

## Overall assessment (facts only — the go/no-go judgment itself is explicitly the human reviewer's, per CLAUDE.md §8 and docs/11 §11)
**Technically solid for a controlled staging deployment**: the full engineering quality gate is genuinely green for the first time (including, for the first time, the real apps/api test suite), migrations replay cleanly from empty, backups are proven restorable, and the security regression pass found no new issues.

**Two gaps a human reviewer should weigh before approving staging**:
1. Consent revocation/suppression has no product-surfaced path at all — anyone needing to honor a revocation today must do so by direct, manual, unaudited database action.
2. Data deletion requests are currently blocked at the database level (FK `RESTRICT`) and intersect an unresolved audit/legal-hold-vs-deletion policy question that requires qualified counsel input (CLAUDE.md §4), not an engineering decision.

Neither gap involves real consumer data today (staging uses synthetic data per docs/09 §7), so neither is necessarily blocking for *staging* specifically — but both should be resolved, or explicitly accepted with a documented plan, before any future production consideration.
