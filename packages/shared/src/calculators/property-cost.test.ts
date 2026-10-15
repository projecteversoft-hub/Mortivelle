import { describe, expect, it } from 'vitest';
import { calculatePropertyCost } from './property-cost';
import { propertyCostRequestSchema } from './schemas';

describe('calculatePropertyCost', () => {
  it('matches the hand-verified fixture (see property-cost.ts doc comment)', () => {
    const result = calculatePropertyCost({
      purchasePrice: 300_000,
      downPayment: 0,
      interestRatePercent: 6,
      termYears: 30,
      propertyTaxAnnualAmount: 0,
      insuranceAnnualAmount: 0,
      hoaMonthly: 0,
      otherMonthlyCosts: 0,
      closingCostsAmount: 0,
    });
    expect(result.loanAmount).toBe(300_000);
    expect(result.monthlyBreakdown.principalAndInterest).toBeCloseTo(1798.65, 1);
    expect(result.monthlyBreakdown.totalMonthlyOwnershipCost).toBeCloseTo(1798.65, 1);
    expect(result.estimatedCashDueAtClosing.total).toBe(0);
  });

  it('separates P&I from total ownership cost when taxes/insurance/HOA are present', () => {
    const result = calculatePropertyCost({
      purchasePrice: 300_000,
      downPayment: 60_000,
      interestRatePercent: 6,
      termYears: 30,
      propertyTaxAnnualAmount: 3600, // $300/mo
      insuranceAnnualAmount: 1200, // $100/mo
      hoaMonthly: 50,
    });
    expect(result.monthlyBreakdown.propertyTax).toBe(300);
    expect(result.monthlyBreakdown.insurance).toBe(100);
    expect(result.monthlyBreakdown.hoa).toBe(50);
    expect(result.monthlyBreakdown.totalMonthlyOwnershipCost).toBeCloseTo(
      result.monthlyBreakdown.principalAndInterest + 300 + 100 + 50,
      2,
    );
  });

  it('applies illustrative defaults, scaled off price, for omitted tax/insurance and labels them as defaults', () => {
    const result = calculatePropertyCost({ purchasePrice: 300_000, downPayment: 60_000 });
    const byField = new Map(result.assumptionsUsed.map((a) => [a.field, a]));
    expect(byField.get('propertyTaxAnnualAmount')?.source).toBe('default');
    expect(byField.get('propertyTaxAnnualAmount')?.value).toBeCloseTo((300_000 * 1.1) / 100, 5);
  });

  it('never echoes a floating-point artifact in a defaulted money value', () => {
    // Regression test: purchasePrice * 1.1 / 100 on 200000 produced
    // 2200.0000000000005 before echoed money assumptions were rounded to cents.
    const result = calculatePropertyCost({ purchasePrice: 200_000, downPayment: 40_000 });
    const propertyTax = result.assumptionsUsed.find((a) => a.field === 'propertyTaxAnnualAmount');
    expect(propertyTax?.value).toBe(2200);
    expect(String(propertyTax?.value)).not.toContain('000000');
  });

  it('includes a positive estimated cash due at closing by default (down payment + illustrative closing costs)', () => {
    const result = calculatePropertyCost({ purchasePrice: 300_000, downPayment: 60_000 });
    expect(result.estimatedCashDueAtClosing.closingCosts).toBeGreaterThan(0);
    expect(result.estimatedCashDueAtClosing.total).toBeCloseTo(
      60_000 + result.estimatedCashDueAtClosing.closingCosts,
      2,
    );
  });

  it('handles a zero interest rate safely', () => {
    const result = calculatePropertyCost({
      purchasePrice: 200_000,
      downPayment: 40_000,
      interestRatePercent: 0,
      termYears: 20,
    });
    expect(Number.isFinite(result.monthlyBreakdown.principalAndInterest)).toBe(true);
    // The response value is rounded to the nearest cent, so compare at cent precision.
    expect(result.monthlyBreakdown.principalAndInterest).toBeCloseTo(160_000 / (20 * 12), 1);
  });
});

describe('propertyCostRequestSchema (boundary / invalid input)', () => {
  it('rejects a down payment equal to the purchase price', () => {
    const result = propertyCostRequestSchema.safeParse({
      purchasePrice: 300_000,
      downPayment: 300_000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a down payment greater than the purchase price', () => {
    const result = propertyCostRequestSchema.safeParse({
      purchasePrice: 300_000,
      downPayment: 400_000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a zero or negative purchase price', () => {
    expect(propertyCostRequestSchema.safeParse({ purchasePrice: 0, downPayment: 0 }).success).toBe(
      false,
    );
    expect(propertyCostRequestSchema.safeParse({ purchasePrice: -1, downPayment: 0 }).success).toBe(
      false,
    );
  });

  it('rejects a missing required field', () => {
    expect(propertyCostRequestSchema.safeParse({ purchasePrice: 300_000 }).success).toBe(false);
  });

  it('rejects the wrong type for a numeric field', () => {
    expect(
      propertyCostRequestSchema.safeParse({ purchasePrice: '300000', downPayment: 0 }).success,
    ).toBe(false);
  });

  it('rejects an out-of-range interest rate', () => {
    expect(
      propertyCostRequestSchema.safeParse({
        purchasePrice: 300_000,
        downPayment: 0,
        interestRatePercent: 999,
      }).success,
    ).toBe(false);
  });
});
