import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './support/build-test-app';

/**
 * Public calculator endpoints (docs/11 §4 Phase 3): no auth, no tenant context, rate
 * limited, Zod-validated. Covers the acceptance criterion "calculations work without login
 * or lead capture" and the required invalid-input / boundary-case coverage at the API
 * boundary (unit-level formula/boundary coverage lives in
 * packages/shared/src/calculators/*.test.ts and is not duplicated here).
 *
 * KNOWN ENVIRONMENT LIMITATION: on this machine, `apps/api`'s vitest run cannot start at
 * all due to a pre-existing `ERR_SWC_NATIVE_CACHE` ACL issue (present since Phase 1/2, not
 * introduced here — see the Phase 3 report for how this was cross-verified instead).
 */
describe('public calculators (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('POST /api/v1/public/calculators/affordability returns 200 with no auth', async () => {
    ({ app } = await buildTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/calculators/affordability')
      .send({ grossMonthlyIncome: 10_000, interestRatePercent: 6, termYears: 30 });
    expect(res.status).toBe(200);
    expect(res.body.calculationVersion).toBeDefined();
    expect(res.body.estimatedPurchaseBudget).toBeGreaterThan(0);
    expect(Array.isArray(res.body.assumptionsUsed)).toBe(true);
  });

  it('POST /api/v1/public/calculators/property-cost returns 200 with no auth', async () => {
    ({ app } = await buildTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/calculators/property-cost')
      .send({ purchasePrice: 300_000, downPayment: 60_000 });
    expect(res.status).toBe(200);
    expect(res.body.loanAmount).toBe(240_000);
  });

  it('POST /api/v1/public/calculators/rent-vs-buy returns 200 with no auth', async () => {
    ({ app } = await buildTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/calculators/rent-vs-buy')
      .send({
        currentMonthlyRent: 1800,
        purchasePrice: 300_000,
        downPayment: 60_000,
        timeHorizonYears: 5,
      });
    expect(res.status).toBe(200);
    expect(res.body.renting).toBeDefined();
    expect(res.body.buying).toBeDefined();
    expect(typeof res.body.sensitivityWarning).toBe('string');
  });

  it('rejects down payment >= purchase price as a validation error, not a crash', async () => {
    ({ app } = await buildTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/calculators/property-cost')
      .send({ purchasePrice: 300_000, downPayment: 300_000 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.fieldErrors?.downPayment).toBeDefined();
  });

  it('rejects a missing required field', async () => {
    ({ app } = await buildTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/calculators/affordability')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('rejects the wrong type for a numeric field', async () => {
    ({ app } = await buildTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/calculators/affordability')
      .send({ grossMonthlyIncome: '10000' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('never leaks a stack trace or internal detail on invalid input', async () => {
    ({ app } = await buildTestApp());
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/calculators/rent-vs-buy')
      .send({ currentMonthlyRent: -1, purchasePrice: -1, downPayment: -1, timeHorizonYears: -1 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at [A-Za-z]+\.[A-Za-z]+ \(/); // no stack frames
    expect(res.body.requestId).toBeDefined();
  });

  it('rate-limits a calculator endpoint independently of the auth rate limit', async () => {
    ({ app } = await buildTestApp({
      CALCULATOR_RATE_LIMIT_MAX: '3',
      CALCULATOR_RATE_LIMIT_TTL_SECONDS: '60',
    }));
    const attempt = (): Promise<request.Response> =>
      request(app.getHttpServer())
        .post('/api/v1/public/calculators/affordability')
        .send({ grossMonthlyIncome: 10_000 });

    const results = [await attempt(), await attempt(), await attempt(), await attempt()];
    expect(results.slice(0, 3).every((r) => r.status === 200)).toBe(true);
    expect(results[3]?.status).toBe(429);
    expect(results[3]?.body).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
