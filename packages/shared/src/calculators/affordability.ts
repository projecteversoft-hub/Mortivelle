import { monthlyPaymentFactor, monthlyPrincipalAndInterest, roundToCents } from './amortization';
import { assumption } from './assumption';
import { CALCULATION_FORMULA_VERSION, CALCULATOR_DEFAULTS, ESTIMATE_DISCLAIMER } from './defaults';
import type { AffordabilityRequest, AffordabilityResponse, AssumptionEntry } from './schemas';

/**
 * Estimates a purchase budget and corresponding monthly housing cost from income, debt and
 * a down payment (docs/05 §2 "Affordability").
 *
 * Method: the illustrative affordability guideline below caps the available monthly housing
 * budget using front-end (gross income to housing cost) and back-end (gross income to all
 * recurring debt) ratios — a common, conservative convention, never presented as an actual
 * lender's underwriting decision (CLAUDE.md §4: no automated underwriting in the MVP; this
 * is a budget estimate only).
 *
 * That budget must cover principal & interest (which scales with the *loan* amount, i.e.
 * price minus down payment) plus property tax, insurance and HOA (which the taxes/insurance
 * illustrative defaults scale with the *price* itself, since they are expressed as a rate).
 * Both the P&I factor and the tax/insurance rate are linear in price, so the budget equation
 * can be solved directly for price with no iteration or numeric root-finding:
 *
 *   budget = (piFactor + pmiFactor) * (price - down) + (taxRate + insRate) * price + hoa
 *   =>  price = (budget - hoa + (piFactor + pmiFactor) * down) / (piFactor + pmiFactor + taxRate + insRate)
 *
 * The denominator is always strictly positive: `piFactor` (from `monthlyPaymentFactor`) is
 * positive whenever `termYears >= 1`, which the shared schema already enforces, so this can
 * never divide by zero. If the resulting price would be negative (e.g. debts already exceed
 * the allowed budget before any housing cost), the result is clamped to $0 rather than
 * thrown as an error: "you cannot afford anything under these assumptions" is a legitimate
 * answer, not an invalid request.
 *
 * Worked example (hand-verifiable): income = 10000/mo, debts = 0, down = 0, rate = 6%,
 * term = 30yr, tax/insurance/HOA = 0 (isolating the budget-to-price solve):
 *   frontEndBudget = 10000 * 0.28 = 2800
 *   backEndBudget  = 10000 * 0.36 - 0 = 3600
 *   monthlyHousingBudget = min(2800, 3600) = 2800
 *   piFactor(6%, 30yr) ≈ 0.0059955 (see amortization.ts's worked example)
 *   price = (2800 - 0 + 0.0059955 * 0) / 0.0059955 ≈ 467,016.60
 *   Sanity check: principalAndInterest(467016.60, 6%, 30yr) ≈ 467016.60 * 0.0059955 ≈ 2800.00
 *   — i.e. the monthly breakdown's total reproduces the exact budget, as it must when every
 *   other monthly cost is zero.
 */
export function calculateAffordability(input: AffordabilityRequest): AffordabilityResponse {
  const interestRatePercent = input.interestRatePercent ?? CALCULATOR_DEFAULTS.interestRatePercent;
  const termYears = input.termYears ?? CALCULATOR_DEFAULTS.termYears;
  const propertyTaxAnnualPercent =
    input.propertyTaxAnnualPercent ?? CALCULATOR_DEFAULTS.propertyTaxAnnualPercent;
  const insuranceAnnualPercent =
    input.insuranceAnnualPercent ?? CALCULATOR_DEFAULTS.insuranceAnnualPercent;
  const hoaMonthly = input.hoaMonthly ?? CALCULATOR_DEFAULTS.hoaMonthly;
  const monthlyDebts = input.monthlyDebts ?? 0;
  const downPayment = input.downPayment ?? 0;
  const includeMortgageInsurance = input.includeMortgageInsurance ?? false;
  const mortgageInsuranceAnnualPercent =
    input.mortgageInsuranceAnnualPercent ?? CALCULATOR_DEFAULTS.pmiAnnualRatePercent;

  const frontEndBudget = input.grossMonthlyIncome * CALCULATOR_DEFAULTS.frontEndDtiRatio;
  const backEndBudget =
    input.grossMonthlyIncome * CALCULATOR_DEFAULTS.backEndDtiRatio - monthlyDebts;
  const monthlyHousingBudget = Math.max(0, Math.min(frontEndBudget, backEndBudget));

  const piFactor = monthlyPaymentFactor(interestRatePercent, termYears);
  // Simplification, documented: mortgage insurance is applied to the whole loan amount
  // whenever the caller opts in, rather than conditionally once loan-to-value crosses 80%
  // (that threshold depends on the price being solved for, which would require iterating).
  const pmiFactor = includeMortgageInsurance ? mortgageInsuranceAnnualPercent / 100 / 12 : 0;
  const loanFactor = piFactor + pmiFactor;
  const priceRateFactor = (propertyTaxAnnualPercent + insuranceAnnualPercent) / 100 / 12;
  const denominator = loanFactor + priceRateFactor;

  const rawPrice = (monthlyHousingBudget - hoaMonthly + loanFactor * downPayment) / denominator;
  const estimatedPurchaseBudget = Math.max(0, rawPrice);
  const loanAmount = Math.max(0, estimatedPurchaseBudget - downPayment);

  const principalAndInterest = monthlyPrincipalAndInterest(
    loanAmount,
    interestRatePercent,
    termYears,
  );
  const propertyTax = (estimatedPurchaseBudget * propertyTaxAnnualPercent) / 100 / 12;
  const insurance = (estimatedPurchaseBudget * insuranceAnnualPercent) / 100 / 12;
  const mortgageInsurance = includeMortgageInsurance
    ? (loanAmount * mortgageInsuranceAnnualPercent) / 100 / 12
    : 0;
  const total = principalAndInterest + propertyTax + insurance + hoaMonthly + mortgageInsurance;

  const assumptionsUsed: AssumptionEntry[] = [
    assumption(
      'interestRatePercent',
      'Illustrative mortgage interest rate (%/yr)',
      interestRatePercent,
      input.interestRatePercent,
    ),
    assumption('termYears', 'Loan term (years)', termYears, input.termYears),
    assumption(
      'propertyTaxAnnualPercent',
      'Illustrative property tax (% of price / yr)',
      propertyTaxAnnualPercent,
      input.propertyTaxAnnualPercent,
    ),
    assumption(
      'insuranceAnnualPercent',
      'Illustrative homeowners insurance (% of price / yr)',
      insuranceAnnualPercent,
      input.insuranceAnnualPercent,
    ),
    // Echoed money values are rounded to cents (see property-cost.ts for why this matters
    // even for values that look "clean" — some illustrative defaults are derived via
    // division/multiplication and can carry a floating-point artifact).
    assumption('hoaMonthly', 'Monthly HOA dues ($)', roundToCents(hoaMonthly), input.hoaMonthly),
    assumption(
      'monthlyDebts',
      'Recurring monthly debts ($)',
      roundToCents(monthlyDebts),
      input.monthlyDebts,
    ),
    assumption('downPayment', 'Down payment ($)', roundToCents(downPayment), input.downPayment),
    {
      field: 'affordabilityGuideline',
      label:
        'Illustrative affordability guideline: 28% of gross income to housing, 36% to all debt',
      value: CALCULATOR_DEFAULTS.frontEndDtiRatio,
      source: 'default',
      note: 'A conservative convention, not an actual lender underwriting decision.',
    },
    ...(includeMortgageInsurance
      ? [
          assumption(
            'mortgageInsuranceAnnualPercent',
            'Illustrative mortgage insurance (% of loan / yr)',
            mortgageInsuranceAnnualPercent,
            input.mortgageInsuranceAnnualPercent,
          ),
        ]
      : []),
  ];

  return {
    calculationVersion: CALCULATION_FORMULA_VERSION,
    estimatedPurchaseBudget: roundToCents(estimatedPurchaseBudget),
    monthlyHousingBudgetUsed: roundToCents(monthlyHousingBudget),
    loanAmount: roundToCents(loanAmount),
    monthlyBreakdown: {
      principalAndInterest: roundToCents(principalAndInterest),
      propertyTax: roundToCents(propertyTax),
      insurance: roundToCents(insurance),
      hoa: roundToCents(hoaMonthly),
      mortgageInsurance: roundToCents(mortgageInsurance),
      total: roundToCents(total),
    },
    assumptionsUsed,
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}
