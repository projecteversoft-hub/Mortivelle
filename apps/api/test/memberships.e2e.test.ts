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
 * Mandatory cross-tenant IDOR suite for the one real tenant-scoped endpoint (docs/02 §3:
 * "Cross-tenant access tests are mandatory for every tenant-owned endpoint"), plus the role
 * check required alongside it (docs/11 §3).
 */
describe('GET /api/v1/orgs/me/members — roles and tenant isolation (e2e)', () => {
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
    outsider: { agent: ReturnType<typeof request.agent>; userId: string };
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

    // A member of Org B only — never given a membership in Org A.
    const outsider = await registerVerifyLogin(app, built.emailProvider, 'admin@org-b.test');
    await prisma.membership.create({
      data: { userId: outsider.userId, organizationId: orgB.id, role: 'AGENT_ADMIN' },
    });

    return { orgA, orgB, admin, member, outsider };
  }

  it('allows an admin-role member to list their own organization', async () => {
    const { orgA, admin } = await seedTwoOrgs();
    const res = await admin.agent
      .get('/api/v1/orgs/me/members')
      .set('x-organization-id', orgA.id)
      .expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.map((m: { organizationId: string }) => m.organizationId)).toEqual([
      orgA.id,
      orgA.id,
    ]);

    const auditRow = prisma.auditEvents.find((e) => e.action === 'membership.list');
    expect(auditRow).toMatchObject({ organizationId: orgA.id, outcome: 'SUCCESS' });
    expect(JSON.stringify(auditRow)).not.toMatch(/@org-a\.test|@org-b\.test/);
  });

  it('denies a non-admin member of the same organization (role check)', async () => {
    const { orgA, member } = await seedTwoOrgs();
    const res = await member.agent.get('/api/v1/orgs/me/members').set('x-organization-id', orgA.id);
    expect(res.status).toBe(403);
  });

  it('denies access when the caller has no membership in the requested organization, even naming a real org ID (IDOR)', async () => {
    const { orgB, admin } = await seedTwoOrgs();
    // `admin` is an AGENT_ADMIN of Org A only, but now asks for Org B's membership list by
    // its real, guessed/known ID.
    const res = await admin.agent.get('/api/v1/orgs/me/members').set('x-organization-id', orgB.id);
    expect(res.status).toBe(403);
  });

  it('never leaks Org B membership data to an Org-A-only caller even as a list side effect', async () => {
    const { orgA, orgB, admin } = await seedTwoOrgs();
    const res = await admin.agent
      .get('/api/v1/orgs/me/members')
      .set('x-organization-id', orgA.id)
      .expect(200);
    const returnedOrgIds = new Set(
      res.body.items.map((m: { organizationId: string }) => m.organizationId),
    );
    expect(returnedOrgIds.has(orgB.id)).toBe(false);
    expect(returnedOrgIds).toEqual(new Set([orgA.id]));
  });

  it('requires an organization context header, and rejects a malformed one', async () => {
    const { admin } = await seedTwoOrgs();
    const missing = await admin.agent.get('/api/v1/orgs/me/members');
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ code: 'ORGANIZATION_CONTEXT_REQUIRED' });

    const malformed = await admin.agent
      .get('/api/v1/orgs/me/members')
      .set('x-organization-id', 'not-a-uuid');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ code: 'ORGANIZATION_CONTEXT_REQUIRED' });
  });

  it('requires authentication', async () => {
    const { orgA } = await seedTwoOrgs();
    const res = await request(app.getHttpServer())
      .get('/api/v1/orgs/me/members')
      .set('x-organization-id', orgA.id);
    expect(res.status).toBe(401);
  });

  it('bounds pagination to the configured maximum', async () => {
    const { orgA, admin } = await seedTwoOrgs();
    const res = await admin.agent
      .get('/api/v1/orgs/me/members')
      .query({ limit: 10000 })
      .set('x-organization-id', orgA.id);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
