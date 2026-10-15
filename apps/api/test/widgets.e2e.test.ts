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

const VALID_CREATE_BODY = {
  name: 'Homebuyer Tools Widget',
  enabledCalculators: ['AFFORDABILITY', 'RENT_VS_BUY'],
  allowedOrigins: ['https://agent-a.example.com'],
};

/**
 * Agent widget management (docs/11 §5 Phase 4). Covers the mandatory cross-tenant IDOR suite
 * (docs/02 §3) for `/agent/widgets` and `/agent/widgets/:id` -- mirrors
 * `test/memberships.e2e.test.ts`'s pattern exactly -- plus role gating (AGENT_ADMIN-only
 * mutations, AGENT_ADMIN/AGENT_MEMBER reads) and the audit trail for widget changes
 * (docs/02 §6, docs/10 §2 "changes are auditable and have a configuration version").
 */
describe('agent widget management — roles and tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;

  afterEach(async () => {
    await app?.close();
  });

  async function seedTwoOrgs(): Promise<{
    orgA: { id: string };
    orgB: { id: string };
    admin: { agent: ReturnType<typeof request.agent>; userId: string };
    member: { agent: ReturnType<typeof request.agent>; userId: string };
    outsiderAdmin: { agent: ReturnType<typeof request.agent>; userId: string };
  }> {
    const built = await buildTestApp();
    app = built.app;
    prisma = built.prisma;

    const orgA = await prisma.organization.create({ data: { name: 'Org A', type: 'AGENT_ORG' } });
    const orgB = await prisma.organization.create({ data: { name: 'Org B', type: 'AGENT_ORG' } });

    const admin = await registerVerifyLogin(app, built.emailProvider, 'admin@org-a.test');
    await prisma.membership.create({
      data: { userId: admin.userId, organizationId: orgA.id, role: 'AGENT_ADMIN' },
    });

    const member = await registerVerifyLogin(app, built.emailProvider, 'member@org-a.test');
    await prisma.membership.create({
      data: { userId: member.userId, organizationId: orgA.id, role: 'AGENT_MEMBER' },
    });

    // AGENT_ADMIN of Org B only -- never given a membership in Org A.
    const outsiderAdmin = await registerVerifyLogin(app, built.emailProvider, 'admin@org-b.test');
    await prisma.membership.create({
      data: { userId: outsiderAdmin.userId, organizationId: orgB.id, role: 'AGENT_ADMIN' },
    });

    return { orgA, orgB, admin, member, outsiderAdmin };
  }

  it('lets an AGENT_ADMIN create a widget scoped to their own org, with a generated non-UUID public key', async () => {
    const { orgA, admin } = await seedTwoOrgs();
    const res = await admin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .send(VALID_CREATE_BODY)
      .expect(201);

    expect(res.body.organizationId).toBe(orgA.id);
    expect(res.body.configVersion).toBe(1);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.publicKey).not.toBe(res.body.id);
    expect(res.body.publicKey).toMatch(/^[A-Za-z0-9_-]{16,64}$/);

    const auditRow = prisma.auditEvents.find((e) => e.action === 'widget.created');
    expect(auditRow).toMatchObject({ organizationId: orgA.id, outcome: 'SUCCESS' });
  });

  it('denies an AGENT_MEMBER from creating a widget (role check)', async () => {
    const { orgA, member } = await seedTwoOrgs();
    const res = await member.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .send(VALID_CREATE_BODY);
    expect(res.status).toBe(403);
  });

  it('lets an AGENT_MEMBER list widgets for their own org', async () => {
    const { orgA, admin, member } = await seedTwoOrgs();
    await admin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .send(VALID_CREATE_BODY)
      .expect(201);

    const res = await member.agent
      .get('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('never returns Org B widgets to an Org-A-only caller, and rejects reading Org B widgets by ID (IDOR)', async () => {
    const { orgA, orgB, admin, outsiderAdmin } = await seedTwoOrgs();
    await admin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .send(VALID_CREATE_BODY)
      .expect(201);
    const orgBWidget = await outsiderAdmin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgB.id)
      .send({ ...VALID_CREATE_BODY, name: 'Org B widget' })
      .expect(201);

    const list = await admin.agent
      .get('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .expect(200);
    expect(list.body.items.map((w: { id: string }) => w.id)).not.toContain(orgBWidget.body.id);

    // Org A's admin, naming Org A as their active org context, tries to PATCH a real widget
    // ID that belongs to Org B.
    const patchAttempt = await admin.agent
      .patch(`/api/v1/agent/widgets/${orgBWidget.body.id}`)
      .set('x-organization-id', orgA.id)
      .send({ status: 'PAUSED' });
    expect(patchAttempt.status).toBe(404);

    // The widget was not actually paused by the failed cross-tenant attempt.
    const stillActive = await outsiderAdmin.agent
      .get('/api/v1/agent/widgets')
      .set('x-organization-id', orgB.id)
      .expect(200);
    expect(stillActive.body.items[0]).toMatchObject({ id: orgBWidget.body.id, status: 'ACTIVE' });
  });

  it('requires authentication and an organization context, same as the membership endpoint', async () => {
    const { orgA } = await seedTwoOrgs();
    const noAuth = await request(app.getHttpServer())
      .get('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id);
    expect(noAuth.status).toBe(401);
  });

  it('pauses and resumes a widget, incrementing configVersion and auditing precisely', async () => {
    const { orgA, admin } = await seedTwoOrgs();
    const created = await admin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .send(VALID_CREATE_BODY)
      .expect(201);
    expect(created.body.configVersion).toBe(1);

    const paused = await admin.agent
      .patch(`/api/v1/agent/widgets/${created.body.id}`)
      .set('x-organization-id', orgA.id)
      .send({ status: 'PAUSED' })
      .expect(200);
    expect(paused.body).toMatchObject({ status: 'PAUSED', configVersion: 2 });
    expect(prisma.auditEvents.some((e) => e.action === 'widget.paused')).toBe(true);

    const resumed = await admin.agent
      .patch(`/api/v1/agent/widgets/${created.body.id}`)
      .set('x-organization-id', orgA.id)
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(resumed.body).toMatchObject({ status: 'ACTIVE', configVersion: 3 });
    expect(prisma.auditEvents.some((e) => e.action === 'widget.resumed')).toBe(true);
  });

  it('audits an allowed-origins change distinctly as "widget.origins_updated"', async () => {
    const { orgA, admin } = await seedTwoOrgs();
    const created = await admin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .send(VALID_CREATE_BODY)
      .expect(201);

    await admin.agent
      .patch(`/api/v1/agent/widgets/${created.body.id}`)
      .set('x-organization-id', orgA.id)
      .send({ allowedOrigins: ['https://new-origin.example.com'] })
      .expect(200);

    expect(prisma.auditEvents.some((e) => e.action === 'widget.origins_updated')).toBe(true);
  });

  it('rejects a non-HTTPS production origin and an origin with a path', async () => {
    const { orgA, admin } = await seedTwoOrgs();
    const badOrigin = await admin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .send({ ...VALID_CREATE_BODY, allowedOrigins: ['http://not-secure.example.com'] });
    expect(badOrigin.status).toBe(400);
    expect(badOrigin.body.code).toBe('VALIDATION_FAILED');

    const pathOrigin = await admin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .send({ ...VALID_CREATE_BODY, allowedOrigins: ['https://example.com/widget'] });
    expect(pathOrigin.status).toBe(400);
  });

  it("aggregates reports/summary scoped to the caller's own org only", async () => {
    const { orgA, orgB, admin, outsiderAdmin } = await seedTwoOrgs();
    const widgetA = await admin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .send(VALID_CREATE_BODY)
      .expect(201);
    const widgetB = await outsiderAdmin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgB.id)
      .send(VALID_CREATE_BODY)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/public/analytics/events')
      .send({ widgetPublicKey: widgetA.body.publicKey, eventType: 'widget.viewed' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/public/analytics/events')
      .send({ widgetPublicKey: widgetB.body.publicKey, eventType: 'widget.viewed' })
      .expect(200);

    const summary = await admin.agent
      .get('/api/v1/agent/reports/summary')
      .set('x-organization-id', orgA.id)
      .expect(200);
    expect(summary.body.totalEvents).toBe(1);
    expect(summary.body.rows).toHaveLength(1);
    expect(summary.body.rows[0]).toMatchObject({
      widgetId: widgetA.body.id,
      eventType: 'widget.viewed',
      count: 1,
    });
  });

  it('accepts the local-development origin exception', async () => {
    const { orgA, admin } = await seedTwoOrgs();
    const res = await admin.agent
      .post('/api/v1/agent/widgets')
      .set('x-organization-id', orgA.id)
      .send({ ...VALID_CREATE_BODY, allowedOrigins: ['http://localhost:5173'] })
      .expect(201);
    expect(res.body.allowedOrigins).toEqual(['http://localhost:5173']);
  });
});
