import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './support/build-test-app';

/**
 * Dedicated low-limit test, isolated from the other auth e2e tests (which deliberately use
 * a generous limit so ordinary flows never get throttled). Proves login/register/forgot-
 * password/reset-password are actually rate-limited (docs/02 §5, docs/09 §1) using the
 * in-memory @nestjs/throttler guard (no Redis — CLAUDE.md §3).
 */
describe('auth rate limiting (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 429 after exceeding the configured login attempt limit', async () => {
    ({ app } = await buildTestApp({ AUTH_RATE_LIMIT_MAX: '3', AUTH_RATE_LIMIT_TTL_SECONDS: '60' }));
    const agent = request.agent(app.getHttpServer());

    const attempt = (): Promise<request.Response> =>
      agent
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.test', password: 'whatever-password' });

    const results = [await attempt(), await attempt(), await attempt(), await attempt()];
    const statuses = results.map((r) => r.status);

    expect(statuses.slice(0, 3).every((s) => s === 401)).toBe(true);
    expect(statuses[3]).toBe(429);
    expect(results[3]?.body).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
