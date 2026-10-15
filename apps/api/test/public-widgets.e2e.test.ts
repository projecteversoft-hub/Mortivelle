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
 * Public widget config lookup (docs/04 §2, docs/06 §3-4, docs/11 §5 "origin handling" and
 * "paused widget behavior"). No auth; covers the required origin-allowed vs. origin-denied
 * CORS behavior and the paused-widget acceptance criterion.
 */
describe('GET /api/v1/public/widgets/:publicKey/config (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;

  afterEach(async () => {
    await app?.close();
  });

  async function seedWidget(allowedOrigins: string[]): Promise<{ publicKey: string; id: string }> {
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
    return { publicKey: created.body.publicKey as string, id: created.body.id as string };
  }

  it('returns safe, minimal config with no auth required', async () => {
    const { publicKey } = await seedWidget(['https://agent-a.example.com']);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/widgets/${publicKey}/config`)
      .expect(200);
    expect(res.body).toMatchObject({
      name: 'Widget',
      enabledCalculators: ['AFFORDABILITY'],
      status: 'ACTIVE',
      configVersion: 1,
    });
    // No secrets, no org ID, no allowlist echoed back (docs/06 §4, docs/10 §2).
    expect(res.body.allowedOrigins).toBeUndefined();
    expect(res.body.organizationId).toBeUndefined();
    expect(res.body.id).toBeUndefined();
  });

  it('reflects Access-Control-Allow-Origin for a request from an allowed origin', async () => {
    const { publicKey } = await seedWidget(['https://agent-a.example.com']);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/widgets/${publicKey}/config`)
      .set('Origin', 'https://agent-a.example.com')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://agent-a.example.com');
  });

  it('omits Access-Control-Allow-Origin for a request from a disallowed origin', async () => {
    const { publicKey } = await seedWidget(['https://agent-a.example.com']);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/widgets/${publicKey}/config`)
      .set('Origin', 'https://attacker.example.com')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never sets Access-Control-Allow-Credentials for this public endpoint', async () => {
    const { publicKey } = await seedWidget(['https://agent-a.example.com']);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/public/widgets/${publicKey}/config`)
      .set('Origin', 'https://agent-a.example.com')
      .expect(200);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('returns a generic 404 for an unknown (well-formed) public key, not a different error', async () => {
    await seedWidget(['https://agent-a.example.com']);
    const res = await request(app.getHttpServer()).get(
      '/api/v1/public/widgets/AAAAAAAAAAAAAAAAAAAAAAAA/config',
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('rejects a malformed public key before any DB lookup', async () => {
    await seedWidget(['https://agent-a.example.com']);
    const res = await request(app.getHttpServer()).get('/api/v1/public/widgets/not valid!/config');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('returns 200 with status PAUSED for a paused widget -- not a 404 (docs/06 §8)', async () => {
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
      .send({ name: 'Widget', enabledCalculators: ['AFFORDABILITY'], allowedOrigins: [] })
      .expect(201);
    await admin.agent
      .patch(`/api/v1/agent/widgets/${created.body.id}`)
      .set('x-organization-id', org.id)
      .send({ status: 'PAUSED' })
      .expect(200);

    const res = await request(app.getHttpServer()).get(
      `/api/v1/public/widgets/${created.body.publicKey}/config`,
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAUSED');
  });

  it('rate-limits the config endpoint independently of the analytics endpoint', async () => {
    const builtWithLimits = await buildTestApp({
      WIDGET_CONFIG_RATE_LIMIT_MAX: '2',
      WIDGET_CONFIG_RATE_LIMIT_TTL_SECONDS: '60',
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
      request(app.getHttpServer()).get(`/api/v1/public/widgets/${created.body.publicKey}/config`);
    const results = [await attempt(), await attempt(), await attempt()];
    expect(results.slice(0, 2).every((r) => r.status === 200)).toBe(true);
    expect(results[2]?.status).toBe(429);
  });
});
