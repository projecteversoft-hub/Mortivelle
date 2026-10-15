import { describe, expect, it } from 'vitest';
import { calculateAffordability } from './affordability';
import { affordabilityRequestSchema } from './schemas';

describe('calculateAffordability', () => {
  it('matches the hand-verified fixture (see affordability.ts doc comment)', () => {
    const result = calculateAffordability({
      grossMonthlyIncome: 10_000,
      monthlyDebts: 0,
      downPayment: 0,
      interestRatePercent: 6,
      termYears: 30,
      propertyTaxAnnualPercent: 0,
      insuranceAnnualPercent: 0,
      hoaMonthly: 0,
    });
    expect(result.monthlyHousingBudgetUsed).toBe(2800);
    expect(result.estimatedPurchaseBudget).toBeGreaterThan(466_900);
    expect(result.estimatedPurchaseBudget).toBeLessThan(467_200);
    // With tax/insurance/HOA at 0, the whole budget goes to P&I, so the breakdown's total
    // must reproduce the budget almost exactly (to within a cent of rounding).
    expect(Math.abs(result.monthlyBreakdown.total - result.monthlyHousingBudgetUsed)).toBeLessThan(
      0.01,
    );
  });

  it('labels every omitted field as a default and every supplied field as user-provided', () => {
    const result = calculateAffordability({
      grossMonthlyIncome: 8_000,
      interestRatePercent: 7, // explicit
    });
    const byField = new Map(result.assumptionsUsed.map((a) => [a.field, a]));
    expect(byField.get('interestRatePercent')?.source).toBe('user');
    expect(byField.get('termYears')?.source).toBe('default');
    expect(byField.get('propertyTaxAnnualPercent')?.source).toBe('default');
  });

  it('treats an explicit 0 as user-provided, not as "omitted"', () => {
    const result = calculateAffordability({ grossMonthlyIncome: 8_000, monthlyDebts: 0 });
    const debts = result.assumptionsUsed.find((a) => a.field === 'monthlyDebts');
    expect(debts?.source).toBe('user');
    expect(debts?.value).toBe(0);
  });

  it('clamps to a $0 budget, never negative, when debts exceed the allowed back-end ratio', () => {
    const result = calculateAffordability({
      grossMonthlyIncome: 2_000,
      monthlyDebts: 5_000, // far more than 36% of 2000
    });
    expect(result.monthlyHousingBudgetUsed).toBe(0);
    expect(result.estimatedPurchaseBudget).toBe(0);
    expect(result.loanAmount).toBe(0);
    expect(Number.isFinite(result.estimatedPurchaseBudget)).toBe(true);
  });

  it('handles a zero interest rate safely (no division by zero)', () => {
    const result = calculateAffordability({ grossMonthlyIncome: 10_000, interestRatePercent: 0 });
    expect(Number.isFinite(result.estimatedPurchaseBudget)).toBe(true);
    expect(result.estimatedPurchaseBudget).toBeGreaterThan(0);
  });

  it('includes mortgage insurance in the breakdown only when opted in', () => {
    const withoutPmi = calculateAffordability({ grossMonthlyIncome: 10_000 });
    const withPmi = calculateAffordability({
      grossMonthlyIncome: 10_000,
      includeMortgageInsurance: true,
    });
    expect(withoutPmi.monthlyBreakdown.mortgageInsurance).toBe(0);
    expect(withPmi.monthlyBreakdown.mortgageInsurance).toBeGreaterThan(0);
    // Opting into PMI uses up some of the same budget, so the resulting estimated budget is
    // never larger than without it.
    expect(withPmi.estimatedPurchaseBudget).toBeLessThanOrEqual(withoutPmi.estimatedPurchaseBudget);
  });
});

describe('affordabilityRequestSchema (boundary / invalid input)', () => {
  it('rejects a zero or negative income', () => {
    expect(affordabilityRequestSchema.safeParse({ grossMonthlyIncome: 0 }).success).toBe(false);
    expect(affordabilityRequestSchema.safeParse({ grossMonthlyIncome: -500 }).success).toBe(false);
  });

  it('rejects a negative interest rate', () => {
    expect(
      affordabilityRequestSchema.safeParse({ grossMonthlyIncome: 8000, interestRatePercent: -1 })
        .success,
    ).toBe(false);
  });

  it('rejects a term of 0 years', () => {
    expect(
      affordabilityRequestSchema.safeParse({ grossMonthlyIncome: 8000, termYears: 0 }).success,
    ).toBe(false);
  });

  it('rejects an absurdly extreme income rather than accepting it unbounded', () => {
    expect(affordabilityRequestSchema.safeParse({ grossMonthlyIncome: 1e15 }).success).toBe(false);
  });

  it('rejects a missing required field', () => {
    expect(affordabilityRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects the wrong type for a numeric field (string instead of number)', () => {
    expect(affordabilityRequestSchema.safeParse({ grossMonthlyIncome: '8000' }).success).toBe(
      false,
    );
  });
});
