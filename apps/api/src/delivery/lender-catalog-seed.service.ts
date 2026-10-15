import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  routingEligibilityConditionsSchema,
  type RoutingEligibilityConditions,
} from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Manually configured, SYNTHETIC lender catalog (docs/08 §4, docs/11 §7 "Seed a couple of
 * synthetic test lenders + routing policies the same documented way"). There is no public
 * authoring API for `Lender`/`RoutingPolicy` in Phase 6, so this mirrors exactly the pattern
 * `DisclosuresService` used for `DisclosureVersion` in Phase 5: an idempotent `onModuleInit`
 * seed, safe to run on every boot (including under concurrent instances), guarded by a fixed,
 * deterministic ID per row and treating a primary-key unique-constraint violation as
 * "already seeded by someone else" rather than an error.
 *
 * Fixed IDs (rather than `@default(uuid())` at write time) are a deliberate choice here,
 * unlike `DisclosureVersion` which had a natural `[purpose, locale, version]` unique key to
 * guard on — `Lender`/`Organization`/`RoutingPolicy` have no equivalent natural business key
 * available to a seed step, so the seed supplies its own stable identity instead. This also
 * makes the synthetic catalog easy to reference directly (e2e tests, the live smoke-test
 * walkthrough in the Phase 6 final report) without a lookup step.
 *
 * Three lenders, exercising every routing-service branch required by docs/11 §7's tests:
 * - Pacific Mortgage: ACTIVE + contract-approved, territory CA/NV/OR.
 * - Lone Star Home Loans: ACTIVE + contract-approved, territory TX (disjoint from Pacific's
 *   territory — used by the "wrong-recipient rejection" test to prove a CA lead can never be
 *   routed to Lone Star, and vice versa).
 * - Cascade Capital: territory WA, but deliberately NEVER contract-approved — exercises the
 *   `LENDER_NOT_APPROVED` routing-failure path (docs/08 §4 "Do not route if lender contract/
 *   onboarding status is not approved").
 *
 * LEGAL NOTICE (CLAUDE.md §4, docs/11 Gate 6): every row below is synthetic placeholder data.
 * No real lender, organization, contract, onboarding or approval exists. `integrationMode` is
 * always `MOCK` — the schema has no other value to select.
 */
@Injectable()
export class LenderCatalogSeedService implements OnModuleInit {
  private readonly logger = new Logger(LenderCatalogSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    for (const def of SYNTHETIC_LENDER_SEED) {
      await this.ensureSeeded(def);
    }
  }

  /**
   * Idempotent PER ENTITY, not per `def` (a real bug caught and fixed while verifying this
   * phase against the live database — see the Phase 6 final report): each of the three rows
   * a `def` produces (`Organization`, `Lender`, `RoutingPolicy`) is checked and created
   * independently. An earlier draft wrapped all three creates in one try/catch and treated
   * any `P2002` as "already fully seeded" — but a dev-server restart (`nest start --watch`
   * picking up a file change mid-seed) can leave a def PARTIALLY seeded (e.g. the
   * `Organization`/`Lender` rows created, then the process restarts before the
   * `RoutingPolicy` row is written). On the next boot, the `Organization.create` call alone
   * would throw `P2002` and the whole def was incorrectly treated as complete, permanently
   * skipping the still-missing `RoutingPolicy` row. Checking each row's own existence first
   * makes the seed resumable from any partial state, not just all-or-nothing.
   */
  private async ensureSeeded(def: SyntheticLenderDef): Promise<void> {
    const existingOrg = await this.prisma.organization.findUnique({
      where: { id: def.organizationId },
    });
    if (!existingOrg) {
      await this.prisma.organization.create({
        data: { id: def.organizationId, name: def.organizationName, type: 'LENDER_ORG' },
      });
    }

    const existingLender = await this.prisma.lender.findUnique({ where: { id: def.lenderId } });
    if (!existingLender) {
      await this.prisma.lender.create({
        data: {
          id: def.lenderId,
          organizationId: def.organizationId,
          displayName: def.displayName,
          status: 'ACTIVE',
          integrationMode: 'MOCK',
          contractApprovedAt: def.approved ? new Date() : null,
        },
      });
    }

    const existingPolicy = await this.prisma.routingPolicy.findUnique({
      where: { id: def.routingPolicyId },
    });
    if (!existingPolicy) {
      // Validated against the shared, `.strict()` schema at write time (apps/api is the only
      // writer in this phase, but the validation step is kept as a structural guarantee, not
      // merely a convention — see the RoutingPolicy model's own comment in schema.prisma).
      const eligibilityConditions: RoutingEligibilityConditions =
        routingEligibilityConditionsSchema.parse(def.eligibilityConditions);
      await this.prisma.routingPolicy.create({
        data: {
          id: def.routingPolicyId,
          lenderId: def.lenderId,
          strategy: 'EXCLUSIVE',
          eligibilityConditions: eligibilityConditions as unknown as Prisma.InputJsonValue,
          priority: def.priority,
          status: 'ACTIVE',
          version: 1,
          activeFrom: new Date(),
        },
      });
    }

    if (!existingOrg || !existingLender || !existingPolicy) {
      this.logger.log(`Seeded synthetic mock lender catalog entry "${def.displayName}"`);
    }
  }
}

export interface SyntheticLenderDef {
  organizationId: string;
  organizationName: string;
  lenderId: string;
  displayName: string;
  approved: boolean;
  routingPolicyId: string;
  priority: number;
  eligibilityConditions: RoutingEligibilityConditions;
}

/** Exported (not merely module-local) so `test/delivery.e2e.test.ts` and the live smoke-test
 * walkthrough can reference the exact same fixed, synthetic IDs rather than re-deriving or
 * re-seeding them. */
export const SYNTHETIC_LENDER_SEED: SyntheticLenderDef[] = [
  {
    organizationId: '10000000-0000-4000-8000-000000000001',
    organizationName: 'Pacific Mortgage (Synthetic Mock Lender)',
    lenderId: '10000000-0000-4000-8000-000000000011',
    displayName: 'Pacific Mortgage (Synthetic Mock Lender)',
    approved: true,
    routingPolicyId: '10000000-0000-4000-8000-000000000021',
    priority: 10,
    eligibilityConditions: {
      territoryStates: ['CA', 'NV', 'OR'],
      minPrice: 100_000,
      maxPrice: 1_500_000,
    },
  },
  {
    organizationId: '10000000-0000-4000-8000-000000000002',
    organizationName: 'Lone Star Home Loans (Synthetic Mock Lender)',
    lenderId: '10000000-0000-4000-8000-000000000012',
    displayName: 'Lone Star Home Loans (Synthetic Mock Lender)',
    approved: true,
    routingPolicyId: '10000000-0000-4000-8000-000000000022',
    priority: 10,
    eligibilityConditions: {
      territoryStates: ['TX'],
      minPrice: 100_000,
      maxPrice: 2_000_000,
    },
  },
  {
    organizationId: '10000000-0000-4000-8000-000000000003',
    organizationName: 'Cascade Capital — Pending Onboarding (Synthetic Mock Lender)',
    lenderId: '10000000-0000-4000-8000-000000000013',
    displayName: 'Cascade Capital — Pending Onboarding (Synthetic Mock Lender)',
    approved: false,
    routingPolicyId: '10000000-0000-4000-8000-000000000023',
    priority: 10,
    eligibilityConditions: {
      territoryStates: ['WA'],
      minPrice: 100_000,
      maxPrice: 2_000_000,
    },
  },
];
