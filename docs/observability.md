# Observability — What Exists Today and How to Query It

This maps docs/09 §5's metric list to what is actually queryable right now in this codebase (via the `audit_events` table and structured request logs), versus what would need a real metrics/tracing backend — which remains out of scope to build (CLAUDE.md §3: Redis/observability backends deferred).

## What exists
1. **Structured request logs** — `apps/api/src/common/request-logger.ts`. Every request logs `requestId` (correlation ID, propagated via `apps/api/src/common/request-context.ts`), `method`, `path`, `status`, `durationMs`. No bodies, no headers, no query strings — by design, to avoid logging PII or secrets.
2. **Audit events** — `audit_events` table, written by `AuditService.record(...)` (`apps/api/src/audit/audit.service.ts`) for every privileged/sensitive action across every phase: auth (register/login/logout/refresh), membership/role actions, widget create/update/pause/resume, consent/lead actions, routing/delivery/billing outcomes. Each row has `action`, `outcome` (`SUCCESS`/`FAILURE`/`DENIED`), `actorUserId`, `organizationId`, `resourceType`/`resourceId`, `correlationId` (links back to the request log line), and sanitized `metadata` (keys matching `password|token|secret|ssn|credit|bank|email|phone|authorization|cookie` are dropped at write time — see `sanitizeMetadata`).
3. **Health endpoints** — `/api/v1/health/live` (process liveness, no dependency checks) and `/api/v1/health/ready` (checks the DB, times out rather than hanging — see `apps/api/test/health.e2e.test.ts`). Neither leaks infrastructure detail in its response body.

## docs/09 §5 metric list, mapped
| Required signal | Queryable today? | How |
|---|---|---|
| Request latency/error rates | Partially | `durationMs`/`status` are in the structured logs, but there is no log aggregation/metrics backend wired up — you'd grep/parse log files, there's no dashboard. |
| Calculator errors | No dedicated metric | Calculators are pure client-side functions (`packages/shared`) with no server round-trip for computation, so there is no server-side "calculator error" to count. Validation errors on the few calculator-adjacent server endpoints (e.g. widget config) do appear as 4xx in request logs. |
| Lead intake counts | Yes | `audit_events` rows with `action = 'lead.captured'`-style actions (see query below) or `SELECT count(*) FROM leads WHERE created_at > ...`. |
| Consent-check denials | Yes | `audit_events` rows with `outcome = 'DENIED'` and an action like `lead.consent_denied` / `lead.suppression_blocked` (see `LeadLifecycleService`, which records `'lead.suppression_blocked'`). |
| Routing outcomes | Yes | `routing_attempts` table directly, or `audit_events` for routing-related actions. |
| Delivery acknowledgment rates | Yes | `lead_deliveries.status` distribution (`PENDING`/`ACKNOWLEDGED`/`REJECTED`/`RECONCILIATION_PENDING`/`FAILED`). |
| Retry counts | Partially | `routing_attempts` rows per lead show attempt history; there is no single "retry count" column surfaced — it's derivable by counting rows, not a first-class metric. |

None of these are wired into a real metrics backend (Prometheus/Grafana/Datadog/etc.) — "queryable" above means via direct SQL (`psql`) today, which is adequate for MVP/staging volume and is the documented interim approach, not a long-term operational dashboard.

## Example queries

**Routing outcomes in the last 24h:**
```sql
SELECT status, count(*) FROM routing_attempts WHERE created_at > now() - interval '24 hours' GROUP BY status;
```

**Consent-check / suppression denial rate (last 24h):**
```sql
SELECT
  count(*) FILTER (WHERE outcome = 'DENIED') AS denied,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE outcome = 'DENIED') / count(*), 1) AS denial_pct
FROM audit_events
WHERE created_at > now() - interval '24 hours' AND action LIKE 'lead.%';
```

**Delivery acknowledgment rate (all time, MVP volume):**
```sql
SELECT status, count(*), round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM lead_deliveries GROUP BY status;
```

**Lead intake counts by day:**
```sql
SELECT date_trunc('day', created_at) AS day, count(*)
FROM leads GROUP BY 1 ORDER BY 1 DESC LIMIT 14;
```

**Audit action/outcome breakdown, last hour (general-purpose triage query, also in the incident-response runbook):**
```sql
SELECT action, outcome, count(*) FROM audit_events
WHERE created_at > now() - interval '1 hour'
GROUP BY action, outcome ORDER BY count(*) DESC;
```

**Rate-limit activity**: not persisted anywhere (the throttler is in-memory per `apps/api/src/rate-limit/rate-limit.module.ts`, since Redis is deferred) — a 429 only shows up as a `status: 429` line in the structured request log at the moment it happens, not as a queryable historical count. This is a real observability gap for a sustained-abuse investigation after the fact; flagged in `docs/release-readiness-checklist.md`.

## What would need a real backend (not built this phase)
- Dashboards/alerting on any of the above (today: manual `psql`).
- High-cardinality-safe metrics labels and percentile latency (p50/p95/p99) — the current logs are per-request lines, not pre-aggregated.
- Historical rate-limit/429 tracking.
- Trace-level visibility across the request lifecycle beyond the single `correlationId`/`requestId` already threaded through logs and audit rows.
