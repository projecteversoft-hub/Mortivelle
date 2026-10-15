# 04 — API Contracts and Events

## 1. API conventions
- Prefix APIs with `/api/v1`.
- JSON request and response bodies.
- Use ISO 8601 UTC timestamps.
- Validate input at the boundary with shared schemas/DTOs.
- Use consistent error shape: `code`, safe `message`, optional `fieldErrors`, `requestId`.
- Use cursor or bounded page pagination for list endpoints.
- Apply request size limits, timeouts and rate limits.
- Require idempotency keys for lead submission where retries could create duplicates, lead delivery, and billing mutations.
- Do not expose stack traces, database errors, secrets or raw provider payloads.

## 2. Initial endpoint groups
### Health
- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`

### Authentication
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

### Public calculator and widget
- `GET /api/v1/public/widgets/:publicKey/config`
- `POST /api/v1/public/analytics/events`
- `POST /api/v1/public/calculators/affordability`
- `POST /api/v1/public/calculators/rent-vs-buy`
- `POST /api/v1/public/calculators/property-cost`
- `POST /api/v1/public/leads`

### Agent
- `GET /api/v1/agent/widgets`
- `POST /api/v1/agent/widgets`
- `PATCH /api/v1/agent/widgets/:id`
- `GET /api/v1/agent/reports/summary`
- `GET /api/v1/agent/leads` (only records authorized for that organization)

### Platform operations
- `GET /api/v1/ops/organizations`
- `GET /api/v1/ops/leads`
- `GET /api/v1/ops/deliveries`
- `GET /api/v1/ops/audit-events`
- `PATCH /api/v1/ops/routing-policies/:id`
High-risk operator endpoints require authorization, audit events and narrow DTOs.

### Lender
- `GET /api/v1/lender/deliveries`
- `GET /api/v1/lender/deliveries/:id`
- `POST /api/v1/lender/deliveries/:id/acknowledge`
Real lender endpoints remain disabled until onboarding and contractual/legal approval.

## 3. Lead submission request
Conceptual request fields:
- `widgetPublicKey`
- `contact`: email and/or phone, only fields needed for the requested action
- `purchaseIntent`: optional purchase timeline, state/ZIP and price range
- `requestedAction`: e.g. `SAVE_RESULTS`, `RATE_ALERTS`, `LENDER_CONTACT`
- `consentSelections`: identifiers for the disclosure/permission choices shown to the user
- `calculatorContext`: minimal result/assumption summary, not the entire clickstream
- `idempotencyKey`

The server must resolve the widget and tenant, retrieve the exact active disclosure version, validate the submitted choice, and derive permitted recipients from server-side policy. Never accept arbitrary recipient IDs or a client assertion that consent is valid.

## 4. Events
Internal domain events may include:
- `widget.configured`
- `calculator.completed`
- `lead.captured`
- `consent.recorded`
- `consent.revoked`
- `lead.qualified`
- `routing.started`
- `delivery.attempted`
- `delivery.acknowledged`
- `delivery.rejected`
- `billing.entry.created`

Events must be versioned, carry a correlation ID, avoid unnecessary PII and be safe to retry. Use a transactional outbox or equivalent durable event pattern when asynchronous processing is introduced. Do not require Redis for the MVP.

## 5. Provider adapter contract
Define interfaces for:
- `LeadDeliveryProvider`
- `EmailProvider`
- `PhoneVerificationProvider`
- `PropertyDataProvider`
- later: `CreditDataProvider` and `IncomeVerificationProvider`

Each adapter must define typed input/output, timeout, error categories, retryability, redaction and mock implementation. Credit and income adapters must remain unimplemented/disabled in the MVP.

## 6. Versioning and compatibility
- Version public API contracts.
- Do not break an existing widget silently; maintain widget configuration versioning.
- Reject unsupported schema versions with safe errors.
- Add contract tests for provider adapters and public widget APIs.
