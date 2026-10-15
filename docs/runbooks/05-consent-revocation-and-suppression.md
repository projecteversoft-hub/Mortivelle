# Runbook — Consent Revocation and Suppression

## Current state (read this first — there is no self-service flow)
As of Phase 7, **there is no API endpoint for either consent revocation or adding a suppression record.** This was a deliberate, documented Phase 5 limitation (see the comment above `ConsentService.revoke` in `apps/api/src/leads/consent.service.ts`: "no public endpoint in Phase 5 ... nothing downstream consumes revoked consent until Phase 6 delivery exists"). Phase 6 delivery now *does* check consent (`DeliveryService` refuses to route a lead with no/revoked `LENDER_CONTACT` consent — proven in `apps/api/test/delivery.e2e.test.ts`), but no ops/agent-facing endpoint was added to actually call `revoke` or to insert a `suppression_records` row. Confirmed by code search this phase: `suppressionRecord` is only ever **read** (`SuppressionService.isSuppressed`, a `findFirst`) — nothing in the application writes to that table today.

This is a real gap for staging readiness, not just a documentation nicety: an operator cannot act on a revocation/suppression request through the product today.

## Manual procedure until a real endpoint exists
### Revoking consent for a lead
1. Identify the `consent_records.id` for the lead/purpose/channel in question:
   ```sql
   SELECT id, lead_id, purpose, channel, revoked_at
   FROM consent_records
   WHERE lead_id = '<lead-id>';
   ```
2. Call `ConsentService.revoke(consentRecordId, reason)` from a one-off authenticated script, or, if truly necessary as an interim manual action, apply the same effect directly and document it as a manual/audited DB action:
   ```sql
   UPDATE consent_records SET revoked_at = now(), revoked_reason = '<reason>' WHERE id = '<id>';
   ```
3. Record an audit trail of the manual action itself (who, when, why) outside the app's own `audit_events` table if done via direct SQL, since nothing automatically creates an `AuditService.record(...)` entry for a raw `UPDATE`. Prefer scripting the real service call over raw SQL for this reason.

### Adding a suppression record
There is no insertion path, manual or automated, proven in code. Before doing this for a real request, add a migration/service method rather than inserting directly against `suppression_records` with hand-built `match_token` values — the match token is a keyed HMAC (see `docs/runbooks/03-secret-rotation.md`) and must be computed the same way `SuppressionService`/`LeadsService` compute it, or it will silently fail to match future submissions. This is explicitly out of this phase's scope to build (hardening/documentation phase only); flag it as a release-readiness gap instead (see `docs/release-readiness-checklist.md`).

## Verifying suppression is working today
Suppression checks only run at new-lead-submission time, not retroactively:
```sql
-- Is this contact's match token already suppressed for a given purpose/channel?
SELECT * FROM suppression_records WHERE match_token = '<hmac>' AND purpose = '<purpose>' AND channel = '<channel>';
```
`apps/api/test/leads.e2e.test.ts` and the dedicated suppression tests prove the check runs and blocks matching submissions — but only for rows that already exist in the table before the next submission arrives.
