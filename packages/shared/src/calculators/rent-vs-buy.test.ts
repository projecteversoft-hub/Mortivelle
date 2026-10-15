import { describe, expect, it } from 'vitest';
import { calculateRentVsBuy } from './rent-vs-buy';
import { rentVsBuyRequestSchema } from './schemas';

const ZEROED_FIXTURE = {
  currentMonthlyRent: 1800,
  rentAnnualGrowthPercent: 0,
  purchasePrice: 300_000,
  downPayment: 0,
  interestRatePercent: 6,
  termYears: 30,
  homeAppreciationAnnualPercent: 0,
  propertyTaxAnnualPercent: 0,
  insuranceAnnualPercent: 0,
  hoaMonthly: 0,
  maintenanceAnnualPercent: 0,
  buyingClosingCostsPercent: 0,
  sellingClosingCostsPercent: 0,
  investmentReturnAnnualPercent: 0,
  timeHorizonYears: 1,
};

describe('calculateRentVsBuy', () => {
  it('matches the hand-verified fixture (see rent-vs-buy.ts doc comment)', () => {
    const result = calculateRentVsBuy(ZEROED_FIXTURE);
    expect(result.renting.totalRentPaid).toBe(21_600);
    expect(result.renting.netCost).toBe(21_600);
    expect(result.buying.totalOwnershipCostsPaid).toBeCloseTo(1798.65 * 12, 0);
    expect(result.buying.netSaleProceeds).toBeGreaterThan(3_600);
    expect(result.buying.netSaleProceeds).toBeLessThan(3_800);
    expect(result.comparativeDifference).toBeGreaterThan(3_600);
    expect(result.comparativeDifference).toBeLessThan(3_800);
  });

  it('never claims a verdict in its data shape: both full breakdowns are always present', () => {
    const result = calculateRentVsBuy(ZEROED_FIXTURE);
    expect(result.renting).toBeDefined();
    expect(result.buying).toBeDefined();
    expect(typeof result.sensitivityWarning).toBe('string');
    expect(result.sensitivityWarning.length).toBeGreaterThan(0);
  });

  it('includes the required assumptions-sensitivity warning', () => {
    const result = calculateRentVsBuy(ZEROED_FIXTURE);
    expect(result.sensitivityWarning.toLowerCase()).toContain('sensitive');
  });

  it('handles a horizon longer than the loan term (loan fully paid off) without error', () => {
    const result = calculateRentVsBuy({
      ...ZEROED_FIXTURE,
      termYears: 5,
      timeHorizonYears: 10,
    });
    expect(result.buying.remainingLoanBalance).toBe(0);
    expect(Number.isFinite(result.buying.netCost)).toBe(true);
  });

  it('handles a zero interest rate safely', () => {
    const result = calculateRentVsBuy({ ...ZEROED_FIXTURE, interestRatePercent: 0 });
    expect(Number.isFinite(result.buying.netCost)).toBe(true);
    expect(Number.isFinite(result.comparativeDifference)).toBe(true);
  });

  it('labels every omitted field as default and every supplied field as user', () => {
    const result = calculateRentVsBuy({
      currentMonthlyRent: 2000,
      purchasePrice: 400_000,
      downPayment: 80_000,
      timeHorizonYears: 5,
      interestRatePercent: 7, // explicit
    });
    const byField = new Map(result.assumptionsUsed.map((a) => [a.field, a]));
    expect(byField.get('interestRatePercent')?.source).toBe('user');
    expect(byField.get('homeAppreciationAnnualPercent')?.source).toBe('default');
  });
});

describe('rentVsBuyRequestSchema (boundary / invalid input)', () => {
  it('rejects a down payment equal to or greater than the purchase price', () => {
    expect(
      rentVsBuyRequestSchema.safeParse({
        currentMonthlyRent: 1800,
        purchasePrice: 300_000,
        downPayment: 300_000,
        timeHorizonYears: 5,
      }).success,
    ).toBe(false);
  });

  it('rejects a zero time horizon', () => {
    expect(
      rentVsBuyRequestSchema.safeParse({
        currentMonthlyRent: 1800,
        purchasePrice: 300_000,
        downPayment: 0,
        timeHorizonYears: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects a missing required field', () => {
    expect(rentVsBuyRequestSchema.safeParse({ purchasePrice: 300_000 }).success).toBe(false);
  });

  it('rejects the wrong type for a numeric field', () => {
    expect(
      rentVsBuyRequestSchema.safeParse({
        currentMonthlyRent: '1800',
        purchasePrice: 300_000,
        downPayment: 0,
        timeHorizonYears: 5,
      }).success,
    ).toBe(false);
  });

  it('rejects an extreme negative growth rate outside the bounded range', () => {
    expect(
      rentVsBuyRequestSchema.safeParse({
        currentMonthlyRent: 1800,
        purchasePrice: 300_000,
        downPayment: 0,
        timeHorizonYears: 5,
        homeAppreciationAnnualPercent: -99,
      }).success,
    ).toBe(false);
  });
});
