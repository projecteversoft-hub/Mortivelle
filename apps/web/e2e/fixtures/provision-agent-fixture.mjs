#!/usr/bin/env node
/**
 * One-time local fixture provisioning for the Playwright agent-dashboard smoke test
 * (apps/web/e2e/agent-dashboard.spec.ts).
 *
 * Why this script exists at all: there is currently no self-service "create an agent
 * organization" API in this product (confirmed by code search in Phase 7 — organizations
 * are only ever created via the lender-catalog seed service, for LENDER_ORG rows, or by
 * direct SQL). `POST /api/v1/auth/register` only creates a `User`; it never creates an
 * `Organization`/`Membership`. This is a genuine product gap, not a test-harness shortcut —
 * see docs/release-readiness-checklist.md. Until a real "create my organization" flow
 * exists, provisioning a usable agent account for any purpose (including this smoke test)
 * requires one direct SQL step, which is what this script automates and documents.
 *
 * Usage (requires the API dev server running with LOG_LEVEL=debug, and the Postgres
 * container from docker-compose.yml running):
 *   node apps/web/e2e/fixtures/provision-agent-fixture.mjs
 *
 * Prints the resulting E2E_AGENT_EMAIL / E2E_AGENT_PASSWORD to export before running
 * `npx playwright test` in apps/web. Safe to re-run — logs in first and only provisions a
 * fresh user/org if that fails.
 */
import { execSync } from 'node:child_process';

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:3001';
const EMAIL = process.env.E2E_AGENT_EMAIL ?? 'e2e-smoke-agent@example.test';
const PASSWORD = process.env.E2E_AGENT_PASSWORD ?? 'CorrectHorseBattery9!E2E';
const PG_CONTAINER = process.env.E2E_PG_CONTAINER ?? 'eversoft-phase1-foundation-postgres-1';

async function tryLogin() {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  return res.ok;
}

function psql(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  return execSync(`docker exec ${PG_CONTAINER} psql -U eversoft -d eversoft -t -c "${escaped}"`, {
    encoding: 'utf8',
  }).trim();
}

function hasMembership() {
  const out = psql(
    `SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.email = '${EMAIL}';`,
  );
  return /[0-9a-f-]{36}/.test(out);
}

async function main() {
  const loggedIn = await tryLogin();
  if (loggedIn && hasMembership()) {
    console.log('Fixture agent account already provisioned and working.');
    printExports();
    return;
  }

  console.log('Provisioning fixture agent account...');
  if (!loggedIn) {
    const registerRes = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!registerRes.ok && registerRes.status !== 409) {
      throw new Error(`register failed: ${registerRes.status} ${await registerRes.text()}`);
    }
  }
  if (loggedIn && !hasMembership()) {
    console.log('User already verified; only the organization/membership is missing.');
    const orgId = createOrgAndMembership();
    console.log('Fixture agent account provisioned.', { orgId });
    printExports();
    return;
  }

  // The LocalEmailProvider only ever logs the raw verification token at `debug` level
  // (apps/api/src/auth/providers/local-email.provider.ts) — there is no API to retrieve it,
  // by design (the hash, not the raw token, is what's persisted). The caller must run the
  // API dev server with LOG_LEVEL=debug and pass its log file path here.
  const logPath = process.env.E2E_API_LOG_PATH;
  if (!logPath) {
    throw new Error(
      'Set E2E_API_LOG_PATH to the API dev server log file (started with LOG_LEVEL=debug) ' +
        'so this script can read the verification token the mock email adapter logs.',
    );
  }
  const log = execSync(`cat "${logPath}"`, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 });
  const matches = [...log.matchAll(/verification token for [^:]+:\s*([A-Za-z0-9_-]+)/g)];
  const token = matches.at(-1)?.[1];
  if (!token) throw new Error('Could not find a verification token in the API log.');

  const verifyRes = await fetch(`${API_BASE}/api/v1/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!verifyRes.ok) throw new Error(`verify-email failed: ${verifyRes.status}`);

  // No org-creation API exists yet — see the module comment above. Direct SQL is the only
  // path today; this mirrors exactly what docs/runbooks/01-local-setup-and-reset.md and the
  // Phase 7 final report document as the current manual procedure.
  const orgId = createOrgAndMembership();
  console.log('Fixture agent account provisioned.', { orgId });
  printExports();
}

function createOrgAndMembership() {
  const orgIdOutput = psql(
    `INSERT INTO organizations (id, name, type, status, created_at, updated_at) VALUES (gen_random_uuid(), 'E2E Smoke Org', 'AGENT_ORG', 'ACTIVE', now(), now()) RETURNING id;`,
  );
  const orgId = orgIdOutput.match(/[0-9a-f-]{36}/)?.[0];
  if (!orgId) throw new Error(`Could not parse organization id from: ${orgIdOutput}`);
  psql(
    `INSERT INTO memberships (id, user_id, organization_id, role, status, created_at, updated_at) SELECT gen_random_uuid(), id, '${orgId}', 'AGENT_ADMIN', 'ACTIVE', now(), now() FROM users WHERE email = '${EMAIL}';`,
  );
  return orgId;
}

function printExports() {
  console.log(`\nexport E2E_AGENT_EMAIL="${EMAIL}"`);
  console.log(`export E2E_AGENT_PASSWORD="${PASSWORD}"\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
