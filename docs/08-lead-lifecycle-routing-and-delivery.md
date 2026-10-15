# 08 — Lead Lifecycle, Routing and Delivery

## 1. MVP lifecycle
Suggested statuses:
- `NEW`
- `NEEDS_REVIEW`
- `ELIGIBLE`
- `ROUTING`
- `DELIVERED`
- `ACCEPTED`
- `REJECTED`
- `SUPPRESSED`
- `CLOSED`

Transitions must be controlled by domain services. Document every allowed transition and actor. Do not let the client submit arbitrary next status.

## 2. Intake
- Validate widget, input schema, rate limits and request idempotency.
- Validate the user action and required permission evidence.
- Normalize contact fields and protect them at rest.
- Deduplicate according to documented matching rules.
- Record source and consent separately.
- Return a neutral success response that avoids exposing whether another person's record exists.

## 3. Qualification
MVP: syntactic validation and optional mock email/phone verification only. No credit bureau or income verification. Qualification records must identify provider, time, status and provenance.

## 4. Exclusive routing
- Start with manually configured exclusive routing to an approved lender.
- Match only on approved, non-sensitive criteria such as licensed/contracted territory, product availability and buyer status.
- Do not infer or use protected traits.
- Confirm current permission scope covers the intended recipient and purpose.
- Persist routing attempt before sending.
- Do not route if lender contract/onboarding status is not approved.

## 5. Delivery adapter
The adapter must support:
- Typed payload schema and version.
- Timeout and safe error categories.
- Idempotency key.
- Delivery attempt state.
- Acknowledgment or rejection.
- Retry policy only for retryable failures.
- Redacted logs.
- Reconciliation for ambiguous timeouts.
MVP uses a mock provider and records simulated acknowledgments. Real provider delivery remains disabled until a contract, endpoint documentation, credentials, security review and legal approval are supplied.

## 6. Idempotency and failure handling
- Same idempotency key plus same request returns the prior result.
- Same key with materially different payload returns a conflict.
- Persist delivery attempts and provider correlation IDs.
- Never retry a non-idempotent delivery blindly after an ambiguous timeout.
- Use an outbox or equivalent durable pattern if delivery becomes asynchronous.
- Define dead-letter/manual-review behavior when retries are exhausted.
- Never create a second billable event merely because a delivery retry occurred.

## 7. Rejection and dispute
Capture reason codes such as invalid contact, outside territory, duplicate under contract, unsupported request, or technical failure. Do not permit arbitrary free-text PII in reason fields. Refunds/credits require a documented rule and an auditable adjustment.

## 8. Billing ledger
MVP may simulate billing entries. Every charge must reference an eligible billable event, pricing version, currency, amount and delivery. Adjustments are new ledger entries, not destructive edits. Do not integrate payment processing until the commercial model is approved.

## 9. Future ping/post phase
Not MVP. Before implementation, separately specify:
- Bid request schema and minimum necessary attributes.
- Eligible buyer registry and compliance status.
- Bid deadline, tie-breaking, floor/ceiling rules and no-bid behavior.
- Recipient consent and final delivery checks.
- Auction auditability and dispute resolution.
- Latency objectives, load testing, abuse controls and settlement reconciliation.
