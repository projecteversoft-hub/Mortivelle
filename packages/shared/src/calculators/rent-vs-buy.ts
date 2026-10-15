import { monthlyPrincipalAndInterest, remainingBalance, roundToCents } from './amortization';
import { assumption } from './assumption';
import {
  CALCULATION_FORMULA_VERSION,
  CALCULATOR_DEFAULTS,
  ESTIMATE_DISCLAIMER,
  RENT_VS_BUY_SENSITIVITY_WARNING,
} from './defaults';
import type { AssumptionEntry, RentVsBuyRequest, RentVsBuyResponse } from './schemas';

/**
 * Compares the net cost of renting versus buying over a user-chosen time horizon (docs/05
 * §2 "Rent-versus-buy"). This presents numbers only and never a recommendation (docs/05 §2:
 * "must not claim one choice is universally better") — see `comparativeDifference` on the
 * response schema.
 *
 * Renting side: total rent paid over the horizon, with annual compounding growth, minus the
 * investment growth the buyer's upfront cash (down payment + buying closing costs) would
 * have earned for a *renter* who invested that same amount instead at the illustrative
 * investment-return assumption (the standard rent-vs-buy "opportunity cost of capital"
 * treatment).
 *
 * Buying side: upfront cash, plus every ownership cost paid over the horizon (principal &
 * interest only while the loan is still being repaid; property tax, insurance, HOA and
 * maintenance scale with the home's appreciated value each year), minus net sale proceeds
 * at the end of the horizon (appreciated value, minus the remaining loan balance, minus
 * estimated selling costs).
 *
 * `comparativeDifference = renting.netCost - buying.netCost`: positive means buying cost
 * less, net, over this horizon; negative means renting cost less. Both full breakdowns are
 * always returned alongside it.
 *
 * Worked example (hand-verifiable; chosen to isolate the core relationship by zeroing every
 * secondary assumption): currentMonthlyRent = 1800, rentAnnualGrowthPercent = 0,
 * purchasePrice = 300000, downPayment = 0, interestRatePercent = 6, termYears = 30,
 * homeAppreciationAnnualPercent = 0, propertyTaxAnnualPercent = 0, insuranceAnnualPercent =
 * 0, hoaMonthly = 0, maintenanceAnnualPercent = 0, buyingClosingCostsPercent = 0,
 * sellingClosingCostsPercent = 0, investmentReturnAnnualPercent = 0, timeHorizonYears = 1:
 *   totalRentPaid = 1800 * 12 = 21600
 *   upfrontCash = 0, investmentGrowthOnUpfrontCash = 0  =>  renting.netCost = 21600
 *   principalAndInterest ≈ 1798.65 (see amortization.ts)
 *   totalOwnershipCostsPaid ≈ 1798.65 * 12 = 21583.80 (every other term is 0)
 *   homeValueAtHorizonEnd = 300000 (0% appreciation)
 *   remainingLoanBalance = remainingBalance(300000, 6%, 30yr, 12 months) ≈ 296,316.10
 *   netSaleProceeds ≈ 300000 - 296316.10 - 0(selling costs) ≈ 3683.90
 *   buying.netCost = 0 + 21583.80 - 3683.90 ≈ 17899.90
 *   comparativeDifference ≈ 21600 - 17899.90 ≈ 3700.10 (buying costs less over this horizon,
 *   because the buyer has built ~$3,684 of equity by paying down principal, on top of a
 *   nearly-identical monthly outlay to rent)
 */
export function calculateRentVsBuy(input: RentVsBuyRequest): RentVsBuyResponse {
  const rentAnnualGrowthPercent =
    input.rentAnnualGrowthPercent ?? CALCULATOR_DEFAULTS.rentAnnualGrowthPercent;
  const interestRatePercent = input.interestRatePercent ?? CALCULATOR_DEFAULTS.interestRatePercent;
  const termYears = input.termYears ?? CALCULATOR_DEFAULTS.termYears;
  const homeAppreciationAnnualPercent =
    input.homeAppreciationAnnualPercent ?? CALCULATOR_DEFAULTS.homeAppreciationAnnualPercent;
  const propertyTaxAnnualPercent =
    input.propertyTaxAnnualPercent ?? CALCULATOR_DEFAULTS.propertyTaxAnnualPercent;
  const insuranceAnnualPercent =
    input.insuranceAnnualPercent ?? CALCULATOR_DEFAULTS.insuranceAnnualPercent;
  const hoaMonthly = input.hoaMonthly ?? CALCULATOR_DEFAULTS.hoaMonthly;
  const maintenanceAnnualPercent =
    input.maintenanceAnnualPercent ?? CALCULATOR_DEFAULTS.maintenanceAnnualPercentOfPrice;
  const buyingClosingCostsPercent =
    input.buyingClosingCostsPercent ?? CALCULATOR_DEFAULTS.closingCostsPercentOfPrice;
  const sellingClosingCostsPercent =
    input.sellingClosingCostsPercent ?? CALCULATOR_DEFAULTS.sellingClosingCostsPercentOfPrice;
  const investmentReturnAnnualPercent =
    input.investmentReturnAnnualPercent ?? CALCULATOR_DEFAULTS.investmentReturnAnnualPercent;

  const horizonYears = input.timeHorizonYears;
  const horizonMonths = horizonYears * 12;
  const termMonths = Math.round(termYears * 12);
  const loanAmount = input.purchasePrice - input.downPayment;

  // --- Renting ---
  let totalRentPaid = 0;
  for (let year = 0; year < horizonYears; year++) {
    const monthlyRentThisYear =
      input.currentMonthlyRent * Math.pow(1 + rentAnnualGrowthPercent / 100, year);
    totalRentPaid += monthlyRentThisYear * 12;
  }
  const upfrontCash = input.downPayment + (input.purchasePrice * buyingClosingCostsPercent) / 100;
  const investmentGrowthOnUpfrontCash =
    upfrontCash * (Math.pow(1 + investmentReturnAnnualPercent / 100, horizonYears) - 1);
  const rentingNetCost = totalRentPaid - investmentGrowthOnUpfrontCash;

  // --- Buying ---
  const principalAndInterest = monthlyPrincipalAndInterest(
    loanAmount,
    interestRatePercent,
    termYears,
  );
  let totalOwnershipCostsPaid = 0;
  for (let year = 0; year < horizonYears; year++) {
    const appreciatedValue =
      input.purchasePrice * Math.pow(1 + homeAppreciationAnnualPercent / 100, year);
    const monthsOwedThisYear = Math.max(0, Math.min(12, termMonths - year * 12));
    totalOwnershipCostsPaid +=
      principalAndInterest * monthsOwedThisYear +
      (appreciatedValue * propertyTaxAnnualPercent) / 100 +
      (appreciatedValue * insuranceAnnualPercent) / 100 +
      (appreciatedValue * maintenanceAnnualPercent) / 100 +
      hoaMonthly * 12;
  }

  const homeValueAtHorizonEnd =
    input.purchasePrice * Math.pow(1 + homeAppreciationAnnualPercent / 100, horizonYears);
  const remainingLoanBalanceValue = remainingBalance(
    loanAmount,
    interestRatePercent,
    termYears,
    horizonMonths,
  );
  const sellingCosts = (homeValueAtHorizonEnd * sellingClosingCostsPercent) / 100;
  const netSaleProceeds = homeValueAtHorizonEnd - remainingLoanBalanceValue - sellingCosts;
  const buyingNetCost = upfrontCash + totalOwnershipCostsPaid - netSaleProceeds;

  const comparativeDifference = rentingNetCost - buyingNetCost;

  const assumptionsUsed: AssumptionEntry[] = [
    assumption(
      'rentAnnualGrowthPercent',
      'Illustrative annual rent growth (%/yr)',
      rentAnnualGrowthPercent,
      input.rentAnnualGrowthPercent,
    ),
    assumption(
      'interestRatePercent',
      'Illustrative mortgage interest rate (%/yr)',
      interestRatePercent,
      input.interestRatePercent,
    ),
    assumption('termYears', 'Loan term (years)', termYears, input.termYears),
    assumption(
      'homeAppreciationAnnualPercent',
      'Illustrative annual home-price appreciation (%/yr)',
      homeAppreciationAnnualPercent,
      input.homeAppreciationAnnualPercent,
    ),
    assumption(
      'propertyTaxAnnualPercent',
      'Illustrative property tax (% of value / yr)',
      propertyTaxAnnualPercent,
      input.propertyTaxAnnualPercent,
    ),
    assumption(
      'insuranceAnnualPercent',
      'Illustrative homeowners insurance (% of value / yr)',
      insuranceAnnualPercent,
      input.insuranceAnnualPercent,
    ),
    assumption('hoaMonthly', 'Monthly HOA dues ($)', roundToCents(hoaMonthly), input.hoaMonthly),
    assumption(
      'maintenanceAnnualPercent',
      'Illustrative annual maintenance (% of value / yr)',
      maintenanceAnnualPercent,
      input.maintenanceAnnualPercent,
    ),
    assumption(
      'buyingClosingCostsPercent',
      'Illustrative buying closing costs (% of price)',
      buyingClosingCostsPercent,
      input.buyingClosingCostsPercent,
    ),
    assumption(
      'sellingClosingCostsPercent',
      'Illustrative selling costs (% of sale price)',
      sellingClosingCostsPercent,
      input.sellingClosingCostsPercent,
    ),
    assumption(
      'investmentReturnAnnualPercent',
      'Illustrative opportunity-cost investment return (%/yr)',
      investmentReturnAnnualPercent,
      input.investmentReturnAnnualPercent,
    ),
  ];

  return {
    calculationVersion: CALCULATION_FORMULA_VERSION,
    timeHorizonYears: horizonYears,
    renting: {
      totalRentPaid: roundToCents(totalRentPaid),
      investmentGrowthOnUpfrontCash: roundToCents(investmentGrowthOnUpfrontCash),
      netCost: roundToCents(rentingNetCost),
    },
    buying: {
      upfrontCash: roundToCents(upfrontCash),
      totalOwnershipCostsPaid: roundToCents(totalOwnershipCostsPaid),
      homeValueAtHorizonEnd: roundToCents(homeValueAtHorizonEnd),
      remainingLoanBalance: roundToCents(remainingLoanBalanceValue),
      sellingCosts: roundToCents(sellingCosts),
      netSaleProceeds: roundToCents(netSaleProceeds),
      netCost: roundToCents(buyingNetCost),
    },
    comparativeDifference: roundToCents(comparativeDifference),
    assumptionsUsed,
    disclaimer: ESTIMATE_DISCLAIMER,
    sensitivityWarning: RENT_VS_BUY_SENSITIVITY_WARNING,
  };
}
