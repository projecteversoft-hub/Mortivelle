import { test, expect } from '@playwright/test';
import { STORAGE_STATE_PATH } from './global-setup';

const AGENT_EMAIL = process.env.E2E_AGENT_EMAIL ?? 'e2e-smoke-agent@example.test';
const AGENT_PASSWORD = process.env.E2E_AGENT_PASSWORD ?? 'CorrectHorseBattery9!E2E';

/**
 * docs/09 §3 "agent widget setup" via the real login UI (`agent.html`), not just the API.
 *
 * Requires a pre-provisioned, email-verified agent account with an organization membership
 * — run `node apps/web/e2e/fixtures/provision-agent-fixture.mjs` first (with the API dev
 * server started with `LOG_LEVEL=debug`). See that script's header comment for exactly why
 * this manual step exists: there is no self-service "create my organization" API today.
 *
 * Only this first test logs in through the UI (that is the point of this test, and it is
 * exactly one of the five login attempts `global-setup.ts` leaves room for inside the
 * `auth` rate-limit window — see that file for why every other test reuses its saved
 * session via `storageState` instead of logging in again).
 */
test.describe('agent dashboard (agent.html) — login via UI', () => {
  test('logs in and sees the widget dashboard for their organization', async ({ page }) => {
    await page.goto('/agent.html');

    await expect(page.getByRole('heading', { name: 'Agent sign-in' })).toBeVisible();
    await page.getByLabel('Email').fill(AGENT_EMAIL);
    await page.getByLabel('Password').fill(AGENT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(
      page.getByRole('heading', { name: 'Tech Realty Rentals agent dashboard' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Widgets' })).toBeVisible();
  });
});

test.describe('agent dashboard (agent.html) — authenticated session', () => {
  test.use({ storageState: STORAGE_STATE_PATH });

  test('creates a new widget from the dashboard form', async ({ page }) => {
    await page.goto('/agent.html');
    await expect(page.getByRole('heading', { name: 'Widgets' })).toBeVisible();

    const widgetName = `Playwright dashboard smoke ${Date.now()}`;
    await page.getByLabel('Name').fill(widgetName);
    await page.getByLabel('Affordability').check();
    await page.getByRole('button', { name: 'Create widget' }).click();

    await expect(page.getByRole('heading', { name: widgetName })).toBeVisible();
  });
});
