/**
 * Standard, well-established mortgage-math primitives (docs/05 §3: "standard, well-
 * established mortgage-math formulas... are fine to implement directly — this is public
 * financial math, not proprietary lender data"). No external rate/property data is read or
 * inferred here; every input is either supplied by the caller or an illustrative default
 * defined in `./defaults`.
 *
 * Decimal-safety note: these functions intentionally do NOT round intermediate results.
 * Rounding every user-facing dollar figure happens exactly once, at the point a calculator
 * assembles its response, via `roundToCents`. Rounding intermediate values here would
 * compound error across a multi-step calculation (e.g. rent-vs-buy's year-by-year loop);
 * rounding only the final displayed values avoids both floating-point artifacts in the
 * output (e.g. "1798.6500000000001") and compounded rounding drift.
 */

/** Guards every output against the non-finite results that a hostile or degenerate numeric
 * input could otherwise produce (NaN, Infinity) before it reaches an API response. */
export function roundToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Monthly principal & interest payment for a standard fixed-rate, fully-amortizing loan.
 *
 *   M = P * r(1+r)^n / ((1+r)^n - 1)
 *
 * where `r` is the periodic (monthly) interest rate and `n` the number of monthly payments.
 * At r = 0 this formula is 0/0 in the limit; the true limiting value is M = P / n (the loan
 * is simply repaid in equal principal-only installments), which is handled as an explicit
 * branch below rather than evaluated numerically.
 *
 * Worked example (hand-verifiable with any calculator):
 *   P = 300000, annual rate = 6%, term = 30 years
 *   r = 0.06 / 12 = 0.005, n = 360
 *   (1.005)^360 ≈ 6.0225746
 *   M = 300000 * 0.005 * 6.0225746 / (6.0225746 - 1)
 *     = 300000 * 0.030112873 / 5.0225746
 *     ≈ 1798.65
 * This matches the widely-published figure for a $300,000 loan at 6% over 30 years
 * (~$1,798.65/month), confirming the implementation.
 */
export function monthlyPrincipalAndInterest(
  principal: number,
  annualRatePercent: number,
  termYears: number,
): number {
  const n = Math.round(termYears * 12);
  if (!(principal > 0) || n <= 0) return 0;
  return principal * monthlyPaymentFactor(annualRatePercent, termYears);
}

/**
 * The monthly payment per dollar of principal — i.e. `monthlyPrincipalAndInterest(1, ...)`.
 * Exists separately because it lets affordability's budget-to-price solve stay a single
 * linear equation (the payment is linear in the loan amount once this per-dollar factor is
 * known), instead of requiring iterative/numeric root-finding to invert the formula above.
 */
export function monthlyPaymentFactor(annualRatePercent: number, termYears: number): number {
  const n = Math.round(termYears * 12);
  if (n <= 0) return 0;
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return 1 / n;
  const growth = Math.pow(1 + r, n);
  return (r * growth) / (growth - 1);
}

/**
 * Remaining principal balance after `monthsElapsed` scheduled monthly payments of a standard
 * amortizing loan:
 *
 *   balance(k) = P * [(1+r)^n - (1+r)^k] / [(1+r)^n - 1]
 *
 * At r = 0 this reduces to straight-line paydown: balance(k) = P * (1 - k/n).
 * `monthsElapsed` is clamped to [0, n] so a horizon longer than the loan term safely yields
 * a balance of 0 rather than a negative number.
 */
export function remainingBalance(
  principal: number,
  annualRatePercent: number,
  termYears: number,
  monthsElapsed: number,
): number {
  const n = Math.round(termYears * 12);
  if (!(principal > 0) || n <= 0) return 0;
  const k = Math.min(Math.max(Math.round(monthsElapsed), 0), n);
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return principal * (1 - k / n);
  const growth = Math.pow(1 + r, n);
  const elapsedGrowth = Math.pow(1 + r, k);
  return (principal * (growth - elapsedGrowth)) / (growth - 1);
}
