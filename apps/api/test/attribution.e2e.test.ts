import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, type FakeEmailProvider } from './support/build-test-app';
import type { FakePrisma } from './support/fake-prisma';

const PASSWORD = 'Sup3r-Secret-Passw0rd!2026';

async function registerVerifyLogin(
  app: INestApplication,
  emailProvider: FakeEmailProvider,
  email: string,
): Promise<{ agent: ReturnType<typeof request.agent>; userId: string }> {
  const agent = request.agent(app.getHttpServer());
  const registerRes = await agent
    .post('/api/v1/auth/register')
    .send({ email, password: PASSWORD })
    .expect(201);
  const userId = registerRes.body.id as string;
  const token = emailProvider.verificationTokensByEmail.get(email);
  await agent.post('/api/v1/auth/verify-email').send({ token }).expect(200);
  await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
  return { agent, userId };
}

/**
 * Public attribution-event capture (docs/04 §2, docs/06 §5, docs/11 §5 "attribution" and
 * "origin handling"). No auth. Covers: valid events are recorded with the right
 * widget/org linkage and safe fields only; out-of-enum event types are rejected;
 * query-string-bearing landing paths are rejected (never persisted verbatim); origin
 * mismatches against the *named widget's own* allowlist are rejected.
 */
describe('POST /api/v1/public/analytics/events (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;

  afterEach(async () => {
    await app?.close();
  });

  async function seedWidget(allowedOrigins: string[] = []): Promise<{
    publicKey: string;
    widgetId: string;
    orgId: string;
  }> {
    const built = await buildTestApp();
    app = built.app;
    prisma = built.prisma;
    const org = await prisma.organization.create({ data: { name: 'Org A', type: 'AGENT_ORG' } });
    const admin = await registerVerifyLogin(app, built.emailProvider, 'admin@org-a.test');
    await prisma.membership.create({
      data: { userId: admin.userId, organizationId: org.id, role: 'AGENT_ADMIN' },
    });
    const created = await admin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', org.id)
      .send({ name: 'Widget', enabledCalculators: ['AFFORDABILITY'], allowedOrigins })
      .expect(201);
    return {
      publicKey: created.body.publicKey as string,
      widgetId: created.body.id as string,
      orgId: org.id,
    };
  }

  it('records a valid event with the correct widget/org linkage and only safe fields', async () => {
    const { publicKey, widgetId, orgId } = await seedWidget();
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/analytics/events')
      .send({
        widgetPublicKey: publicKey,
        eventType: 'widget.viewed',
        campaign: 'spring-promo',
        source: 'newsletter',
        landingPath: '/embed/affordability',
      })
      .expect(200);
    expect(res.body).toEqual({ recorded: true });

    expect(prisma.attributionEvents).toHaveLength(1);
    expect(prisma.attributionEvents[0]).toMatchObject({
      widgetId,
      organizationId: orgId,
      eventType: 'WIDGET_VIEWED',
      campaign: 'spring-promo',
      source: 'newsletter',
      landingPath: '/embed/affordability',
    });
  });

  it('server-stamps occurredAt and ignores any client-supplied timestamp field', async () => {
    const { publicKey } = await seedWidget();
    const before = Date.now();
    await request(app.getHttpServer())
      .post('/api/v1/public/analytics/events')
      .send({
        widgetPublicKey: publicKey,
        eventType: 'widget.viewed',
        clientTimestamp: '1999-01-01T00:00:00.000Z',
      })
      .expect(200);
    const stored = prisma.attributionEvents[0];
    expect(stored?.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('rejects an out-of-enum event type', async () => {
    const { publicKey } = await seedWidget();
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/analytics/events')
      .send({ widgetPublicKey: publicKey, eventType: 'lead.captured' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(prisma.attributionEvents).toHaveLength(0);
  });

  it('rejects a landing path carrying a query string -- never persisted verbatim', async () => {
    const { publicKey } = await seedWidget();
    const res = await request(app.getHttpServer()).post('/api/v1/public/analytics/events').send({
      widgetPublicKey: publicKey,
      eventType: 'widget.viewed',
      landingPath: '/embed?email=buyer@example.com&utm_source=x',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(prisma.attributionEvents).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toMatch(/buyer@example\.com/);
  });

  it('returns a generic 404 for an unknown widget public key', async () => {
    await seedWidget();
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/analytics/events')
      .send({ widgetPublicKey: 'AAAAAAAAAAAAAAAAAAAAAAAA', eventType: 'widget.viewed' });
    expect(res.status).toBe(404);
  });

  it('accepts an event with no Origin/Referer header at all (non-browser caller)', async () => {
    const { publicKey } = await seedWidget(['https://agent-a.example.com']);
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/analytics/events')
      .send({ widgetPublicKey: publicKey, eventType: 'widget.viewed' });
    expect(res.status).toBe(200);
  });

  it("accepts an event whose Origin matches the named widget's own allowlist", async () => {
    const { publicKey } = await seedWidget(['https://agent-a.example.com']);
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/analytics/events')
      .set('Origin', 'https://agent-a.example.com')
      .send({ widgetPublicKey: publicKey, eventType: 'widget.viewed' });
    expect(res.status).toBe(200);
  });

  it("rejects (and does not persist) an event whose Origin does not match the named widget's allowlist", async () => {
    const { publicKey } = await seedWidget(['https://agent-a.example.com']);
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/analytics/events')
      .set('Origin', 'https://attacker.example.com')
      .send({ widgetPublicKey: publicKey, eventType: 'widget.viewed' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(prisma.attributionEvents).toHaveLength(0);
  });

  it('reflects any Origin in CORS for this endpoint (widget cannot be resolved at preflight time), without credentials', async () => {
    const { publicKey } = await seedWidget(['https://agent-a.example.com']);
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/analytics/events')
      .set('Origin', 'https://some-other-site.example.com')
      .send({ widgetPublicKey: publicKey, eventType: 'widget.viewed' });
    // The handler still rejects this as a content-level origin mismatch (see test above for
    // a widget whose allowlist excludes the caller) -- but the CORS header itself, which only
    // governs whether a *browser* may read the response, reflects the requesting origin.
    expect(res.headers['access-control-allow-origin']).toBe('https://some-other-site.example.com');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('rate-limits the analytics endpoint independently of the config endpoint', async () => {
    const builtWithLimits = await buildTestApp({
      ANALYTICS_RATE_LIMIT_MAX: '2',
      ANALYTICS_RATE_LIMIT_TTL_SECONDS: '60',
    });
    app = builtWithLimits.app;
    prisma = builtWithLimits.prisma;
    const org = await prisma.organization.create({ data: { name: 'Org A', type: 'AGENT_ORG' } });
    const admin = await registerVerifyLogin(app, builtWithLimits.emailProvider, 'admin@org-a.test');
    await prisma.membership.create({
      data: { userId: admin.userId, organizationId: org.id, role: 'AGENT_ADMIN' },
    });
    const created = await admin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', org.id)
      .send({ name: 'Widget', enabledCalculators: ['AFFORDABILITY'], allowedOrigins: [] })
      .expect(201);

    const attempt = (): Promise<request.Response> =>
      request(app.getHttpServer())
        .post('/api/v1/public/analytics/events')
        .send({ widgetPublicKey: created.body.publicKey, eventType: 'widget.viewed' });
    const results = [await attempt(), await attempt(), await attempt()];
    expect(results.slice(0, 2).every((r) => r.status === 200)).toBe(true);
    expect(results[2]?.status).toBe(429);
  });
});
