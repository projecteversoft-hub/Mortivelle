# Runbook — Incident Response and Breach Escalation

This runbook covers operational first response only. It does not replace legal/compliance breach-notification obligations, which require qualified counsel (CLAUDE.md §4) and are explicitly out of scope for this repository to define.

## 1. Detect and triage
Signals available today (see `docs/observability.md` for full query list):
- Structured request logs (`apps/api/src/common/request-logger.ts`) — path, status, duration, request/correlation ID. No bodies/headers logged.
- `audit_events` table — every privileged/sensitive action (auth, widget changes, consent/lead actions, routing/delivery/billing) with `outcome` (`SUCCESS`/`FAILURE`/`DENIED`) and a `correlationId` linking back to the request log line.
- Health endpoints (`/api/v1/health/live`, `/api/v1/health/ready`) for availability incidents.

First-response triage query (unexpected spike in denials/failures):
```sql
SELECT action, outcome, count(*) FROM audit_events
WHERE created_at > now() - interval '1 hour'
GROUP BY action, outcome ORDER BY count(*) DESC;
```

## 2. Classify
- **Availability incident** (service down/degraded): check `docker ps` for the Postgres container, API process logs, and `/health/ready`.
- **Suspected unauthorized access / cross-tenant breach**: pull every `audit_events` row for the affected `organization_id` and `actor_user_id` across the suspected window; cross-reference with `memberships` to confirm whether the actor had any legitimate membership in the organization at the time.
- **Suspected credential compromise**: check `refresh_tokens` for the affected `user_id` — unexpected concurrent sessions from unfamiliar patterns are visible via `created_at`/`user_id` (there is no IP/device column logged today — a known observability gap, see `docs/observability.md`).
- **Suspected data exfiltration via the public leads/widget endpoints**: these are rate-limited (`leads`, `widget-config`, `analytics` buckets — see `apps/api/src/rate-limit/rate-limit.module.ts`), so sustained high-volume abuse should already show up as 429s in request logs; absence of 429s does not rule out low-and-slow abuse.

## 3. Contain
- **Revoke a specific user's sessions**: delete their rows from `refresh_tokens` (`DELETE FROM refresh_tokens WHERE user_id = '<id>'`) — this is a manual, auditable DB action (log it outside the DB itself); there is no admin API for this yet (see `docs/runbooks/03-secret-rotation.md`).
- **Revoke all sessions platform-wide**: rotate `AUTH_JWT_SECRET` (see `docs/runbooks/03-secret-rotation.md`) — this immediately invalidates every access token; refresh tokens still work until also cleared.
- **Pause a compromised/misbehaving widget**: use the existing agent widget pause action (`WidgetsService`, proven in `apps/api/test/widgets.e2e.test.ts` — "pauses and resumes a widget"). A paused widget's public config endpoint stops serving.
- **Isolate the database**: the Postgres container is already bound to `127.0.0.1:5432` only (not exposed beyond localhost in local/staging Docker Compose) — confirm this binding wasn't changed before assuming network isolation in a real incident.

## 4. Eradicate / recover
- Apply a forward-fix migration or code change (see `docs/runbooks/02-database-migration-and-rollback.md` — there are no down-migrations).
- If data integrity is in question, restore from the most recent verified backup (`docs/runbooks/08-backup-restore-validation.md`) into a separate instance for comparison before considering restoring over production.

## 5. Escalate (breach-specific)
If personal data (even synthetic/MVP-scope data, i.e. names/emails/phones/property-shopping details — never SSNs/bank/credit, which this product does not collect per CLAUDE.md §4) was or may have been accessed by an unauthorized party:
1. Stop — this is a legal/compliance decision point, not an engineering one. Do not attempt to characterize breach notification obligations yourself.
2. Preserve evidence: do not delete or truncate `audit_events` or request logs for the affected window; snapshot them (e.g., `pg_dump` the `audit_events` table, or export the relevant log range) before any remediation that might alter them.
3. Escalate to whoever holds the legal/compliance/security decision authority for this project before any customer/regulator communication. This repository has no named incident commander or escalation contact defined — that is itself a release-readiness gap (see `docs/release-readiness-checklist.md`); do not improvise one here.

## 6. Post-incident
Write up: timeline (from `audit_events`/request logs), root cause, what was contained/fixed, and whether a new migration, rate limit, or audit event type should be added as a result. Feed genuine gaps back into docs/09 and the relevant phase's spec rather than only fixing code silently.
