import { request as pwRequest } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'http://localhost:3001';
const AGENT_EMAIL = process.env.E2E_AGENT_EMAIL ?? 'e2e-smoke-agent@example.test';
const AGENT_PASSWORD = process.env.E2E_AGENT_PASSWORD ?? 'CorrectHorseBattery9!E2E';

const dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORAGE_STATE_PATH = path.join(dirname, '.auth', 'agent-storage-state.json');
export const FIXTURE_DATA_PATH = path.join(dirname, '.auth', 'fixture-data.json');

function readCookie(jar: string, name: string): string | undefined {
  return jar
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * Logs in exactly ONCE for the whole suite and saves the resulting cookies as Playwright
 * `storageState`, then provisions exactly ONE widget for the embed tests to reuse.
 *
 * Why this exists (found while running this suite in Phase 7): `auth`'s rate-limit bucket
 * (`AUTH_RATE_LIMIT_MAX=5` per `AUTH_RATE_LIMIT_TTL_SECONDS=60`, see
 * `apps/api/src/rate-limit/rate-limit.module.ts`) is real and enforced — logging in once per
 * test file (as an earlier version of this suite did) tripped a genuine 429 after a handful
 * of runs. That is correct API behavior, not a bug; the fix on the test side is to log in
 * once here and reuse the session, the same way a real single-page app would.
 */
export default async function globalSetup(): Promise<void> {
  const api = await pwRequest.newContext();

  const loginRes = await api.post(`${API_BASE}/api/v1/auth/login`, {
    data: { email: AGENT_EMAIL, password: AGENT_PASSWORD },
  });
  if (!loginRes.ok()) {
    throw new Error(
      `Fixture agent login failed (${loginRes.status()}). Run ` +
        'node apps/web/e2e/fixtures/provision-agent-fixture.mjs first (see that file for why ' +
        'this one-time manual step currently exists), and if this is a 429, wait 60s for the ' +
        '"auth" rate-limit bucket to reset before re-running the suite.',
    );
  }

  await api.storageState({ path: STORAGE_STATE_PATH });

  const setCookie = loginRes.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
  const jar = setCookie.map((h) => h.value.split(';')[0]).join('; ');
  const csrf = readCookie(jar, 'eversoft_csrf');

  const meRes = await api.get(`${API_BASE}/api/v1/memberships/me`, { headers: { cookie: jar } });
  const memberships = (await meRes.json()) as Array<{ organizationId: string }>;
  const organizationId = memberships[0]?.organizationId;
  if (!organizationId) throw new Error('Fixture agent has no organization membership.');

  const createRes = await api.post(`${API_BASE}/api/v1/agent/widgets`, {
    headers: { cookie: jar, 'x-organization-id': organizationId, 'x-csrf-token': csrf ?? '' },
    data: {
      name: `Playwright embed smoke ${Date.now()}`,
      theme: { primaryColor: '#0f5c4a' },
      enabledCalculators: ['AFFORDABILITY'],
      allowedOrigins: ['http://localhost:5173'],
    },
  });
  if (!createRes.ok()) {
    throw new Error(`Widget creation failed: ${createRes.status()} ${await createRes.text()}`);
  }
  const widget = (await createRes.json()) as { publicKey: string };

  writeFileSync(FIXTURE_DATA_PATH, JSON.stringify({ widgetPublicKey: widget.publicKey }));
  await api.dispose();
}
