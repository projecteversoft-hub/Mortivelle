# 03 — Domain Model and Database

## 1. Data principles
- PostgreSQL is the system of record.
- Prisma migrations are the only approved schema-change mechanism.
- Use UUIDs or another consistently generated opaque identifier; never expose sequential IDs as authorization.
- Store timestamps in UTC.
- Define retention and deletion behavior before collecting each category of personal data.
- Keep sensitive fields separate where feasible and encrypt at the application or storage layer as required by the threat model.
- Never store full credit reports, SSNs, bank credentials or income documents in MVP.

## 2. Core entities
### Identity and tenancy
- `User`: id, email normalized, password hash, email verification state, account status, timestamps.
- `Organization`: id, name, type, status, created_at.
- `Membership`: user_id, organization_id, role, status, created_at.
- `Session` or `RefreshToken`: hashed token/identifier, user_id, expiry, revocation metadata.

### Widget and attribution
- `Widget`: id, organization_id, public_key, name, theme JSON, allowed origins, status, created_at.
- `AttributionEvent`: id, widget_id, organization_id/source context, campaign/source fields, event type, timestamp, privacy-safe metadata. Avoid fingerprinting.
- `CalculatorScenario`: optional anonymous or authenticated scenario identifier, calculator type, input assumptions, result summary, expiry/retention policy. Do not store PII by default.

### Lead and consent
- `Lead`: id, canonical normalized contact identifiers in protected fields, status, source organization/widget, created_at, updated_at, retention_until.
- `LeadRelationship`: lead_id, organization_id, relationship type, permitted visibility, created_at.
- `ConsentRecord`: id, lead_id, disclosure version, purpose, channel, recipient scope, user action, captured_at, source/widget, evidence metadata, revocation state/time.
- `DisclosureVersion`: id, version, locale, content hash, published_at, retired_at, reviewer status.
- `LeadEvent`: id, lead_id, event type, actor/context, timestamp, safe metadata.
- `SuppressionRecord`: protected contact match/token, channel/purpose, reason, created_at, source. Restrict access.

### Qualification and marketplace
- `QualificationRecord`: id, lead_id, type, provider, status, requested_at, completed_at, provenance, minimal result fields. MVP supports contact verification only via mock adapter.
- `Lender`: id, organization_id, display name, status, configured territory/eligibility and integration mode.
- `RoutingPolicy`: id, organization/market scope, strategy (`EXCLUSIVE` in MVP), eligibility conditions, priority, active dates, version.
- `RoutingAttempt`: id, lead_id, policy_version, status, created_at, completed_at, idempotency_key.
- `Bid`: reserved for later auction phase; do not implement auction logic in MVP.
- `LeadDelivery`: id, lead_id, lender_id, routing_attempt_id, status, payload schema version, idempotency key, attempted_at, acknowledged_at, error code.
- `BillingEntry`: id, lead_delivery_id, event type, amount/currency, status, external reference, created_at. MVP may use a simulated ledger; no live payments.
- `AuditEvent`: actor/context, action, resource reference, outcome, timestamp, correlation ID, safe metadata.

## 3. Relationships and invariants
- Every membership references an existing user and organization.
- Widget belongs to one agent organization.
- Widget public keys are non-secret identifiers; origin allowlists are validated server-side.
- Consent references the exact disclosure version shown at capture time.
- A lead cannot be delivered unless consent/permission checks and buyer eligibility checks pass.
- A delivery is unique for a given idempotency key and recipient attempt.
- A lender user can access only deliveries associated with their lender organization.
- Revocation/suppression blocks future communication or delivery as required by configured policy and legal review; it does not erase historical evidence that must lawfully be retained.
- Billing must be tied to a documented billable event and be idempotent.
- Status transitions are validated in domain services, not left to arbitrary client input.

## 4. Indexes and constraints
Add indexes for:
- normalized email/phone match tokens where permitted and protected.
- organization_id plus created_at on tenant-scoped tables.
- lead status plus created_at.
- consent lead_id plus captured_at.
- delivery status plus attempted_at.
- unique idempotency keys.
- widget public key and organization relationship.
Avoid indexes that expose raw PII or are unnecessary for actual query patterns.

## 5. Deduplication
- Normalize email and phone carefully.
- Use keyed HMAC match tokens for lookup where practical rather than plain hashes of low-entropy identifiers.
- Do not merge records solely on approximate similarity.
- Define conflict handling for existing leads, separate consent scopes, different sources and revoked permissions.
- Record the decision in a safe audit event.
- Make deduplication behavior configurable and testable.

## 6. Migration rules
- Include migrations in version control.
- Review generated SQL for destructive or privacy-impacting changes.
- Use expand/migrate/contract for changes that require zero-downtime deployment.
- Test fresh database setup and upgrade from the prior migration state.
- Never use automatic destructive schema sync in production.
