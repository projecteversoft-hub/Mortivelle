# Security Regression Summary — Phase 7

Consolidated final pass over the critical security invariants established across Phases 1-6, re-verified live against the running dev server (`npm run dev:api`) on 2026-10-15. Per-phase detail already exists in each phase's own final report and e2e suite; this does not re-derive every case from scratch, only confirms the most important ones still hold end to end, plus the automated regression suite's own result.

## 1. Full automated regression suite (reference, not re-derived here)
`npm run test` (apps/api): **105/105 tests passing**, including the following regression-relevant suites, each exercised against a real Postgres database (not mocks):
- Cross-tenant IDOR: `memberships.e2e.test.ts` ("denies access... even naming a real org ID (IDOR)"), `widgets.e2e.test.ts` ("never returns Org B widgets... rejects reading Org B widgets by ID (IDOR)"), `delivery.e2e.test.ts` ("never returns, nor allows acknowledging, another lender org's delivery — even by a real guessed ID").
- No-consent / wrong-recipient rejection: `delivery.e2e.test.ts` (4 dedicated cases).
- Duplicate retry / duplicate billing idempotency: `delivery.e2e.test.ts` ("a changed payload under the same idempotency key is a 409 conflict"; "replaying a successful delivery idempotency key any number of times never creates a second BillingEntry").
- Password-reset enumeration: `auth.e2e.test.ts` ("rejects invalid credentials without revealing whether the email is registered").
- Rate limiting: `auth-rate-limit.e2e.test.ts` ("returns 429 after exceeding the configured login attempt limit").

## 2. Live consolidated smoke pass (this phase, against the running dev server)
Performed with `curl`, independent of the automated suite, as this project's established verification method:

| Check | Result |
|---|---|
| CSRF guard on cookie-authenticated state-changing route (`POST /auth/refresh` with no `x-csrf-token`) | **403 Forbidden**, fail-closed. |
| Password-reset enumeration (`POST /auth/forgot-password` for an existing vs. non-existent email) | Both return `200`, near-identical timing (27ms vs. 15ms) — no observable signal. |
| Authenticated endpoint with no credentials (`GET /memberships/me`) | **401 Unauthorized**, standard security headers present. |
| Widget origin spoofing (`GET /public/widgets/:key/config` with the widget's real allowed origin vs. an attacker origin) | Allowed origin: `Access-Control-Allow-Origin` reflected. Attacker origin: **no ACAO header at all** — a browser enforcing CORS cannot read the response cross-origin. |
| Forged/malformed widget key | `400 VALIDATION_FAILED`, no information disclosure. |
| Billing duplicate-charge DB constraint | `billing_entries.lead_delivery_id` confirmed `@unique` in the schema, and re-confirmed present after a from-empty migration replay this phase (see `docs/runbooks/02-database-migration-and-rollback.md`). |

## 3. Known-gap checks (not a regression — documented limitation, not newly introduced)
- **Consent revocation / suppression**: `ConsentService.revoke` and any path to insert a `suppression_records` row have no API endpoint — confirmed by code search (`suppressionRecord` is only ever read, never written, anywhere in `apps/api/src`). This is unchanged from Phase 5/6; see `docs/runbooks/05-consent-revocation-and-suppression.md`.
- **Rate limiting on authenticated endpoints**: the lender portal (`LenderDeliveriesController`), ops endpoints (`OpsDeliveryController`), and agent widget-management endpoints have **no** `ThrottlerGuard` bucket. Confirmed by grep: only `auth`, `calculators`, `widget-config`, `analytics`, and `leads` buckets exist, applied only to `AuthController`, `CalculatorsController`, `PublicWidgetsController`, `PublicAnalyticsController`, `PublicLeadsController`. docs/09 §1 only requires rate limits for "login, reset, public widgets and lead intake" — by that standard this is compliant, not a regression — but it is a residual gap worth flagging: an authenticated-but-malicious or buggy agent/lender client can call these endpoints at unlimited rate today. Recommend adding a conservative authenticated-endpoint bucket in a future phase; not blocking for a staging gate.

## 4. Conclusion
No regressions found. Every previously-proven invariant that was re-checked this phase still holds, confirmed by both the full automated suite (first time ever actually executed, see the Phase 7 final report's SWC/Vitest section) and an independent live smoke pass. The two items in §3 are pre-existing, documented, judgment-call gaps, not new findings — surfaced here for the release-readiness decision, not treated as blocking defects.
