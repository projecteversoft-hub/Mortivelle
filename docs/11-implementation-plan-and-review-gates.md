# 11 — Implementation Plan and Review Gates

## Status
**Documentation review required. Do not implement until the user explicitly approves the specification pack.**

## 1. Phase 0 — Documentation approval (no code)
Tasks:
- Read every specification.
- Identify contradictions, open decisions, risks and missing acceptance criteria.
- Produce a proposed file tree and implementation sequence.
- Ask for explicit approval.
Deliverable: review report only; no app code, package installation, migrations or infrastructure changes.

**Gate 0:** user explicitly approves documentation and authorizes Phase 1.

## 2. Phase 1 — Repository and development foundation
Tasks:
- Create npm workspace layout and approved app/package skeleton.
- Configure TypeScript, lint/format, tests and environment validation.
- Add Docker Compose for PostgreSQL 16.
- Add NestJS health endpoints and minimal React app.
- Add Prisma setup and initial organization/user/membership migrations only after schema review.
- Document local setup and commands.
Tests: fresh install, clean database migration, liveness/readiness, build, lint, typecheck.
Acceptance: a fresh clone can be started from README with no real secrets.

**Gate 1:** report files changed, commands run, results, migration review, risks and any deviations; stop for approval.

## 3. Phase 2 — Identity, tenancy and authorization
Tasks:
- Implement authentication, session handling and organization membership.
- Add role/permission checks and tenant context.
- Implement audit-event foundation.
- Add tenant-scoped repository/service patterns.
Tests: auth flows, reset enumeration behavior, role checks, cross-tenant IDOR suite.
Acceptance: unauthorized cross-tenant reads and writes are blocked.

**Gate 2:** stop for explicit approval.

## 4. Phase 3 — Calculator engine and public UI
Tasks:
- Implement pure calculator functions and documented formulas.
- Build responsive calculator UI and estimate disclaimers.
- Add public API validation and rate limits.
Tests: formula fixtures, boundary cases, invalid input, accessibility smoke tests.
Acceptance: calculations work without login or lead capture; no sensitive inputs in URLs/logs/analytics.

**Gate 3:** stop for explicit approval.

## 5. Phase 4 — Agent widget and attribution
Tasks:
- Implement widget configuration, public config endpoint, iframe embed and origin controls.
- Build agent widget management UI and aggregated analytics.
Tests: tenant isolation, origin handling, paused widget behavior and attribution.
Acceptance: an agent can configure and embed a widget without access to another tenant.

**Gate 4:** stop for explicit approval.

## 6. Phase 5 — Consent and lead CRM
Tasks:
- Implement disclosure versioning and purpose-specific permission records.
- Implement lead capture, deduplication, lifecycle transitions, suppression and audit history.
- Keep provider integrations mocked.
Tests: missing/wrong/revoked consent, duplicate submissions, tenant visibility and PII redaction.
Acceptance: all lead actions are permission-gated and auditable.

**Gate 5:** stop for explicit approval.

## 7. Phase 6 — Exclusive lender delivery and simulated billing
Tasks:
- Implement manually configured exclusive routing and buyer eligibility.
- Implement mock delivery adapter, acknowledgments, retries/reconciliation and idempotency.
- Implement simulated billing ledger.
Tests: no-consent rejection, wrong-recipient rejection, duplicate retry, timeout ambiguity, no duplicate charge.
Acceptance: only eligible leads can be delivered and every outcome is traceable.

**Gate 6:** stop for explicit approval. Real lender delivery remains disabled unless separately authorized.

## 8. Phase 7 — Operational hardening
Tasks:
- Add monitoring, operational dashboards and runbooks.
- Verify backups/restore approach, security headers, rate limits and dependency checks.
- Review retention, deletion, access logs and incident response.
Tests: full suite, migration upgrade, build, E2E, security regression suite.
Acceptance: release-readiness checklist is satisfied for a controlled staging deployment.

**Gate 7:** stop for explicit release approval. Do not enable production consumer data or live lead delivery without legal, contractual, provider, security and operational approvals.

## 9. Later phases requiring separate approval
- Credit bureau/soft-pull integration.
- Income verification.
- Ping/post auctions.
- Automated SMS/calling.
- Payments and revenue-share settlement.
- Loan origination/brokerage.
- Redis/BullMQ or separate microservices.
Each requires a new scoped specification, threat review, acceptance criteria and approval checkpoint.

## 10. Required phase report format
At each gate, report:
1. Phase and scope completed.
2. Files created/changed.
3. Commands and tests actually run.
4. Pass/fail results.
5. Acceptance criteria status.
6. Security/privacy impact.
7. Migrations and data impact.
8. Known issues and deviations.
9. Recommendation.
10. Explicitly state that work is paused pending approval.

## 11. Stop conditions
Stop and ask the user if:
- A specification is ambiguous or contradictory.
- A dependency requires a major architecture change.
- A migration is destructive or unclear.
- A legal/compliance decision is needed.
- A real provider credential or real consumer data would be required.
- A test cannot pass and the cause is not understood.
- A requested feature falls outside the approved phase.
