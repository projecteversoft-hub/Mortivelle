import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './support/build-test-app';
import type { FakePrisma } from './support/fake-prisma';

/**
 * Phase 5 — consent, lead capture and lead CRM (docs/11 §6). Mirrors `test/widgets.e2e.test.ts`
 * for app setup and the cross-tenant IDOR pattern. Exercises `LeadsService`/`ConsentService`/
 * `DisclosuresService`/`SuppressionService`/`LeadLifecycleService` end to end through the
 * real HTTP controllers, against the in-memory `FakePrisma` (apps/api Vitest itself is
 * blocked in this environment by a pre-existing Windows SWC native-binding issue — not a
 * regression; see the Phase 5 final report for the live-database/curl verification done
 * instead).
 */
describe('leads — capture, consent, dedup, suppression, tenant visibility (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;

  afterEach(async () => {
    await app?.close();
  });

  async function registerVerifyLogin(
    email: string,
    emailProvider: { verificationTokensByEmail: Map<string, string> },
  ): Promise<ReturnType<typeof request.agent>> {
    const PASSWORD = 'Sup3r-Secret-Passw0rd!2026';
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    const token = emailProvider.verificationTokensByEmail.get(email);
    await agent.post('/api/v1/auth/verify-email').send({ token }).expect(200);
    await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    return agent;
  }

  async function setup(): Promise<{
    orgA: { id: string };
    orgB: { id: string };
    widgetA: { id: string; publicKey: string };
    widgetB: { id: string; publicKey: string };
    adminA: ReturnType<typeof request.agent>;
    adminB: ReturnType<typeof request.agent>;
  }> {
    const built = await buildTestApp();
    app = built.app;
    prisma = built.prisma;

    const orgA = await prisma.organization.create({ data: { name: 'Org A', type: 'AGENT_ORG' } });
    const orgB = await prisma.organization.create({ data: { name: 'Org B', type: 'AGENT_ORG' } });
    const widgetA = await prisma.widget.create({
      data: {
        organizationId: orgA.id,
        publicKey: 'widget-a-public-key-aaaaaaaaaaaaaaaa',
        name: 'Org A widget',
        themePrimaryColor: '#0f5c4a',
        allowedOrigins: [],
        enabledCalculators: ['AFFORDABILITY'],
      },
    });
    const widgetB = await prisma.widget.create({
      data: {
        organizationId: orgB.id,
        publicKey: 'widget-b-public-key-bbbbbbbbbbbbbbbb',
        name: 'Org B widget',
        themePrimaryColor: '#0f5c4a',
        allowedOrigins: [],
        enabledCalculators: ['AFFORDABILITY'],
      },
    });

    const adminA = await registerVerifyLogin('admin@org-a.test', built.emailProvider);
    await prisma.membership.create({
      data: {
        userId: (await prisma.user.findUnique({ where: { email: 'admin@org-a.test' } }))!.id,
        organizationId: orgA.id,
        role: 'AGENT_ADMIN',
      },
    });
    const adminB = await registerVerifyLogin('admin@org-b.test', built.emailProvider);
    await prisma.membership.create({
      data: {
        userId: (await prisma.user.findUnique({ where: { email: 'admin@org-b.test' } }))!.id,
        organizationId: orgB.id,
        role: 'AGENT_ADMIN',
      },
    });

    return { orgA, orgB, widgetA, widgetB, adminA, adminB };
  }

  const RATE_ALERTS_BODY = (
    publicKey: string,
    idempotencyKey: string,
    email = 'buyer@example.test',
  ) => ({
    widgetPublicKey: publicKey,
    contact: { email },
    requestedAction: 'RATE_ALERTS',
    consentSelections: ['RATE_ALERTS'],
    idempotencyKey,
  });

  it('accepts a valid lead submission and returns the neutral success shape', async () => {
    const { widgetA } = await setup();
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send(RATE_ALERTS_BODY(widgetA.publicKey, 'idem-key-0000000001'))
      .expect(201);
    expect(res.body).toEqual({ received: true });
    expect(prisma.leads).toHaveLength(1);
    expect(prisma.consentRecords).toHaveLength(1);
    expect(prisma.consentRecords[0]!.purpose).toBe('RATE_ALERTS');
    expect(prisma.auditEvents.some((e) => e.action === 'lead.captured')).toBe(true);
    expect(prisma.auditEvents.some((e) => e.action === 'consent.recorded')).toBe(true);
  });

  it('rejects missing consent for the requested action, recording nothing', async () => {
    const { widgetA } = await setup();
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send({
        widgetPublicKey: widgetA.publicKey,
        contact: { email: 'buyer2@example.test' },
        requestedAction: 'LENDER_CONTACT',
        consentSelections: ['RATE_ALERTS'], // wrong purpose for this action
        idempotencyKey: 'idem-key-0000000002',
      })
      .expect(400);
    expect(res.body.code).toBe('CONSENT_REQUIRED');
    expect(prisma.leads).toHaveLength(0);
    expect(prisma.consentRecords).toHaveLength(0);
  });

  it('rejects RATE_ALERTS consent without an email address', async () => {
    const { widgetA } = await setup();
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send({
        widgetPublicKey: widgetA.publicKey,
        contact: { phone: '555-123-4567' },
        requestedAction: 'RATE_ALERTS',
        consentSelections: ['RATE_ALERTS'],
        idempotencyKey: 'idem-key-0000000003',
      })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(prisma.leads).toHaveLength(0);
  });

  it('deduplicates repeat submissions with matching normalized contact into one Lead', async () => {
    const { widgetA } = await setup();
    await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send(RATE_ALERTS_BODY(widgetA.publicKey, 'idem-key-dup-1', 'Dup.Buyer@Example.TEST'))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send(RATE_ALERTS_BODY(widgetA.publicKey, 'idem-key-dup-2', 'dup.buyer@example.test'))
      .expect(201);

    expect(prisma.leads).toHaveLength(1);
    expect(prisma.consentRecords).toHaveLength(2); // one per submission, same lead
    expect(prisma.leadEvents.some((e) => e.eventType === 'LEAD_MATCHED_EXISTING')).toBe(true);
  });

  it('replays the same response for a repeated idempotency key with the same payload', async () => {
    const { widgetA } = await setup();
    const body = RATE_ALERTS_BODY(widgetA.publicKey, 'idem-key-replay-1', 'replay@example.test');
    const first = await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send(body)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send(body)
      .expect(201);
    expect(second.body).toEqual(first.body);
    expect(prisma.leads).toHaveLength(1); // not duplicated
  });

  it('returns 409 for the same idempotency key with a different payload', async () => {
    const { widgetA } = await setup();
    await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send(RATE_ALERTS_BODY(widgetA.publicKey, 'idem-key-conflict-1', 'a@example.test'))
      .expect(201);
    const conflict = await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send(RATE_ALERTS_BODY(widgetA.publicKey, 'idem-key-conflict-1', 'different@example.test'));
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('blocks the required purpose and transitions the lead to SUPPRESSED', async () => {
    const built = await buildTestApp({ LEAD_MATCH_HMAC_SECRET: 'a'.repeat(40) });
    app = built.app;
    prisma = built.prisma;
    const org = await prisma.organization.create({ data: { name: 'Org S', type: 'AGENT_ORG' } });
    const widget = await prisma.widget.create({
      data: {
        organizationId: org.id,
        publicKey: 'widget-s-public-key-ssssssssssssssss',
        name: 'Org S widget',
        themePrimaryColor: '#0f5c4a',
        allowedOrigins: [],
        enabledCalculators: ['AFFORDABILITY'],
      },
    });

    const { computeLeadMatchToken, normalizeEmail } = await import('@tech-realty-rentals/shared');
    const matchToken = await computeLeadMatchToken(
      'a'.repeat(40),
      normalizeEmail('suppressed-buyer@example.test'),
    );
    await prisma.suppressionRecord.create({
      data: {
        matchToken,
        purpose: 'RATE_ALERTS',
        channel: 'EMAIL',
        reason: 'USER_REQUESTED',
        source: 'test',
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send(RATE_ALERTS_BODY(widget.publicKey, 'idem-suppress-1', 'suppressed-buyer@example.test'))
      .expect(201);
    expect(res.body).toEqual({ received: true }); // still neutral

    expect(prisma.consentRecords).toHaveLength(0);
    expect(prisma.leads[0]!.status).toBe('SUPPRESSED');
    expect(prisma.leadEvents.some((e) => e.eventType === 'SUPPRESSION_BLOCKED')).toBe(true);
    expect(prisma.auditEvents.some((e) => e.action === 'lead.suppression_blocked')).toBe(true);
  });

  it('blocks only a suppressed SECONDARY purpose, leaving the lead NEW and the primary purpose granted', async () => {
    const built = await buildTestApp({ LEAD_MATCH_HMAC_SECRET: 'b'.repeat(40) });
    app = built.app;
    prisma = built.prisma;
    const org = await prisma.organization.create({ data: { name: 'Org T', type: 'AGENT_ORG' } });
    const widget = await prisma.widget.create({
      data: {
        organizationId: org.id,
        publicKey: 'widget-t-public-key-tttttttttttttttt',
        name: 'Org T widget',
        themePrimaryColor: '#0f5c4a',
        allowedOrigins: [],
        enabledCalculators: ['AFFORDABILITY'],
      },
    });

    const { computeLeadMatchToken, normalizeEmail } = await import('@tech-realty-rentals/shared');
    const matchToken = await computeLeadMatchToken(
      'b'.repeat(40),
      normalizeEmail('secondary-suppressed@example.test'),
    );
    // Suppress RATE_ALERTS specifically — the submission's REQUIRED purpose is SAVE_RESULTS.
    await prisma.suppressionRecord.create({
      data: {
        matchToken,
        purpose: 'RATE_ALERTS',
        channel: 'EMAIL',
        reason: 'USER_REQUESTED',
        source: 'test',
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send({
        widgetPublicKey: widget.publicKey,
        contact: { email: 'secondary-suppressed@example.test' },
        requestedAction: 'SAVE_RESULTS',
        consentSelections: ['SAVE_RESULTS', 'RATE_ALERTS'],
        idempotencyKey: 'idem-secondary-suppress-1',
      })
      .expect(201);
    expect(res.body).toEqual({ received: true });

    expect(prisma.leads[0]!.status).toBe('NEW'); // not suppressed overall
    expect(prisma.consentRecords).toHaveLength(1);
    expect(prisma.consentRecords[0]!.purpose).toBe('SAVE_RESULTS');
    expect(prisma.leadEvents.some((e) => e.eventType === 'SUPPRESSION_BLOCKED')).toBe(true);
  });

  it('rejects a lead submission for a PAUSED widget', async () => {
    const { widgetA } = await setup();
    const updated = await prisma.widget.update({
      where: { id: widgetA.id },
      data: { status: 'PAUSED' },
    });
    expect(updated.status).toBe('PAUSED');

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send(RATE_ALERTS_BODY(widgetA.publicKey, 'idem-paused-1'))
      .expect(403);
    expect(res.body.code).toBe('WIDGET_NOT_ACTIVE');
  });

  it('returns 404 for an unknown widget public key', async () => {
    await setup();
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send(RATE_ALERTS_BODY('unknown-widget-public-key-000000', 'idem-unknown-1'));
    expect(res.status).toBe(404);
  });

  describe('GET /agent/leads — tenant isolation and PII redaction', () => {
    it('never returns Org B leads to an Org-A-only caller (IDOR), and masks contact fields', async () => {
      const { widgetA, widgetB, adminA } = await setup();
      await request(app.getHttpServer())
        .post('/api/v1/public/leads')
        .send(RATE_ALERTS_BODY(widgetA.publicKey, 'idem-a-visible-1', 'orga-lead@example.test'))
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/public/leads')
        .send(RATE_ALERTS_BODY(widgetB.publicKey, 'idem-b-hidden-1', 'orgb-lead@example.test'))
        .expect(201);

      const orgAId = (
        (await prisma.widget.findUnique({ where: { publicKey: widgetA.publicKey } })) as {
          organizationId: string;
        }
      ).organizationId;

      const list = await adminA
        .get('/api/v1/agent/leads')
        .set('x-organization-id', orgAId)
        .expect(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0].maskedEmail).toBe('o***@example.test');
      expect(list.body.items[0].maskedEmail).not.toContain('orga-lead');
      expect(list.body.items[0].activePurposes).toEqual(['RATE_ALERTS']);
    });

    it('requires authentication', async () => {
      const { widgetA } = await setup();
      const orgAId = (
        (await prisma.widget.findUnique({ where: { publicKey: widgetA.publicKey } })) as {
          organizationId: string;
        }
      ).organizationId;
      const res = await request(app.getHttpServer())
        .get('/api/v1/agent/leads')
        .set('x-organization-id', orgAId);
      expect(res.status).toBe(401);
    });
  });

  describe('ConsentService.isPurposeCurrentlyGranted — forward-looking revocation unit test', () => {
    it('is true after granting and false after revoking (docs/07 §5 step 4)', async () => {
      const { widgetA } = await setup();
      await request(app.getHttpServer())
        .post('/api/v1/public/leads')
        .send(RATE_ALERTS_BODY(widgetA.publicKey, 'idem-revoke-1', 'revoke-me@example.test'))
        .expect(201);

      const leadId = prisma.leads[0]!.id;
      const consentId = prisma.consentRecords[0]!.id;

      const { ConsentService } = await import('../src/leads/consent.service');
      const consentService = app.get(ConsentService);

      expect(await consentService.isPurposeCurrentlyGranted(leadId, 'RATE_ALERTS')).toBe(true);
      await consentService.revoke(consentId, 'user requested revocation');
      expect(await consentService.isPurposeCurrentlyGranted(leadId, 'RATE_ALERTS')).toBe(false);
    });
  });
});
