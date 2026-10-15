# Runbook — Local Setup and Reset

## Fresh setup
1. `npm install` at the repo root (npm workspaces install all of `apps/api`, `apps/web`, `packages/shared`).
2. `npm run db:up` — starts PostgreSQL 16 via `docker-compose.yml` (`eversoft-phase1-foundation-postgres-1`, bound to `127.0.0.1:5432`).
3. Copy `.env.example` to `.env` if not already present. Values are synthetic; never put real secrets here.
4. `npm run db:generate` (runs `prisma generate` in `apps/api`) — regenerate the Prisma client whenever `node_modules` is reinstalled from scratch or `prisma/schema.prisma` changes. **This step is easy to forget after a clean install** — a missing/stale client manifests as `TypeError: Cannot read properties of undefined (reading '<EnumValue>')` in `apps/api/src/widgets/attribution-event-mapping.ts` and similar mapping files, not as a Prisma error. If you see that error, run this step.
5. `npm run db:migrate` (runs `prisma migrate deploy` in `apps/api`) — applies all migrations under `apps/api/prisma/migrations` in order.
6. `npm run dev:api` and, in a second shell, `npm run dev:web`.
7. Verify: `curl http://localhost:3001/api/v1/health/live` returns `{"status":"ok"}`; open `http://localhost:5173/index.html`.

## Reset to a clean database (destructive to local data only)
- `npm run db:reset` runs `docker compose down -v && docker compose up -d postgres` — this **deletes the named Docker volume `eversoft_pg_data`**, i.e. all local Postgres data. Confirm nobody needs the current local fixtures before running it.
- After `db:reset`, you must re-run `npm run db:migrate` (the fresh container has no schema) and re-seed/re-create any test fixtures manually (there is no committed seed script beyond `apps/api/src/delivery/lender-catalog-seed.service.ts`, which seeds lender catalog rows at boot, not leads/users).

## Verified in Phase 7 (2026-10-15)
- A full clean reinstall (`rm -rf node_modules` in the root and all three workspaces, delete `package-lock.json`, `npm install`) was performed and works, **provided step 4 (`prisma generate`) is run afterward** — this was the one undocumented trap found this phase (see `docs/runbooks/06-known-issues` note in the release-readiness checklist).
- A migration-from-empty test (separate scratch container, see `docs/runbooks/02-database-migration-and-rollback.md`) confirms all 5 migrations apply cleanly in sequence with no manual intervention.

## Common failure: Vitest / SWC native binding
If `npm run test` in `apps/api` fails with `Error: Failed to load native binding` / `code: 'ERR_SWC_NATIVE_CACHE'`, see the fix already applied in this repo: the root `package.json` pins `"overrides": { "@swc/core": "1.10.1" }`. If this stops working after a dependency bump, see the Phase 7 final report's "SWC/Vitest investigation" section before re-investigating from scratch — do not touch Windows ACLs/permissions to fix it.
