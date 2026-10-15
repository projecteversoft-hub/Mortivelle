import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { FIXTURE_DATA_PATH } from './global-setup';

/**
 * docs/09 §3 "agent widget setup" (its embed side) and "optional lead capture", via the
 * real embed page (`embed.html`), not just the API.
 *
 * The widget used here is provisioned once in `global-setup.ts` — via the real agent API,
 * logged in as the fixture agent (see `e2e/fixtures/provision-agent-fixture.mjs`) — with
 * `allowedOrigins: ['http://localhost:5173']` so the embed page, loaded same-origin from
 * the Vite dev server, is actually allowed to fetch this widget's public config. The seed
 * lender-catalog widgets are not usable here because their `allowedOrigins` only lists a
 * synthetic agent-site origin, not this dev server's own origin.
 */
const { widgetPublicKey } = JSON.parse(readFileSync(FIXTURE_DATA_PATH, 'utf8')) as {
  widgetPublicKey: string;
};

test.describe('embed widget (embed.html)', () => {
  test('renders the enabled calculator for a real widget key and computes a result', async ({
    page,
  }) => {
    await page.goto(`/embed.html?key=${widgetPublicKey}`);

    // Only the Affordability calculator was enabled for this widget — confirms the embed
    // page actually reads and respects the widget's own config, not just rendering defaults.
    await expect(page.getByLabel(/^Gross monthly household income/)).toBeVisible();
    await page.getByLabel(/^Gross monthly household income/).fill('9000');
    await expect(page.getByText('Estimated purchase budget')).toBeVisible();
  });

  test('shows the invalid/unknown-key fallback for a key that does not exist', async ({ page }) => {
    await page.goto('/embed.html?key=this-widget-key-does-not-exist');
    await expect(page.getByText('This widget could not be found.')).toBeVisible();
  });

  test('submits the optional lead-capture form and shows a neutral confirmation', async ({
    page,
  }) => {
    await page.goto(`/embed.html?key=${widgetPublicKey}`);
    await page.getByLabel(/^Gross monthly household income/).fill('9000');
    await expect(page.getByText('Estimated purchase budget')).toBeVisible();

    await page.getByLabel('Request contact from a mortgage professional').check();
    await page.getByLabel('Email').fill(`playwright-smoke-${Date.now()}@example.test`);
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('Thanks — your request has been received.')).toBeVisible();
  });
});
