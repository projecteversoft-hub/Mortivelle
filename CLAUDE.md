# Tech Realty Rentals Mortgage Platform — Claude Code Master Instructions

## 1. Mission
Build a multi-tenant, API-driven homebuyer engagement and mortgage lead distribution platform. The product provides homebuyer calculators, agent-branded widgets, consent-aware lead capture, lead lifecycle management, and controlled delivery to contracted lender partners.

**This repository begins greenfield.** The product/project name is **Tech Realty Rentals**. This repository contains specifications only until a human reviewer explicitly approves implementation.

## 2. Non-negotiable workflow
1. Read this file and every relevant specification in `docs/` before proposing implementation.
2. Do not write application code, install dependencies, generate migrations, or change infrastructure until the user explicitly approves the documentation review checkpoint.
3. Work phase by phase according to `docs/11-implementation-plan-and-review-gates.md`.
4. At the end of each phase, run its required checks, summarize changed files, tests, known gaps, security implications, and acceptance criteria, then **stop and wait for explicit human approval** before starting the next phase.
5. Never silently skip a failed test, security control, migration review, acceptance criterion, or review gate.
6. If specifications conflict, stop and report the conflict. Treat this file as the workflow authority and the relevant domain specification as the requirements authority.
7. Do not invent lender APIs, legal requirements, provider credentials, production data, or compliance approvals. Use mock adapters until approved provider documentation and credentials are supplied.
8. Do not claim a feature is complete unless code, tests, and acceptance criteria support that claim.

## 3. Approved architecture
- Greenfield monorepo using npm workspaces.
- `apps/web`: React 18, TypeScript, Vite 5, Tailwind CSS 3.
- `apps/api`: NestJS 10, TypeScript.
- `packages/shared`: shared types, DTO schemas, Zod schemas, enums, API contracts and utilities that are safe to share.
- PostgreSQL 16 and Prisma 5.
- Modular monolith first. Do not create microservices without an approved architecture change.
- Redis is **deferred**. Do not make Redis a requirement for the MVP. Define queue/cache interfaces so Redis/BullMQ can be introduced in a later approved phase.
- Testing: Vitest, Supertest, Playwright, and Prisma/database integration tests.
- Local development first, using Docker Compose for PostgreSQL and other explicitly approved dependencies.
- Email, SMS, property data, credit, income, and lender connections must be adapter-based. Use local/mock adapters by default.

## 4. Product and compliance guardrails
- MVP sequence: calculators → agent white-label widgets → consent and lead capture → lead CRM → contracted exclusive lender delivery → operational analytics.
- Do not implement credit pulls, income verification, ping/post auctions, automated underwriting, loan origination, or lender ranking based on protected/sensitive traits in the MVP.
- Never send personal data to a lender merely because a lead exists. Delivery requires a recorded, valid permission scope, eligible recipient, configured business rule, and an auditable delivery record.
- Do not treat a consent checkbox or consent certificate as a guarantee of legal compliance.
- Do not provide legal advice in product copy. Legal text and jurisdictional rules require qualified US counsel review.
- Do not collect Social Security numbers, bank credentials, full credit reports, or income documents in the MVP.
- Use synthetic fixtures only. Never place real consumer data, secrets, tokens, credentials, or API keys in source control, tests, logs, screenshots, or sample `.env` files.
- Minimize PII in logs. Redact contact information and sensitive attributes by default.
- Tenant isolation must be enforced in the service layer for every tenant-owned query and mutation. Do not rely on frontend filtering.
- Use private-by-default access for lead records and saved user scenarios.

## 5. Engineering rules
- Enable strict TypeScript; avoid `any` unless justified and documented.
- Validate all external input at API boundaries.
- Use DTO/schema validation and consistent error responses.
- Use migrations for schema changes; never edit production data manually.
- Add tests for authorization, tenant isolation, consent gating, duplicate handling, and delivery idempotency.
- Use UTC timestamps in storage; render local time in the UI.
- Use stable IDs, pagination, bounded query sizes, rate limits, and explicit timeouts.
- Use database transactions for operations that must be atomic.
- For external side effects, persist state first and use retry-safe delivery patterns. Do not claim “exactly once” delivery; use idempotency and reconciliation.
- Document any deviation from these requirements.

## 6. Required repository layout
```text
/
  CLAUDE.md
  README.md
  package.json
  package-lock.json
  .env.example
  .gitignore
  docker-compose.yml
  apps/
    web/
    api/
  packages/
    shared/
  docs/
    00-product-brief-and-scope.md
    01-architecture-and-system-context.md
    02-roles-tenancy-and-access-control.md
    03-domain-model-and-database.md
    04-api-contracts-and-events.md
    05-homebuyer-experience-and-calculators.md
    06-agent-white-label-and-attribution.md
    07-consent-privacy-and-compliance-controls.md
    08-lead-lifecycle-routing-and-delivery.md
    09-security-testing-and-operations.md
    10-ui-acceptance-criteria.md
    11-implementation-plan-and-review-gates.md
```

## 7. Definition of done
A phase is done only when:
- Its scope and acceptance criteria are met.
- Tests and relevant quality checks pass.
- Tenant isolation and permission checks are tested where relevant.
- Documentation and environment examples are updated.
- No secrets or real personal data are present.
- The implementation summary identifies incomplete items and residual risks.
- The phase review is presented and the assistant stops for explicit approval.

## 8. Human approval checkpoints
Before implementation: documentation review.
After each phase: explicit approval before continuing.
Approval must be clear and direct; silence or an unrelated request is not approval.

## 9. Commands and tooling
Use scripts declared in the repository; do not assume scripts exist before inspecting `package.json`.
Prefer reproducible lockfile-based installs. Never install new major dependencies or change framework versions without explaining why and receiving approval if the change affects the approved stack.
