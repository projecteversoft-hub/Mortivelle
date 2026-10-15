import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './support/build-test-app';

const PASSWORD = 'Sup3r-Secret-Passw0rd!2026';

/**
 * `GET /api/v1/memberships/me` (Phase 4 addition -- see packages/shared/src/memberships.ts
 * and apps/api/src/memberships/my-memberships.controller.ts). The agent dashboard's only way
 * to discover which organization(s) a logged-in user may act as; must be strictly
 * self-scoped (never another user's memberships) and require no pre-existing org context.
 */
describe('GET /api/v1/memberships/me (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('requires authentication', async () => {
    ({ app } = await buildTestApp());
    const res = await request(app.getHttpServer()).get('/api/v1/memberships/me');
    expect(res.status).toBe(401);
  });

  it("returns only the caller's own active memberships, with no org-context header needed", async () => {
    const built = await buildTestApp();
    app = built.app;
    const prisma = built.prisma;

    const orgA = await prisma.organization.create({ data: { name: 'Org A', type: 'AGENT_ORG' } });
    const orgB = await prisma.organization.create({ data: { name: 'Org B', type: 'AGENT_ORG' } });

    const agent = request.agent(app.getHttpServer());
    const registerRes = await agent
      .post('/api/v1/auth/register')
      .send({ email: 'admin@org-a.test', password: PASSWORD })
      .expect(201);
    const userId = registerRes.body.id as string;
    const token = built.emailProvider.verificationTokensByEmail.get('admin@org-a.test');
    await agent.post('/api/v1/auth/verify-email').send({ token }).expect(200);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'admin@org-a.test', password: PASSWORD })
      .expect(200);

    await prisma.membership.create({
      data: { userId, organizationId: orgA.id, role: 'AGENT_ADMIN' },
    });

    // A second, unrelated user with a membership in Org B -- must never show up for the
    // first user's call below.
    const otherAgent = request.agent(app.getHttpServer());
    const otherRegister = await otherAgent
      .post('/api/v1/auth/register')
      .send({ email: 'admin@org-b.test', password: PASSWORD })
      .expect(201);
    await prisma.membership.create({
      data: { userId: otherRegister.body.id, organizationId: orgB.id, role: 'AGENT_ADMIN' },
    });

    const res = await agent.get('/api/v1/memberships/me').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      organizationId: orgA.id,
      organizationName: 'Org A',
      role: 'AGENT_ADMIN',
    });
  });
});
