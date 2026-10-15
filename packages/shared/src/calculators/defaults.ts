/**
 * Illustrative default assumptions for the MVP calculators (docs/05 §3: "Never silently
 * invent taxes, insurance or rates. If values are illustrative defaults, label them as
 * such." / "External rate/property data is disabled until provider rights and source
 * attribution are approved."). None of these values is fetched from, or attributed to, any
 * external rate or property-data provider — they are static, versioned, documented
 * placeholders a user can always override. Every calculator echoes back, for every
 * assumption, whether it came from the user or from this table (see `AssumptionEntry`).
 *
 * Bump `CALCULATION_FORMULA_VERSION` whenever a formula or one of these defaults changes,
 * so a previously-displayed result stays reproducible from its echoed version (docs/05 §7:
 * "Results are reproducible from the same inputs and calculation version").
 */
export const CALCULATION_FORMULA_VERSION = '2026-10-15.1';

export const CALCULATOR_DEFAULTS = {
  /** Illustrative mortgage interest rate. Not sourced from any rate provider. */
  interestRatePercent: 6.5,
  /** Illustrative conventional loan term. */
  termYears: 30,
  /** Illustrative property tax, as a % of home price per year. */
  propertyTaxAnnualPercent: 1.1,
  /** Illustrative homeowners insurance, as a % of home price per year. */
  insuranceAnnualPercent: 0.35,
  /** Illustrative HOA dues when none is disclosed. */
  hoaMonthly: 0,
  /**
   * Illustrative affordability guideline (28% gross income to housing cost, 36% gross
   * income to all recurring debt). A conservative convention commonly cited for
   * conventional loans — NOT an actual lender's underwriting rule, and never presented as
   * one.
   */
  frontEndDtiRatio: 0.28,
  backEndDtiRatio: 0.36,
  /** Illustrative mortgage insurance, as a % of loan amount per year, when included. */
  pmiAnnualRatePercent: 0.5,
  /** Illustrative closing costs when buying, as a % of purchase price. */
  closingCostsPercentOfPrice: 2.5,
  /** Illustrative selling costs (agent commission, transfer taxes, etc.), as a % of sale price. */
  sellingClosingCostsPercentOfPrice: 7,
  /** Illustrative annual maintenance/upkeep, as a % of home price per year. */
  maintenanceAnnualPercentOfPrice: 1,
  /** Illustrative annual rent growth rate. */
  rentAnnualGrowthPercent: 3,
  /** Illustrative annual home-price appreciation rate. */
  homeAppreciationAnnualPercent: 3,
  /** Illustrative annual return if the cash used to buy were invested instead. */
  investmentReturnAnnualPercent: 5,
} as const;

/** Reused verbatim everywhere a calculator result is shown (matches apps/web/src/App.tsx). */
export const ESTIMATE_DISCLAIMER =
  'Estimates shown by Tech Realty Rentals tools are not loan offers, approvals, or financial advice.';

/** Required by docs/05 §2 for the rent-vs-buy calculator specifically. */
export const RENT_VS_BUY_SENSITIVITY_WARNING =
  'This comparison is highly sensitive to the rent growth, home-price appreciation, and ' +
  'investment return assumptions above. Changing any one of them can change which option ' +
  'costs less over this time horizon. These figures are not a recommendation to rent or buy.';
