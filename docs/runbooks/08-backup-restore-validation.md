# Runbook — Backup Restore Validation

## Procedure
1. Dump the live database from inside the running Postgres container (custom format, so `pg_restore` can target a different database/role name without editing the dump):
   ```bash
   docker exec eversoft-phase1-foundation-postgres-1 \
     pg_dump -U eversoft -d eversoft -F c -f /tmp/eversoft_backup.dump
   docker cp eversoft-phase1-foundation-postgres-1:/tmp/eversoft_backup.dump ./eversoft_backup.dump
   ```
   (On Git Bash/MSYS, prefix with `MSYS_NO_PATHCONV=1` or the `/tmp/...` path gets mangled into a Windows path before reaching the container.)
2. Start a disposable scratch Postgres container (never reuse the real dev/staging container for the restore target):
   ```bash
   docker run -d --name eversoft-restore-scratch \
     -e POSTGRES_USER=eversoft -e POSTGRES_PASSWORD=eversoft_local_dev \
     -e POSTGRES_DB=eversoft_restore_test -p 127.0.0.1:55432:5432 postgres:16-alpine
   ```
3. Copy the dump in and restore:
   ```bash
   docker cp ./eversoft_backup.dump eversoft-restore-scratch:/tmp/eversoft_backup.dump
   docker exec eversoft-restore-scratch \
     pg_restore -U eversoft -d eversoft_restore_test --no-owner --no-privileges -v /tmp/eversoft_backup.dump
   ```
4. Verify row counts for key tables match between source and restored target.
5. Tear down the scratch container (`docker rm -f eversoft-restore-scratch`) and the dump file.

## Verified in Phase 7 (2026-10-15) — real run, real output
`pg_restore` applied the full schema (all 22 tables), every index, and every FK constraint with **zero errors** (verified by reading the full `pg_restore -v` output; the dump was 96,679 bytes).

Row counts, source vs. restored:

| Table | Source | Restored | Match |
|---|---|---|---|
| `organizations` | 9 | 9 | yes |
| `leads` | 9 | 9 | yes |
| `lead_deliveries` | 4 | 4 | yes |
| `billing_entries` | 4 | 4 | yes |
| `users` | 13 | 13 | yes |
| `audit_events` | 118 | 118 | yes |

The scratch container (`eversoft-restore-scratch`) was removed after verification. The real dev Postgres container (`eversoft-phase1-foundation-postgres-1`) was never stopped, modified, or used as a restore target — only as the dump source.

## Operational notes
- `pg_dump -F c` (custom format) was used specifically because it supports `pg_restore --no-owner --no-privileges` against a database with a different owner/role setup than the source — relevant since a real staging/production restore target will not have identical role names to local dev.
- This procedure has **not** been tried against a production-sized dataset; at MVP volume (dozens of rows per table) dump/restore time is sub-second. Re-validate timing assumptions before relying on this runbook for a real incident at scale.
- No automated/scheduled backup job exists yet (no cron, no managed-Postgres snapshot policy configured in this repo) — this runbook is a manual procedure. Automating it is a release-readiness gap, not implemented this phase (see `docs/release-readiness-checklist.md`).
