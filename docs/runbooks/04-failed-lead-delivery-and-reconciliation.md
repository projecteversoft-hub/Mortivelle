# Runbook — Failed Lead Delivery and Reconciliation

## Where delivery state lives
- `lead_deliveries` — one row per delivery attempt chain to a lender, keyed by `routing_attempt_id` (unique) and `idempotency_key` (unique).
- `routing_attempts` — the routing decision that produced a delivery.
- `billing_entries.lead_delivery_id` is `@unique` — exactly one billing entry can ever exist per delivery (re-verified in this phase after a from-empty migration replay).
- `lead_deliveries.status` is the `DeliveryStatus` enum (`prisma/schema.prisma`): `PENDING -> ACKNOWLEDGED` (billed) or `REJECTED` / `RECONCILIATION_PENDING` / `FAILED`. This is distinct from the lead's own overall `LeadStatus` (`NEW -> NEEDS_REVIEW -> ELIGIBLE -> ROUTING -> DELIVERED -> ACCEPTED/REJECTED/SUPPRESSED/CLOSED`) — do not confuse the two when querying.

## Diagnosing a failed or ambiguous delivery
1. Identify the lead: `SELECT * FROM lead_deliveries WHERE lead_id = '<id>' ORDER BY created_at DESC;`
2. A **transient provider error** retries automatically up to the configured limit, then dead-letters to `FAILED` and rejects the lead (proven in `apps/api/test/delivery.e2e.test.ts`, "a transient error retries up to the configured limit, then dead-letters as FAILED").
3. A **timeout with an ambiguous outcome** (the mock adapter can't confirm whether the lender received it) lands in `RECONCILIATION_PENDING` and is **never auto-retried** — this is deliberate (docs/08: avoid duplicate delivery/billing under ambiguity). No billing entry is created while a delivery sits in this state.

## Reconciling a `RECONCILIATION_PENDING` delivery
- The operator-facing entry point is `DeliveryService.reconcile(...)` in `apps/api/src/delivery/delivery.service.ts` (around line 250), exposed via `POST /api/v1/ops/deliveries/:id/reconcile` (`OpsDeliveryController`).
- This requires determining the real-world outcome out of band (in Phase 6's mock-adapter world, this is simulated; in a real integration this would mean contacting the lender or checking their own system) and calling the endpoint with that resolved outcome so `finalizeOutcome(...)` can transition the delivery and, only then, trigger billing via `BillingService.createEntryForDelivery`.
- Because `billing_entries.lead_delivery_id` is unique, replaying `reconcile` (or retrying the same idempotency key) is safe — it cannot create a second billing entry for the same delivery (proven directly in `apps/api/test/delivery.e2e.test.ts`, "replaying a successful delivery idempotency key any number of times never creates a second BillingEntry").

## Bulk/operational triage query
```sql
-- Deliveries stuck in an unresolved state, oldest first
SELECT id, lead_id, lender_id, status, created_at
FROM lead_deliveries
WHERE status IN ('RECONCILIATION_PENDING', 'FAILED')
ORDER BY created_at ASC;
```
Pair this with the audit trail (`docs/observability.md` has the full query) filtered to `action LIKE 'delivery.%'` for the same `resource_id` to see the full attempt history before deciding how to resolve it.

## What this runbook does not cover
There is no automated alerting/paging on a delivery sitting in `RECONCILIATION_PENDING` or `FAILED` for longer than N hours — today this requires someone to run the triage query above. Adding a scheduled check is a reasonable Phase 8+ candidate, not implemented here (no new product scope this phase).
