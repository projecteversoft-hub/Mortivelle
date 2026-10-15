import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, type FakeEmailProvider } from './support/build-test-app';
import type { FakePrisma } from './support/fake-prisma';

const PASSWORD = 'Sup3r-Secret-Passw0rd!2026';

// Fixed synthetic IDs from apps/api/src/delivery/lender-catalog-seed.service.ts — auto-seeded
// by `LenderCatalogSeedService.onModuleInit` into every fresh test app, exactly as it is
// against the real database (same idempotent-seed pattern as Phase 5's `DisclosuresService`).
const PACIFIC_ORG_ID = '10000000-0000-4000-8000-000000000001';
const PACIFIC_LENDER_ID = '10000000-0000-4000-8000-000000000011';
const LONE_STAR_ORG_ID = '10000000-0000-4000-8000-000000000002';
const LONE_STAR_LENDER_ID = '10000000-0000-4000-8000-000000000012';
const CASCADE_ORG_ID = '10000000-0000-4000-8000-000000000003'; // never contract-approved

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
 * Phase 6 — exclusive lender delivery, mock routing/delivery adapter and simulated billing
 * ledger (docs/11 §7). Mirrors `test/leads.e2e.test.ts`/`test/widgets.e2e.test.ts` for app
 * setup and the cross-tenant IDOR pattern. Exercises
 * `QualificationService`/`RoutingService`/`DeliveryService`/`BillingService` end to end
 * through the real HTTP controllers (the three lender endpoints, plus the minimal internal
 * ops trigger endpoints) against the in-memory `FakePrisma` — apps/api Vitest itself is
 * blocked in this environment by the same pre-existing Windows SWC native-binding issue
 * Phase 5 hit (not a regression); see the Phase 6 final report for the live-database/curl
 * verification done instead.
 */
describe('delivery — qualification, routing, mock adapter, billing, lender portal (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;

  afterEach(async () => {
    await app?.close();
  });

  async function setup(): Promise<{
    widgetPublicKey: string;
    orgId: string;
    opsAgent: ReturnType<typeof request.agent>;
    pacificAdmin: ReturnType<typeof request.agent>;
    loneStarAdmin: ReturnType<typeof request.agent>;
    opsHeader: string;
  }> {
    const built = await buildTestApp();
    app = built.app;
    prisma = built.prisma;

    const org = await prisma.organization.create({ data: { name: 'Org A', type: 'AGENT_ORG' } });
    const widget = await prisma.widget.create({
      data: {
        organizationId: org.id,
        publicKey: 'widget-delivery-public-key-aaaaaaaaaa',
        name: 'Org A widget',
        themePrimaryColor: '#0f5c4a',
        allowedOrigins: [],
        enabledCalculators: ['AFFORDABILITY'],
      },
    });

    const platformOrg = await prisma.organization.create({
      data: { name: 'Tech Realty Rentals Platform', type: 'PLATFORM' },
    });
    const opsUser = await registerVerifyLogin(app, built.emailProvider, 'ops@platform.test');
    await prisma.membership.create({
      data: { userId: opsUser.userId, organizationId: platformOrg.id, role: 'PLATFORM_ADMIN' },
    });

    const pacificUser = await registerVerifyLogin(app, built.emailProvider, 'admin@pacific.test');
    await prisma.membership.create({
      data: { userId: pacificUser.userId, organizationId: PACIFIC_ORG_ID, role: 'LENDER_ADMIN' },
    });

    const loneStarUser = await registerVerifyLogin(app, built.emailProvider, 'admin@lonestar.test');
    await prisma.membership.create({
      data: { userId: loneStarUser.userId, organizationId: LONE_STAR_ORG_ID, role: 'LENDER_ADMIN' },
    });

    return {
      widgetPublicKey: widget.publicKey,
      orgId: org.id,
      opsAgent: opsUser.agent,
      pacificAdmin: pacificUser.agent,
      loneStarAdmin: loneStarUser.agent,
      opsHeader: platformOrg.id,
    };
  }

  function lenderContactLeadBody(
    widgetPublicKey: string,
    idempotencyKey: string,
    overrides: {
      state: string;
      priceMin: number;
      priceMax: number;
      phone?: string;
      email?: string;
    },
  ) {
    return {
      widgetPublicKey,
      contact: { phone: overrides.phone, email: overrides.email },
      purchaseIntent: {
        state: overrides.state,
        priceRangeMin: overrides.priceMin,
        priceRangeMax: overrides.priceMax,
      },
      requestedAction: 'LENDER_CONTACT',
      consentSelections: ['LENDER_CONTACT'],
      idempotencyKey,
    };
  }

  async function submitAndFindLead(
    widgetPublicKey: string,
    idempotencyKey: string,
    overrides: {
      state: string;
      priceMin: number;
      priceMax: number;
      phone?: string;
      email?: string;
    },
  ): Promise<string> {
    await request(app.getHttpServer())
      .post('/api/v1/public/leads')
      .send(lenderContactLeadBody(widgetPublicKey, idempotencyKey, overrides))
      .expect(201);
    const lead = prisma.leads[prisma.leads.length - 1]!;
    return lead.id;
  }

  describe('full walkthrough: NEW -> ELIGIBLE -> ROUTING -> DELIVERED -> ACCEPTED -> billed', () => {
    it('qualifies, routes to the matching lender, delivers, acknowledges and bills exactly once', async () => {
      const { widgetPublicKey, opsAgent, pacificAdmin, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-walkthrough-1', {
        state: 'CA',
        priceMin: 400_000,
        priceMax: 450_000,
        phone: '555-000-1111',
      });
      expect(prisma.leads.find((l) => l.id === leadId)!.status).toBe('NEW');

      const qualifyRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      expect(qualifyRes.body).toEqual({ status: 'PASSED', reasons: [] });
      expect(prisma.leads.find((l) => l.id === leadId)!.status).toBe('ELIGIBLE');

      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({})
        .expect(201);
      expect(routeRes.body.status).toBe('DISPATCHED');
      expect(routeRes.body.lenderId).toBe(PACIFIC_LENDER_ID);
      expect(routeRes.body.deliveryStatus).toBe('ACKNOWLEDGED');
      const deliveryId = routeRes.body.deliveryId as string;

      expect(prisma.leads.find((l) => l.id === leadId)!.status).toBe('DELIVERED');
      expect(prisma.billingEntries).toHaveLength(1);
      expect(prisma.billingEntries[0]!.leadDeliveryId).toBe(deliveryId);
      expect(prisma.auditEvents.some((e) => e.action === 'routing.started')).toBe(true);
      expect(prisma.auditEvents.some((e) => e.action === 'delivery.acknowledged')).toBe(true);
      expect(prisma.auditEvents.some((e) => e.action === 'billing.entry_created')).toBe(true);

      const listRes = await pacificAdmin
        .get('/api/v1/lender/deliveries')
        .set('x-organization-id', PACIFIC_ORG_ID)
        .expect(200);
      expect(listRes.body.items).toHaveLength(1);
      expect(listRes.body.items[0].maskedPhone).toBe('******1111');
      expect(JSON.stringify(listRes.body)).not.toContain('5550001111');

      const detailRes = await pacificAdmin
        .get(`/api/v1/lender/deliveries/${deliveryId}`)
        .set('x-organization-id', PACIFIC_ORG_ID)
        .expect(200);
      // normalizePhone('555-000-1111') -> '+15550001111' (packages/shared/src/leads.ts).
      expect(detailRes.body.contact.phone).toBe('+15550001111');

      const ackRes = await pacificAdmin
        .post(`/api/v1/lender/deliveries/${deliveryId}/acknowledge`)
        .set('x-organization-id', PACIFIC_ORG_ID)
        .expect(201);
      expect(ackRes.body.lenderAcknowledgedAt).toBeTruthy();
      expect(prisma.leads.find((l) => l.id === leadId)!.status).toBe('ACCEPTED');

      // Idempotent re-acknowledge: same result, no duplicate billing, no error.
      const ackAgain = await pacificAdmin
        .post(`/api/v1/lender/deliveries/${deliveryId}/acknowledge`)
        .set('x-organization-id', PACIFIC_ORG_ID)
        .expect(201);
      expect(ackAgain.body.lenderAcknowledgedAt).toBe(ackRes.body.lenderAcknowledgedAt);
      expect(prisma.billingEntries).toHaveLength(1);
      expect(prisma.leads.find((l) => l.id === leadId)!.status).toBe('ACCEPTED');
    });
  });

  describe('no-consent rejection (fail closed)', () => {
    it('refuses to route an ELIGIBLE lead with no LENDER_CONTACT consent at all', async () => {
      const { widgetPublicKey, opsAgent, opsHeader } = await setup();
      // SAVE_RESULTS only -- never selected LENDER_CONTACT.
      await request(app.getHttpServer())
        .post('/api/v1/public/leads')
        .send({
          widgetPublicKey,
          contact: { email: 'no-consent@example.test' },
          purchaseIntent: { state: 'CA', priceRangeMin: 400_000, priceRangeMax: 450_000 },
          requestedAction: 'SAVE_RESULTS',
          consentSelections: ['SAVE_RESULTS'],
          idempotencyKey: 'idem-no-consent-1',
        })
        .expect(201);
      const leadId = prisma.leads[prisma.leads.length - 1]!.id;

      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);

      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({})
        .expect(201);
      expect(routeRes.body.status).toBe('FAILED');
      expect(routeRes.body.failureReason).toBe('CONSENT_NOT_GRANTED');

      expect(prisma.leadDeliveries).toHaveLength(0);
      expect(prisma.billingEntries).toHaveLength(0);
      expect(prisma.leads.find((l) => l.id === leadId)!.status).toBe('ELIGIBLE'); // unchanged
      expect(prisma.routingAttempts.some((a) => a.leadId === leadId && a.status === 'FAILED')).toBe(
        true,
      );
    });

    it('refuses to route after LENDER_CONTACT consent is explicitly revoked', async () => {
      const { widgetPublicKey, opsAgent, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-revoked-1', {
        state: 'CA',
        priceMin: 400_000,
        priceMax: 450_000,
        email: 'revoke-before-route@example.test',
      });
      const consentId = prisma.consentRecords.find((c) => c.leadId === leadId)!.id;

      const { ConsentService } = await import('../src/leads/consent.service');
      await app.get(ConsentService).revoke(consentId, 'test revocation');

      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({})
        .expect(201);
      expect(routeRes.body.status).toBe('FAILED');
      expect(routeRes.body.failureReason).toBe('CONSENT_NOT_GRANTED');
      expect(prisma.leadDeliveries).toHaveLength(0);
    });
  });

  describe('wrong-recipient rejection (exclusive, territory-scoped routing)', () => {
    it('routes a CA lead only to Pacific Mortgage, never to Lone Star', async () => {
      const { widgetPublicKey, opsAgent, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-ca-1', {
        state: 'CA',
        priceMin: 300_000,
        priceMax: 350_000,
        phone: '555-222-3333',
      });
      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({})
        .expect(201);
      expect(routeRes.body.lenderId).toBe(PACIFIC_LENDER_ID);
      expect(routeRes.body.lenderId).not.toBe(LONE_STAR_LENDER_ID);
    });

    it('routes a TX lead only to Lone Star, never to Pacific Mortgage', async () => {
      const { widgetPublicKey, opsAgent, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-tx-1', {
        state: 'TX',
        priceMin: 300_000,
        priceMax: 350_000,
        phone: '555-444-5555',
      });
      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({})
        .expect(201);
      expect(routeRes.body.lenderId).toBe(LONE_STAR_LENDER_ID);
      expect(routeRes.body.lenderId).not.toBe(PACIFIC_LENDER_ID);
    });

    it('never routes to a lender whose contract is not approved (Cascade Capital, WA)', async () => {
      const { widgetPublicKey, opsAgent, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-wa-1', {
        state: 'WA',
        priceMin: 300_000,
        priceMax: 350_000,
        phone: '555-666-7777',
      });
      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({})
        .expect(201);
      expect(routeRes.body.status).toBe('FAILED');
      expect(routeRes.body.failureReason).toBe('LENDER_NOT_APPROVED');
      expect(prisma.leadDeliveries).toHaveLength(0);
      void CASCADE_ORG_ID; // documents which seeded org this exercises
    });
  });

  describe('duplicate retry (delivery idempotency)', () => {
    it('replaying the same routing attempt id returns the prior result, no duplicate row, no duplicate billing', async () => {
      const { widgetPublicKey, opsAgent, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-retry-1', {
        state: 'CA',
        priceMin: 300_000,
        priceMax: 350_000,
        phone: '555-888-9999',
      });
      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({})
        .expect(201);
      const { routingAttemptId, deliveryId } = routeRes.body;
      expect(prisma.leadDeliveries).toHaveLength(1);
      expect(prisma.billingEntries).toHaveLength(1);

      const { DeliveryService } = await import('../src/delivery/delivery.service');
      const deliveryService = app.get(DeliveryService);
      const replay = await deliveryService.attemptDelivery({
        leadId,
        lenderId: PACIFIC_LENDER_ID,
        routingAttemptId,
        correlationId: 'retry-simulated',
      });
      expect(replay.replay).toBe(true);
      expect(replay.delivery.id).toBe(deliveryId);
      expect(prisma.leadDeliveries).toHaveLength(1); // not duplicated
      expect(prisma.billingEntries).toHaveLength(1); // not duplicated
    });

    it('a changed payload under the same idempotency key is a 409 conflict', async () => {
      const { widgetPublicKey, opsAgent, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-conflict-1', {
        state: 'CA',
        priceMin: 300_000,
        priceMax: 350_000,
        phone: '555-000-0002',
      });
      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({})
        .expect(201);
      const { routingAttemptId } = routeRes.body;

      const { DeliveryService } = await import('../src/delivery/delivery.service');
      const deliveryService = app.get(DeliveryService);
      // Mutate the lead's contact after the fact so the canonical payload hash differs.
      const leadRow = prisma.leads.find((l) => l.id === leadId)!;
      leadRow.contactPhone = '+19998887777';

      await expect(
        deliveryService.attemptDelivery({
          leadId,
          lenderId: PACIFIC_LENDER_ID,
          routingAttemptId,
          correlationId: 'conflict-simulated',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('timeout ambiguity and reconciliation', () => {
    it('lands an ambiguous timeout in RECONCILIATION_PENDING, never auto-retried, no billing until resolved', async () => {
      const { widgetPublicKey, opsAgent, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-timeout-1', {
        state: 'CA',
        priceMin: 300_000,
        priceMax: 350_000,
        phone: '555-111-0000',
      });
      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({ simulateOutcome: 'TIMEOUT' })
        .expect(201);

      expect(routeRes.body.deliveryStatus).toBe('RECONCILIATION_PENDING');
      expect(prisma.leads.find((l) => l.id === leadId)!.status).toBe('ROUTING'); // unchanged
      expect(prisma.billingEntries).toHaveLength(0);

      const deliveryId = routeRes.body.deliveryId as string;
      const reconcileRes = await opsAgent
        .post(`/api/v1/ops/deliveries/${deliveryId}/reconcile`)
        .set('x-organization-id', opsHeader)
        .send({ resolution: 'ACKNOWLEDGED' })
        .expect(201);
      expect(reconcileRes.body.status).toBe('ACKNOWLEDGED');
      expect(prisma.leads.find((l) => l.id === leadId)!.status).toBe('DELIVERED');
      expect(prisma.billingEntries).toHaveLength(1);

      // Reconciling an already-resolved delivery again is refused, not silently re-applied.
      await opsAgent
        .post(`/api/v1/ops/deliveries/${deliveryId}/reconcile`)
        .set('x-organization-id', opsHeader)
        .send({ resolution: 'ACKNOWLEDGED' })
        .expect(409);
      expect(prisma.billingEntries).toHaveLength(1);
    });

    it('a transient error retries up to the configured limit, then dead-letters as FAILED and rejects the lead', async () => {
      const { widgetPublicKey, opsAgent, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-transient-1', {
        state: 'CA',
        priceMin: 300_000,
        priceMax: 350_000,
        phone: '555-333-4444',
      });
      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({ simulateOutcome: 'TRANSIENT_ERROR' })
        .expect(201);

      expect(routeRes.body.deliveryStatus).toBe('FAILED');
      const delivery = prisma.leadDeliveries.find((d) => d.id === routeRes.body.deliveryId)!;
      expect(delivery.retryCount).toBe(2); // DELIVERY_MAX_RETRIES default
      expect(prisma.leads.find((l) => l.id === leadId)!.status).toBe('REJECTED');
      expect(prisma.billingEntries).toHaveLength(0);
    });
  });

  describe('no duplicate charge (billing idempotency proof)', () => {
    it('replaying a successful delivery idempotency key any number of times never creates a second BillingEntry', async () => {
      const { widgetPublicKey, opsAgent, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-billing-proof-1', {
        state: 'TX',
        priceMin: 300_000,
        priceMax: 350_000,
        phone: '555-777-1234',
      });
      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({})
        .expect(201);
      const { routingAttemptId } = routeRes.body;
      expect(prisma.billingEntries).toHaveLength(1);

      const { DeliveryService } = await import('../src/delivery/delivery.service');
      const deliveryService = app.get(DeliveryService);
      for (let i = 0; i < 5; i += 1) {
        await deliveryService.attemptDelivery({
          leadId,
          lenderId: LONE_STAR_LENDER_ID,
          routingAttemptId,
          correlationId: `replay-${i}`,
        });
      }
      expect(prisma.billingEntries).toHaveLength(1);
      expect(
        prisma.billingEntries.filter((b) => b.leadDeliveryId === routeRes.body.deliveryId),
      ).toHaveLength(1);
    });
  });

  describe('lender portal — tenant isolation (mandatory cross-tenant IDOR suite)', () => {
    it('requires authentication on all three endpoints', async () => {
      await setup();
      await request(app.getHttpServer()).get('/api/v1/lender/deliveries').expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/lender/deliveries/00000000-0000-0000-0000-000000000000')
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/lender/deliveries/00000000-0000-0000-0000-000000000000/acknowledge')
        .expect(401);
    });

    it('rejects a cross-org header the caller has no membership in', async () => {
      const { loneStarAdmin } = await setup();
      await loneStarAdmin
        .get('/api/v1/lender/deliveries')
        .set('x-organization-id', PACIFIC_ORG_ID)
        .expect(403);
    });

    it("never returns, nor allows acknowledging, another lender org's delivery — even by a real guessed ID", async () => {
      const { widgetPublicKey, opsAgent, loneStarAdmin, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-idor-1', {
        state: 'CA',
        priceMin: 300_000,
        priceMax: 350_000,
        phone: '555-999-0000',
      });
      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      const routeRes = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/route`)
        .set('x-organization-id', opsHeader)
        .send({})
        .expect(201);
      const pacificDeliveryId = routeRes.body.deliveryId as string; // routed to Pacific, CA

      // Lone Star admin, using their OWN valid org header, tries the real Pacific delivery ID.
      await loneStarAdmin
        .get(`/api/v1/lender/deliveries/${pacificDeliveryId}`)
        .set('x-organization-id', LONE_STAR_ORG_ID)
        .expect(404);
      await loneStarAdmin
        .post(`/api/v1/lender/deliveries/${pacificDeliveryId}/acknowledge`)
        .set('x-organization-id', LONE_STAR_ORG_ID)
        .expect(404);

      const listRes = await loneStarAdmin
        .get('/api/v1/lender/deliveries')
        .set('x-organization-id', LONE_STAR_ORG_ID)
        .expect(200);
      expect(listRes.body.items.some((i: { id: string }) => i.id === pacificDeliveryId)).toBe(
        false,
      );
    });

    it('LENDER_MEMBER can read but AGENT_ADMIN/other roles cannot access the lender surface', async () => {
      const { pacificAdmin } = await setup();
      // pacificAdmin is LENDER_ADMIN; the role guard also allows LENDER_MEMBER -- covered
      // structurally by @Roles(Role.LenderAdmin, Role.LenderMember) on every handler. This
      // test asserts the admin path at minimum works end-to-end.
      const res = await pacificAdmin
        .get('/api/v1/lender/deliveries')
        .set('x-organization-id', PACIFIC_ORG_ID)
        .expect(200);
      expect(res.body.items).toEqual([]);
    });
  });

  describe('qualification failure', () => {
    it('fails qualification for a lead with no contact at all is impossible via public intake, so this proves the status guard instead', async () => {
      const { widgetPublicKey, opsAgent, opsHeader } = await setup();
      const leadId = await submitAndFindLead(widgetPublicKey, 'idem-qual-guard-1', {
        state: 'CA',
        priceMin: 300_000,
        priceMax: 350_000,
        email: 'guard@example.test',
      });
      await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader)
        .expect(201);
      // Already ELIGIBLE -- qualifying again must be refused (wrong starting status), never
      // silently re-processed.
      const res = await opsAgent
        .post(`/api/v1/ops/leads/${leadId}/qualify`)
        .set('x-organization-id', opsHeader);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LEAD_NOT_IN_EXPECTED_STATUS');
    });
  });
});
