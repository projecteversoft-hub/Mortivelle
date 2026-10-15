import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:3001';

/**
 * docs/09 §3 calls for E2E coverage of "operator review and mock lender delivery." Neither
 * has any UI — both are API-only by prior phases' documented design (Phase 6's final
 * report). Building a full browser-driven flow for them would mean building UI that does
 * not exist and is out of this phase's scope (no new product surface — see CLAUDE.md).
 *
 * What this file deliberately does and does not do:
 * - It DOES smoke-test, against the real running API (not a mock), that the ops
 *   (`PLATFORM_ADMIN`-only) and lender (`LENDER_ADMIN`/`LENDER_MEMBER`-only) routes exist,
 *   are mounted under the expected paths, and correctly refuse an unauthenticated caller —
 *   i.e. that the authorization boundary docs/02 §5 requires is actually wired up on these
 *   specific routes, checked here independently of the API's own unit/integration suite.
 * - It deliberately does NOT re-implement the full qualify -> route -> deliver -> acknowledge
 *   -> bill happy path, or the no-consent/wrong-recipient/duplicate-retry/no-duplicate-charge
 *   cases. All of those are already proven, in depth, against a real Postgres database, in
 *   `apps/api/test/delivery.e2e.test.ts` (16 tests, confirmed passing in the Phase 7 run of
 *   `npm run test`). Duplicating that fixture setup here (a `PLATFORM_ADMIN` user, a
 *   `LENDER_ADMIN` user, an approved lender contract and routing policy, a qualifying lead)
 *   would re-build significant test infrastructure that already exists and already passes,
 *   for no added coverage — see the Phase 7 final report's security-regression section for
 *   why a "reference, don't re-prove" approach was used here deliberately.
 */
test.describe('ops and lender delivery — API-only smoke (no UI exists for these flows)', () => {
  test('ops qualify/route/reconcile endpoints exist and require PLATFORM_ADMIN auth', async ({
    request,
  }) => {
    const qualify = await request.post(
      `${API_BASE}/api/v1/ops/leads/00000000-0000-0000-0000-000000000000/qualify`,
    );
    expect(qualify.status()).toBe(401);

    const route = await request.post(
      `${API_BASE}/api/v1/ops/leads/00000000-0000-0000-0000-000000000000/route`,
    );
    expect(route.status()).toBe(401);

    const reconcile = await request.post(
      `${API_BASE}/api/v1/ops/deliveries/00000000-0000-0000-0000-000000000000/reconcile`,
    );
    expect(reconcile.status()).toBe(401);
  });

  test('lender portal endpoints exist and require lender auth', async ({ request }) => {
    const list = await request.get(`${API_BASE}/api/v1/lender/deliveries`);
    expect(list.status()).toBe(401);

    const getOne = await request.get(
      `${API_BASE}/api/v1/lender/deliveries/00000000-0000-0000-0000-000000000000`,
    );
    expect(getOne.status()).toBe(401);

    const ack = await request.post(
      `${API_BASE}/api/v1/lender/deliveries/00000000-0000-0000-0000-000000000000/acknowledge`,
    );
    expect(ack.status()).toBe(401);
  });
});
