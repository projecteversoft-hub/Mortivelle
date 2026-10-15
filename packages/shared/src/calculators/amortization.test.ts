import { describe, expect, it } from 'vitest';
import {
  monthlyPaymentFactor,
  monthlyPrincipalAndInterest,
  remainingBalance,
  roundToCents,
} from './amortization';

describe('monthlyPrincipalAndInterest', () => {
  it('matches the hand-verified $300k / 6% / 30yr fixture (~$1798.65)', () => {
    const result = monthlyPrincipalAndInterest(300_000, 6, 30);
    expect(result).toBeCloseTo(1798.65, 1);
  });

  it('matches a second well-known fixture: $200k / 4% / 30yr (~$954.83)', () => {
    const result = monthlyPrincipalAndInterest(200_000, 4, 30);
    expect(result).toBeCloseTo(954.83, 1);
  });

  it('handles a zero interest rate as straight-line principal repayment', () => {
    const result = monthlyPrincipalAndInterest(120_000, 0, 10);
    expect(result).toBeCloseTo(1000, 6); // 120000 / (10 * 12)
  });

  it('never produces NaN or Infinity for a zero principal', () => {
    const result = monthlyPrincipalAndInterest(0, 6, 30);
    expect(result).toBe(0);
  });

  it('never produces NaN or Infinity for a negative principal', () => {
    const result = monthlyPrincipalAndInterest(-100, 6, 30);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(0);
  });
});

describe('monthlyPaymentFactor', () => {
  it('is strictly positive for every term the schema allows (1..50 years), at 0% interest', () => {
    for (const termYears of [1, 5, 15, 30, 50]) {
      expect(monthlyPaymentFactor(0, termYears)).toBeGreaterThan(0);
    }
  });

  it('is strictly positive across a range of rates and terms (denominator-safety for affordability)', () => {
    for (const rate of [0, 0.5, 3, 6.5, 15, 30]) {
      for (const termYears of [1, 10, 30, 50]) {
        expect(monthlyPaymentFactor(rate, termYears)).toBeGreaterThan(0);
      }
    }
  });
});

describe('remainingBalance', () => {
  it('equals the original principal at zero months elapsed', () => {
    expect(remainingBalance(300_000, 6, 30, 0)).toBeCloseTo(300_000, 5);
  });

  it('equals zero once the full term has elapsed', () => {
    expect(remainingBalance(300_000, 6, 30, 360)).toBeCloseTo(0, 5);
  });

  it('clamps months elapsed beyond the term to zero balance rather than going negative', () => {
    expect(remainingBalance(300_000, 6, 30, 10_000)).toBe(0);
  });

  it('paydown is linear at a zero interest rate', () => {
    // 120,000 over 10 years (120 months) at 0%: after 60 months, half is repaid.
    expect(remainingBalance(120_000, 0, 10, 60)).toBeCloseTo(60_000, 5);
  });

  it('matches the hand-verified fixture: $300k / 6% / 30yr after 12 months (~$296,316)', () => {
    const result = remainingBalance(300_000, 6, 30, 12);
    expect(result).toBeGreaterThan(296_000);
    expect(result).toBeLessThan(296_600);
  });
});

describe('roundToCents', () => {
  it('rounds to two decimal places', () => {
    expect(roundToCents(1798.654999)).toBe(1798.65);
    expect(roundToCents(1798.655)).toBe(1798.66);
  });

  it('removes floating-point artifacts', () => {
    expect(roundToCents(0.1 + 0.2)).toBe(0.3);
  });

  it('returns 0 for NaN or Infinity rather than leaking them into a response', () => {
    expect(roundToCents(NaN)).toBe(0);
    expect(roundToCents(Infinity)).toBe(0);
    expect(roundToCents(-Infinity)).toBe(0);
  });
});
