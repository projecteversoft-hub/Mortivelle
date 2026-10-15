# Runbook — Secret Rotation

## Secrets in this system (from `packages/shared/src/env.ts`)
| Secret | Purpose | Notes |
|---|---|---|
| `AUTH_JWT_SECRET` | Signs/verifies short-lived access tokens (docs/02 §5) | Rejected at boot in `NODE_ENV=production` if it equals the committed synthetic default (`DEV_ONLY_DEFAULT_JWT_SECRET`). Min length 32. |
| `LEAD_MATCH_HMAC_SECRET` (env var backing `DEV_ONLY_DEFAULT_LEAD_MATCH_HMAC_SECRET`) | Keyed HMAC for lead/suppression dedup match tokens (docs/03 §5) | Must differ from `AUTH_JWT_SECRET`. Same production-default-rejection pattern. **Rotating this changes every future dedup/suppression match token** — see impact note below. |
| `DATABASE_URL` (embeds `POSTGRES_PASSWORD`) | Postgres credential | Local-only synthetic value today; a real deployment uses a secret manager, never a committed `.env`. |
| Argon2 parameters (`ARGON2_MEMORY_COST_KB`, `ARGON2_TIME_COST`, `ARGON2_PARALLELISM`) | Password hashing cost | Not a secret, but a rotation-adjacent tuning value — see note below. |

## Rotating `AUTH_JWT_SECRET`
1. Issue a new value (32+ random bytes, base64 or hex) via the secret manager for the target environment.
2. Because there is no multi-key/`kid`-based verification in `apps/api/src/auth/token.service.ts` today, rotating this secret **immediately invalidates every outstanding access token**. Refresh tokens are opaque DB rows (`refresh_tokens.token_hash`), not JWTs, so they are unaffected — a user with a valid refresh token can silently re-authenticate on their next request (`POST /api/v1/auth/refresh`). Plan rotation for low-traffic windows regardless, since access tokens (15 min TTL by default, `AUTH_ACCESS_TOKEN_TTL_SECONDS`) will 401 until refreshed.
3. Deploy the new secret and restart the API process. Do not run old and new API instances against two different secrets simultaneously (no dual-key support exists).
4. Confirm via `curl -i http://<host>/api/v1/health/live` that the process restarted, and spot-check a login (`POST /api/v1/auth/login`) issues a token that a protected route accepts.

## Rotating `LEAD_MATCH_HMAC_SECRET`
This secret keys the dedup/suppression match token (see `SuppressionService.isSuppressed`, and dedup logic in `LeadsService`). **Rotating it breaks historical dedup and suppression matching** — a previously suppressed contact (e.g., someone who revoked consent) will no longer match their old `suppression_records.match_token` row after rotation, because the token is a keyed HMAC of their contact info and the key changed. Do not rotate this secret routinely; only rotate it if it is suspected compromised, and if so, treat it as a data-integrity event requiring a documented data owner / compliance decision (docs/07) before proceeding, not a routine ops task — re-deriving every existing suppression/dedup token under the new key would require re-processing all historical `leads` and `suppression_records` rows.

## Rotating the database credential
1. Create the new Postgres role/password (or rotate `POSTGRES_PASSWORD` for local/staging Docker Compose).
2. Update the secret manager / `.env` for every API instance.
3. Rolling-restart API instances; `PrismaService` reconnects on process start, there is no live credential hot-swap.
4. Revoke the old credential only after confirming the new one is in use (check `apps/api` structured logs for successful boot, or `GET /api/v1/health/ready`).

## Argon2 cost parameters
Not a secret, but changing `ARGON2_MEMORY_COST_KB`/`ARGON2_TIME_COST` only affects **newly hashed** passwords — `apps/api/src/auth/password.service.ts` must already store the hash in a self-describing format (Argon2's own encoded hash string includes its parameters), so existing users verify fine against their original cost parameters. No forced rehash/rotation mechanism exists today; add one (rehash-on-verify) before increasing cost parameters at scale if minimizing exposure window matters.

## What is NOT yet rotatable operationally
There is no admin/ops API endpoint to force-revoke all of one user's refresh tokens independently of a full secret rotation (e.g. for a suspected compromised account). The closest existing lever is directly deleting that user's rows from `refresh_tokens` via `psql` — document this as a manual, audited action if used (see `docs/runbooks/07-incident-response-and-breach-escalation.md`).
