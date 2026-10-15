import { test, expect } from '@playwright/test';

/**
 * docs/09 §3 "End-to-end: calculator journey ... " — the first-party app (`index.html`),
 * with no authentication and no widget context. Selectors mirror the existing accessibility
 * unit tests in `src/calculators/CalculatorsSection.test.tsx` so this stays in sync with
 * what those already prove about labeling.
 *
 * `LeadCaptureSection` requires a resolvable `widgetPublicKey` and is documented as never
 * rendering in this first-party context (see its own prop comment) — "optional lead
 * capture" is exercised in `embed-widget.spec.ts` instead, where a widget always exists.
 */
test.describe('calculator journey (index.html)', () => {
  test('fills the affordability calculator and sees a computed result', async ({ page }) => {
    await page.goto('/index.html');

    await expect(page.getByRole('tab', { name: 'Affordability' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByLabel(/^Gross monthly household income/).fill('9000');
    await page.getByLabel('Recurring monthly debt payments').fill('500');

    await expect(page.getByText('Estimated purchase budget')).toBeVisible();
    await expect(
      page.getByText(/not loan offers, approvals, or financial advice/i).first(),
    ).toBeVisible();
  });

  test('switches to Rent vs. buy and computes a side-by-side comparison', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByRole('tab', { name: 'Rent vs. buy' }).click();

    await page.getByLabel(/^Current monthly rent/).fill('1800');
    await page.getByLabel(/^Purchase price/).fill('300000');

    await expect(page.getByText('Renting breakdown')).toBeVisible();
    await expect(page.getByText('Buying breakdown')).toBeVisible();
  });
});
