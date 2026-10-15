import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 7 (docs/09 §3 "End-to-end: calculator journey, optional lead capture, agent widget
 * setup, operator review and mock lender delivery") and docs/11 §8 — the first Playwright
 * setup in this repo, deliberately deferred until a phase shipped user-facing flows worth
 * smoke-testing end-to-end (Phases 3-6 already have unit/integration/e2e-via-supertest
 * coverage; this layer adds real-browser + cross-process smoke coverage on top, not a
 * replacement).
 *
 * Scope is deliberately narrow: a handful of smoke tests, not full UI coverage (unit/
 * component tests already cover accessibility and edge cases — see
 * `src/calculators/CalculatorsSection.test.tsx`, `src/leads/LeadCaptureSection.test.tsx`).
 *
 * Assumes both dev servers are already running (`npm run dev:api`, `npm run dev:web`) — this
 * config does NOT start them itself (`webServer` is intentionally omitted), because the API
 * needs a migrated Postgres database first, which is an environment precondition this config
 * should not silently paper over. See `docs/runbooks/01-local-setup-and-reset.md`.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
