# Runbook — Data Access / Deletion Request Handling

## Verified this phase: a manual walkthrough against a real (synthetic) lead
Using a synthetic test lead already in the local dev database (`id = 68e4553c-9877-4be8-b826-e8909e860cea`), a full fan-out query found this person's data lives in at least 7 tables:

| Table | Rows found | Notes |
|---|---|---|
| `leads` | 1 | The subject row. |
| `consent_records` | 1 | Via `lead_id`. |
| `lead_events` | 12 | Via `lead_id`. |
| `lead_relationships` | 1 | Via `lead_id`. |
| `qualification_records` | 2 | Via `lead_id`. |
| `routing_attempts` | 1 | Via `lead_id`. |
| `lead_deliveries` | 1 | Via `lead_id`. |
| `billing_entries` | 1 | Via `lead_deliveries.id`, not directly by lead. |
| `audit_events` | 3 | Via `resource_id` (a plain string column, **not** an FK — see below). |

## What "access" looks like today
There is no self-service or ops-facing "export this person's data" endpoint. Fulfilling an access request today means an operator manually running the join above via `psql` against production/staging and compiling the result — acceptable for the current MVP data volume, not scalable, and not auditable as a product action (only as a shell history / ops log entry, which should itself be recorded).

## What "deletion" looks like today — and the real blocker
Every FK from a lead-owned table back to `leads.id` is `ON DELETE RESTRICT` (`lead_relationships`, `consent_records`, `lead_events`, `qualification_records`, `routing_attempts`, `lead_deliveries` all confirmed via `pg_constraint` this phase; only `lead_idempotency_keys.lead_id` is `ON DELETE SET NULL`). **A literal `DELETE FROM leads WHERE id = ...` fails today** unless every dependent row is removed first, in dependency order (children of `lead_deliveries`, i.e. `billing_entries`, first; then the rest).

This surfaces the genuine, unresolved tension called out in docs/07 §8 ("do not erase required legal/audit evidence without approved retention rules"):
- `audit_events` references the lead only by a free-text `resource_id`, so it is never blocked by an FK and **would silently survive** a cascaded delete of everything else — which is actually the *correct* outcome for audit/legal-hold purposes, but means a "full deletion" is never actually total, and that must be disclosed to whoever is fulfilling the request.
- `billing_entries` is financial/billing evidence. Deleting it to satisfy a "right to deletion" request may directly conflict with billing/audit retention obligations that have not yet been defined by legal counsel (CLAUDE.md §4: "Legal text and jurisdictional rules require qualified US counsel review"). **Do not delete `billing_entries` or `audit_events` rows to fulfill a deletion request without an explicit, approved retention-override decision.**
- By contrast, `consent_records`, `lead_events`, `qualification_records`, `routing_attempts`, and the `leads` row itself are the actual PII-bearing/behavioral data a deletion request is about, and have no retention-hold rationale documented against them.

## Recommended interim procedure (manual, until a real workflow is built)
1. Confirm the request is legitimate and in scope (not itself a new product decision — escalate ambiguous cases).
2. Run the fan-out query above to enumerate every row.
3. Get an explicit decision on `audit_events`/`billing_entries` retention before touching those two tables — default to **not deleting them**, and instead confirm they already contain no unredacted contact PII (per `AuditService`'s `sanitizeMetadata`, email/phone-shaped metadata keys are already stripped at write time, which helps but hasn't been independently audited against every historical row this phase).
4. For every other table, delete child rows in dependency order, then the `leads` row itself, inside a single transaction.
5. Record that the deletion happened (who, when, which lead ID, what was retained and why) outside the deleted data itself, e.g. in an ops ticket — this record is itself sensitive-adjacent and should not contain the deleted PII.

## What this phase explicitly does not deliver
A real deletion-request API/workflow, redaction-in-place tooling, or automated verification that `audit_events.metadata` never contains PII across all historical rows. These are flagged as release-readiness gaps (see `docs/release-readiness-checklist.md`), not built here — out of this phase's scope per CLAUDE.md ("review... document gaps," not implement new workflows).
