# 01 — Architecture and System Context

## 1. Architecture decision
Use a **modular monolith** in an npm-workspaces monorepo. Deploy the web frontend and API separately; keep business modules inside one NestJS application until measured scaling or organizational needs justify extraction.

## 2. Approved stack
- Monorepo: npm workspaces.
- Web: React 18, TypeScript, Vite 5, Tailwind CSS 3.
- API: NestJS 10, TypeScript.
- Shared package: shared types, enums, Zod schemas and API contracts.
- Data: PostgreSQL 16, Prisma 5.
- Tests: Vitest, Supertest, Playwright, database integration tests.
- Local services: Docker Compose for PostgreSQL.
- Redis: deferred; no MVP dependency.
- External systems: provider adapter interfaces and mock implementations first.

## 3. Logical components
- Web experience: public calculators, agent dashboard, operator console, lender portal (minimal initial scope).
- API edge: authentication, validation, rate limits, pagination and consistent errors.
- Tenant/identity module.
- Calculator module.
- Widget configuration and attribution module.
- Consent/privacy module.
- Lead CRM module.
- Routing/delivery module.
- Billing ledger module.
- Analytics/reporting module.
- Integration adapters: email, property data, verification and lender delivery.
- Persistence: PostgreSQL; encrypted object storage only if a later approved feature requires files.

## 4. System flow
1. A visitor opens an agent widget or platform page.
2. The widget loads a tenant-safe configuration and records a privacy-conscious source attribution event.
3. The visitor uses calculators without identifying themselves.
4. If they opt in, the server validates the request and records the applicable disclosure and user action.
5. A lead is created or matched according to documented deduplication rules.
6. Eligibility checks evaluate consent, recipient scope, tenant policy, lead status and buyer configuration.
7. A routing attempt is persisted.
8. The delivery adapter sends only approved fields to the selected lender.
9. The acknowledgment, outcome, and any billable event are recorded.
10. Operators review funnel and delivery metrics.

## 5. Deployment topology
MVP:
- Static frontend behind CDN/WAF.
- NestJS API service.
- PostgreSQL 16.
- Local mock adapters; no production provider credentials.
- Centralized structured logs and health checks.
- CI for lint, typecheck, tests and build.

Later:
- Background workers and durable queue where needed.
- Redis/BullMQ only after an approved scaling requirement.
- Analytics warehouse or separate reporting store only when query volume warrants it.
- Extract marketplace or delivery service only after documented load or ownership boundaries justify it.

## 6. Cross-cutting requirements
- UTC timestamps.
- Stable IDs and idempotency for mutating external workflows.
- Database transactions for atomic internal state changes.
- Bounded requests, pagination and rate limiting.
- Redacted logs and no secrets in source control.
- Tenant context resolved from authenticated membership or verified public widget key; never trust an arbitrary tenant ID supplied by the client.
- External adapters have timeouts, typed errors and safe retry policies.
- Audit events for sensitive actions and operator changes.

## 7. Architecture decision records
Create an ADR when changing:
- Framework or major dependency versions.
- Monolith/service boundaries.
- Authentication approach.
- Tenant isolation strategy.
- Queue/cache/storage technology.
- PII handling or consent/delivery semantics.

Each ADR must include context, decision, alternatives, consequences, risks and approval status.
