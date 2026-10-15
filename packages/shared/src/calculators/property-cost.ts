import { monthlyPrincipalAndInterest, roundToCents } from './amortization';
import { assumption } from './assumption';
import { CALCULATION_FORMULA_VERSION, CALCULATOR_DEFAULTS, ESTIMATE_DISCLAIMER } from './defaults';
import type { AssumptionEntry, PropertyCostRequest, PropertyCostResponse } from './schemas';

/**
 * Separates principal & interest from total estimated recurring ownership cost for a known
 * purchase price, and estimates cash due at closing (docs/05 §2 "Monthly payment / property
 * true cost"). Unlike the affordability calculator, price is already known here, so tax and
 * insurance can be taken as flat annual dollar amounts (what a buyer would see on an actual
 * tax/insurance estimate) with no circularity; when omitted, the illustrative default rate
 * from `./defaults` is applied against the given price.
 *
 * `downPayment >= purchasePrice` is rejected by `propertyCostRequestSchema` before this
 * function ever runs (docs/11 §4's "down payment ≥ price" boundary case), so `loanAmount`
 * here is always strictly positive.
 *
 * Worked example (hand-verifiable, isolating P&I): purchasePrice = 300000, downPayment = 0,
 * rate = 6%, term = 30yr, propertyTaxAnnualAmount = 0, insuranceAnnualAmount = 0, hoa = 0,
 * otherMonthlyCosts = 0, closingCostsAmount = 0:
 *   loanAmount = 300000
 *   principalAndInterest ≈ 1798.65 (see amortization.ts's worked example for this exact loan)
 *   totalMonthlyOwnershipCost = 1798.65 (every other term is 0)
 *   estimatedCashDueAtClosing = downPayment(0) + closingCosts(0) = 0
 */
export function calculatePropertyCost(input: PropertyCostRequest): PropertyCostResponse {
  const interestRatePercent = input.interestRatePercent ?? CALCULATOR_DEFAULTS.interestRatePercent;
  const termYears = input.termYears ?? CALCULATOR_DEFAULTS.termYears;
  const propertyTaxAnnualAmount =
    input.propertyTaxAnnualAmount ??
    (input.purchasePrice * CALCULATOR_DEFAULTS.propertyTaxAnnualPercent) / 100;
  const insuranceAnnualAmount =
    input.insuranceAnnualAmount ??
    (input.purchasePrice * CALCULATOR_DEFAULTS.insuranceAnnualPercent) / 100;
  const hoaMonthly = input.hoaMonthly ?? CALCULATOR_DEFAULTS.hoaMonthly;
  const otherMonthlyCosts = input.otherMonthlyCosts ?? 0;
  const closingCostsAmount =
    input.closingCostsAmount ??
    (input.purchasePrice * CALCULATOR_DEFAULTS.closingCostsPercentOfPrice) / 100;

  const loanAmount = input.purchasePrice - input.downPayment;
  const principalAndInterest = monthlyPrincipalAndInterest(
    loanAmount,
    interestRatePercent,
    termYears,
  );
  const propertyTax = propertyTaxAnnualAmount / 12;
  const insurance = insuranceAnnualAmount / 12;
  const totalMonthlyOwnershipCost =
    principalAndInterest + propertyTax + insurance + hoaMonthly + otherMonthlyCosts;

  const assumptionsUsed: AssumptionEntry[] = [
    assumption(
      'interestRatePercent',
      'Illustrative mortgage interest rate (%/yr)',
      interestRatePercent,
      input.interestRatePercent,
    ),
    assumption('termYears', 'Loan term (years)', termYears, input.termYears),
    assumption(
      // Echoed money values are rounded to cents too (not just the final breakdown fields):
      // an illustrative default derived as price * rate / 100 is just as prone to a
      // floating-point artifact (e.g. "2200.0000000000005") as any other computed dollar
      // figure, and this field is shown directly to the user.
      'propertyTaxAnnualAmount',
      'Illustrative annual property tax ($)',
      roundToCents(propertyTaxAnnualAmount),
      input.propertyTaxAnnualAmount,
    ),
    assumption(
      'insuranceAnnualAmount',
      'Illustrative annual homeowners insurance ($)',
      roundToCents(insuranceAnnualAmount),
      input.insuranceAnnualAmount,
    ),
    assumption('hoaMonthly', 'Monthly HOA dues ($)', roundToCents(hoaMonthly), input.hoaMonthly),
    assumption(
      'otherMonthlyCosts',
      'Other disclosed monthly costs ($)',
      roundToCents(otherMonthlyCosts),
      input.otherMonthlyCosts,
    ),
    assumption(
      'closingCostsAmount',
      'Illustrative estimated closing costs ($)',
      roundToCents(closingCostsAmount),
      input.closingCostsAmount,
    ),
  ];

  return {
    calculationVersion: CALCULATION_FORMULA_VERSION,
    loanAmount: roundToCents(loanAmount),
    monthlyBreakdown: {
      principalAndInterest: roundToCents(principalAndInterest),
      propertyTax: roundToCents(propertyTax),
      insurance: roundToCents(insurance),
      hoa: roundToCents(hoaMonthly),
      other: roundToCents(otherMonthlyCosts),
      totalMonthlyOwnershipCost: roundToCents(totalMonthlyOwnershipCost),
    },
    estimatedCashDueAtClosing: {
      downPayment: roundToCents(input.downPayment),
      closingCosts: roundToCents(closingCostsAmount),
      total: roundToCents(input.downPayment + closingCostsAmount),
    },
    assumptionsUsed,
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}
