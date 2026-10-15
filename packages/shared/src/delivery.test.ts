import { describe, expect, it } from 'vitest';
import {
  BuyerStatus,
  evaluateRoutingEligibility,
  routingEligibilityConditionsSchema,
  type RoutingLeadAttributes,
} from './delivery';

const NO_LEAD: RoutingLeadAttributes = {
  state: null,
  priceMin: null,
  priceMax: null,
  buyerStatus: null,
};

describe('routingEligibilityConditionsSchema (docs/08 §4 — approved, non-sensitive criteria only)', () => {
  it('accepts territory-only conditions', () => {
    expect(
      routingEligibilityConditionsSchema.safeParse({ territoryStates: ['CA', 'NV'] }).success,
    ).toBe(true);
  });

  it('rejects an empty territory list (fail-closed by construction)', () => {
    expect(routingEligibilityConditionsSchema.safeParse({ territoryStates: [] }).success).toBe(
      false,
    );
  });

  it('rejects minPrice greater than maxPrice', () => {
    const result = routingEligibilityConditionsSchema.safeParse({
      territoryStates: ['CA'],
      minPrice: 500_000,
      maxPrice: 100_000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects any field outside the approved, non-sensitive set — e.g. a protected trait', () => {
    const result = routingEligibilityConditionsSchema.safeParse({
      territoryStates: ['CA'],
      race: 'anything', // must never be a valid field, by construction (.strict())
    });
    expect(result.success).toBe(false);
  });
});

describe('evaluateRoutingEligibility — pure routing-match function (docs/11 §7)', () => {
  const criteria = routingEligibilityConditionsSchema.parse({
    territoryStates: ['CA', 'NV'],
    minPrice: 200_000,
    maxPrice: 800_000,
    buyerStatuses: [BuyerStatus.FirstTimeBuyer],
  });

  it('matches a lead inside territory, price range and buyer status', () => {
    expect(
      evaluateRoutingEligibility(criteria, {
        state: 'CA',
        priceMin: 300_000,
        priceMax: 400_000,
        buyerStatus: BuyerStatus.FirstTimeBuyer,
      }),
    ).toBe(true);
  });

  it('rejects a lead outside the territory list', () => {
    expect(
      evaluateRoutingEligibility(criteria, {
        state: 'TX',
        priceMin: 300_000,
        priceMax: 400_000,
        buyerStatus: BuyerStatus.FirstTimeBuyer,
      }),
    ).toBe(false);
  });

  it('rejects a lead with no state at all (fail-closed)', () => {
    expect(evaluateRoutingEligibility(criteria, NO_LEAD)).toBe(false);
  });

  it('rejects a lead whose price range does not overlap the policy range', () => {
    expect(
      evaluateRoutingEligibility(criteria, {
        state: 'CA',
        priceMin: 900_000,
        priceMax: 1_000_000,
        buyerStatus: BuyerStatus.FirstTimeBuyer,
      }),
    ).toBe(false);
  });

  it('matches on partial price overlap (lead range straddles policy bound)', () => {
    expect(
      evaluateRoutingEligibility(criteria, {
        state: 'NV',
        priceMin: 150_000,
        priceMax: 250_000,
        buyerStatus: BuyerStatus.FirstTimeBuyer,
      }),
    ).toBe(true);
  });

  it('fails closed when the policy constrains price but the lead supplied none', () => {
    expect(
      evaluateRoutingEligibility(criteria, {
        state: 'CA',
        priceMin: null,
        priceMax: null,
        buyerStatus: BuyerStatus.FirstTimeBuyer,
      }),
    ).toBe(false);
  });

  it('rejects a buyer status outside the policy allow-list', () => {
    expect(
      evaluateRoutingEligibility(criteria, {
        state: 'CA',
        priceMin: 300_000,
        priceMax: 400_000,
        buyerStatus: BuyerStatus.Investor,
      }),
    ).toBe(false);
  });

  it('treats an absent/empty buyerStatuses condition as "any buyer status matches"', () => {
    const noStatusFilter = routingEligibilityConditionsSchema.parse({ territoryStates: ['CA'] });
    expect(
      evaluateRoutingEligibility(noStatusFilter, {
        state: 'CA',
        priceMin: null,
        priceMax: null,
        buyerStatus: BuyerStatus.Investor,
      }),
    ).toBe(true);
  });

  it('never infers or requires a protected trait to evaluate a match', () => {
    // The lead attribute shape itself has no protected-trait field to pass in the first
    // place — this test documents that invariant rather than exercising a code branch.
    const attrs: RoutingLeadAttributes = {
      state: 'CA',
      priceMin: 300_000,
      priceMax: 400_000,
      buyerStatus: BuyerStatus.FirstTimeBuyer,
    };
    expect(Object.keys(attrs).sort()).toEqual(
      ['buyerStatus', 'priceMax', 'priceMin', 'state'].sort(),
    );
  });
});
