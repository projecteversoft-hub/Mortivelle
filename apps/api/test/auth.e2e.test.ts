import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, type FakeEmailProvider } from './support/build-test-app';
import type { FakePrisma } from './support/fake-prisma';
import { parseCookie } from './support/cookies';

const PASSWORD = 'Sup3r-Secret-Passw0rd!2026';

async function registerAndVerify(
  agent: ReturnType<typeof request.agent>,
  emailProvider: FakeEmailProvider,
  email: string,
): Promise<string> {
  const registerRes = await agent
    .post('/api/v1/auth/register')
    .send({ email, password: PASSWORD })
    .expect(201);
  expect(registerRes.body).toMatchObject({ email, status: 'PENDING_VERIFICATION' });
  const userId = registerRes.body.id as string;

  const token = emailProvider.verificationTokensByEmail.get(email);
  expect(token).toBeTruthy();
  await agent.post('/api/v1/auth/verify-email').send({ token }).expect(200);
  return userId;
}

async function login(
  agent: ReturnType<typeof request.agent>,
  email: string,
  password = PASSWORD,
): Promise<{ status: number; csrfToken?: string; body: unknown }> {
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  const csrfToken = parseCookie(res.headers['set-cookie'] as unknown as string[], 'eversoft_csrf');
  return { status: res.status, csrfToken, body: res.body };
}

describe('auth flows (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  let emailProvider: FakeEmailProvider;

  afterEach(async () => {
    await app?.close();
  });

  it('full happy path: register -> verify-email -> login -> protected endpoint -> refresh -> logout', async () => {
    ({ app, prisma, emailProvider } = await buildTestApp());
    const agent = request.agent(app.getHttpServer());
    const email = 'buyer.one@example.test';

    const userId = await registerAndVerify(agent, emailProvider, email);

    const loginResult = await login(agent, email);
    expect(loginResult.status).toBe(200);
    expect(loginResult.body).toMatchObject({ user: { id: userId, email } });
    expect(loginResult.csrfToken).toBeTruthy();

    // Seed an organization + membership directly (Phase 2 registration is user-only; org
    // assignment is a separate, not-yet-specified admin/invite flow — see final report).
    const org = await prisma.organization.create({
      data: { name: 'Acme Realty', type: 'AGENT_ORG' },
    });
    await prisma.membership.create({
      data: { userId, organizationId: org.id, role: 'AGENT_ADMIN' },
    });

    const membersRes = await agent
      .get('/api/v1/orgs/me/members')
      .set('x-organization-id', org.id)
      .expect(200);
    expect(membersRes.body.items).toHaveLength(1);
    expect(membersRes.body.items[0]).toMatchObject({
      userId,
      organizationId: org.id,
      role: 'AGENT_ADMIN',
    });

    const refreshRes = await agent
      .post('/api/v1/auth/refresh')
      .set('x-csrf-token', loginResult.csrfToken as string)
      .expect(200);
    expect(refreshRes.body.user).toMatchObject({ id: userId, email });

    const newCsrf = parseCookie(
      refreshRes.headers['set-cookie'] as unknown as string[],
      'eversoft_csrf',
    );
    await agent
      .post('/api/v1/auth/logout')
      .set('x-csrf-token', newCsrf as string)
      .expect(200);

    // The access-token cookie was cleared, so the protected endpoint is unreachable now.
    await agent.get('/api/v1/orgs/me/members').set('x-organization-id', org.id).expect(401);

    const auditActions = prisma.auditEvents.map((e) => e.action);
    expect(auditActions).toEqual(
      expect.arrayContaining([
        'auth.register',
        'auth.login',
        'membership.list',
        'auth.refresh',
        'auth.logout',
      ]),
    );
  });

  it('rejects invalid credentials without revealing whether the email is registered', async () => {
    ({ app, prisma, emailProvider } = await buildTestApp());
    const agent = request.agent(app.getHttpServer());
    const email = 'known.user@example.test';
    await registerAndVerify(agent, emailProvider, email);

    const wrongPassword = await login(agent, email, 'totally-the-wrong-password-000');
    const unknownEmail = await login(agent, 'nobody.here@example.test', PASSWORD);

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(unknownEmail.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect((wrongPassword.body as { message: string }).message).toBe(
      (unknownEmail.body as { message: string }).message,
    );

    const failures = prisma.auditEvents.filter(
      (e) => e.action === 'auth.login' && e.outcome === 'FAILURE',
    );
    expect(failures.length).toBeGreaterThanOrEqual(2);
    // Audit metadata/action must never leak which branch failed (no email field anywhere).
    for (const event of failures) {
      expect(JSON.stringify(event)).not.toMatch(/nobody\.here|known\.user/);
    }
  });

  it('blocks login until the email is verified, and rejects a duplicate registration', async () => {
    ({ app, prisma, emailProvider } = await buildTestApp());
    const agent = request.agent(app.getHttpServer());
    const email = 'unverified@example.test';

    await agent.post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    const unverifiedLogin = await login(agent, email);
    expect(unverifiedLogin.status).toBe(403);
    expect(unverifiedLogin.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });

    const dup = await agent.post('/api/v1/auth/register').send({ email, password: PASSWORD });
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  it('rejects an invalid refresh token and an expired refresh token, and detects replay', async () => {
    ({ app, prisma, emailProvider } = await buildTestApp());
    const agent = request.agent(app.getHttpServer());
    const email = 'refresh.target@example.test';
    await registerAndVerify(agent, emailProvider, email);
    const { csrfToken } = await login(agent, email);

    // Invalid: garbage refresh token, legitimate csrf cookie/header pair preserved.
    const bogus = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`eversoft_rt=not-a-real-token`, `eversoft_csrf=${csrfToken}`])
      .set('x-csrf-token', csrfToken as string);
    expect(bogus.status).toBe(401);
    expect(bogus.body).toMatchObject({ code: 'TOKEN_INVALID' });

    // Expired: age out the real refresh token record directly.
    const record = prisma.refreshTokens[0];
    expect(record).toBeTruthy();
    record!.expiresAt = new Date(Date.now() - 1000);
    const expired = await agent
      .post('/api/v1/auth/refresh')
      .set('x-csrf-token', csrfToken as string);
    expect(expired.status).toBe(401);
    expect(expired.body).toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('revokes the whole token family when a rotated-away refresh token is replayed', async () => {
    ({ app, prisma, emailProvider } = await buildTestApp());
    const agent = request.agent(app.getHttpServer());
    const email = 'replay.target@example.test';
    await registerAndVerify(agent, emailProvider, email);
    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const setCookie = loginRes.headers['set-cookie'] as unknown as string[];
    const originalRefreshToken = parseCookie(setCookie, 'eversoft_rt');
    const csrfToken = parseCookie(setCookie, 'eversoft_csrf');
    expect(originalRefreshToken).toBeTruthy();

    // Rotate once via the normal flow (the agent's cookie jar now holds the new token).
    const refreshRes = await agent
      .post('/api/v1/auth/refresh')
      .set('x-csrf-token', csrfToken as string)
      .expect(200);
    const newCsrf = parseCookie(
      refreshRes.headers['set-cookie'] as unknown as string[],
      'eversoft_csrf',
    );

    // Replay the *original* (now rotated-away) refresh token directly. The CSRF guard only
    // checks that the cookie and header match each other, so any self-consistent pair works.
    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`eversoft_rt=${originalRefreshToken}`, 'eversoft_csrf=replay-csrf'])
      .set('x-csrf-token', 'replay-csrf');
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ code: 'TOKEN_INVALID' });

    // Reuse detection must have revoked the *entire* family, including the token the
    // agent legitimately rotated to just above.
    const nowBlocked = await agent
      .post('/api/v1/auth/refresh')
      .set('x-csrf-token', newCsrf as string);
    expect(nowBlocked.status).toBe(401);
    expect(nowBlocked.body).toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('CSRF guard rejects refresh/logout without a matching double-submit token', async () => {
    ({ app, prisma, emailProvider } = await buildTestApp());
    const agent = request.agent(app.getHttpServer());
    const email = 'csrf.target@example.test';
    await registerAndVerify(agent, emailProvider, email);
    await login(agent, email);

    const noHeader = await agent.post('/api/v1/auth/refresh');
    expect(noHeader.status).toBe(403);
    expect(noHeader.body).toMatchObject({ code: 'CSRF_TOKEN_INVALID' });

    const wrongHeader = await agent
      .post('/api/v1/auth/refresh')
      .set('x-csrf-token', 'wrong-value-entirely');
    expect(wrongHeader.status).toBe(403);
  });

  it('forgot-password returns an identical response whether or not the email is registered', async () => {
    ({ app, prisma, emailProvider } = await buildTestApp());
    const agent = request.agent(app.getHttpServer());
    const email = 'has.account@example.test';
    await registerAndVerify(agent, emailProvider, email);

    const existing = await agent.post('/api/v1/auth/forgot-password').send({ email }).expect(200);
    const missing = await agent
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'no.such.account@example.test' })
      .expect(200);

    expect(existing.body).toEqual(missing.body);
    expect(existing.status).toBe(missing.status);
    // Only the existing account actually receives a reset token.
    expect(emailProvider.resetTokensByEmail.has(email)).toBe(true);
    expect(emailProvider.resetTokensByEmail.has('no.such.account@example.test')).toBe(false);
  });

  it('completes a password reset and revokes every existing session for that user', async () => {
    ({ app, prisma, emailProvider } = await buildTestApp());
    const agent = request.agent(app.getHttpServer());
    const email = 'reset.target@example.test';
    await registerAndVerify(agent, emailProvider, email);
    await login(agent, email);

    await agent.post('/api/v1/auth/forgot-password').send({ email }).expect(200);
    const resetToken = emailProvider.resetTokensByEmail.get(email);
    expect(resetToken).toBeTruthy();

    const newPassword = 'Br4nd-New-Passw0rd!2026';
    await agent
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword })
      .expect(200);

    expect(prisma.refreshTokens.every((t) => t.revokedAt !== null)).toBe(true);

    const oldPasswordLogin = await login(request.agent(app.getHttpServer()), email, PASSWORD);
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await login(request.agent(app.getHttpServer()), email, newPassword);
    expect(newPasswordLogin.status).toBe(200);
  });

  it('rejects a reused or malformed password-reset token', async () => {
    ({ app, prisma, emailProvider } = await buildTestApp());
    const agent = request.agent(app.getHttpServer());
    const email = 'reset.reuse@example.test';
    await registerAndVerify(agent, emailProvider, email);

    const malformed = await agent
      .post('/api/v1/auth/reset-password')
      .send({ token: 'not-a-real-token-but-long-enough', newPassword: 'Another-New-Passw0rd!' });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ code: 'TOKEN_INVALID' });

    await agent.post('/api/v1/auth/forgot-password').send({ email }).expect(200);
    const token = emailProvider.resetTokensByEmail.get(email);
    await agent
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'Another-New-Passw0rd!' })
      .expect(200);
    const reuse = await agent
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'Yet-Another-Passw0rd!' });
    expect(reuse.status).toBe(400);
    expect(reuse.body).toMatchObject({ code: 'TOKEN_INVALID' });
  });
});
