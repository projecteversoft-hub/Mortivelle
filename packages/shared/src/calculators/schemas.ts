import { z } from 'zod';

/**
 * All numeric calculator fields are plain `z.number()` (never `z.coerce.number()`): these
 * endpoints take a JSON body, not query-string text, so a client sending `"50000"` instead
 * of `50000` is a real client bug and must fail validation rather than be silently coerced
 * (docs/11 §4 "invalid input: wrong types ... via the Zod schemas").
 *
 * Every optional field is left truly optional (no `.default()` in the schema) so the
 * calculation layer can tell "the user left this blank" apart from "the user explicitly
 * sent this exact value" and label each echoed assumption accordingly. Defaults are applied
 * in the calculation functions, from `./defaults`.
 *
 * Upper bounds are generous but finite: they exist to reject obviously-abusive or
 * nonsensical input (docs/04 §1 "bounded query sizes"), not to model real-world limits.
 */

const moneySchema = z.number().min(0).max(100_000_000);
const positiveMoneySchema = z.number().min(1).max(100_000_000);
const ratePercentSchema = z.number().min(0).max(30);
const smallRatePercentSchema = z.number().min(0).max(10);
const growthPercentSchema = z.number().min(-10).max(20);
const termYearsSchema = z.number().int().min(1).max(50);

export const assumptionSourceSchema = z.enum(['user', 'default']);
export type AssumptionSource = z.infer<typeof assumptionSourceSchema>;

/** One assumption echoed back in every calculator response (docs/05 §2 "Show which values
 * are user-provided versus defaulted"). */
export const assumptionEntrySchema = z.object({
  field: z.string(),
  label: z.string(),
  value: z.number(),
  source: assumptionSourceSchema,
  note: z.string().optional(),
});
export type AssumptionEntry = z.infer<typeof assumptionEntrySchema>;

// ---------------------------------------------------------------------------
// Affordability
// ---------------------------------------------------------------------------

export const affordabilityRequestSchema = z.object({
  grossMonthlyIncome: positiveMoneySchema,
  monthlyDebts: moneySchema.optional(),
  downPayment: moneySchema.optional(),
  interestRatePercent: ratePercentSchema.optional(),
  termYears: termYearsSchema.optional(),
  propertyTaxAnnualPercent: smallRatePercentSchema.optional(),
  insuranceAnnualPercent: smallRatePercentSchema.optional(),
  hoaMonthly: moneySchema.optional(),
  includeMortgageInsurance: z.boolean().optional(),
  mortgageInsuranceAnnualPercent: z.number().min(0).max(5).optional(),
});
export type AffordabilityRequest = z.infer<typeof affordabilityRequestSchema>;

const monthlyBreakdownSchema = z.object({
  principalAndInterest: z.number(),
  propertyTax: z.number(),
  insurance: z.number(),
  hoa: z.number(),
  mortgageInsurance: z.number(),
  total: z.number(),
});

export const affordabilityResponseSchema = z.object({
  calculationVersion: z.string(),
  estimatedPurchaseBudget: z.number(),
  monthlyHousingBudgetUsed: z.number(),
  loanAmount: z.number(),
  monthlyBreakdown: monthlyBreakdownSchema,
  assumptionsUsed: z.array(assumptionEntrySchema),
  disclaimer: z.string(),
});
export type AffordabilityResponse = z.infer<typeof affordabilityResponseSchema>;

// ---------------------------------------------------------------------------
// Monthly payment / property true cost
// ---------------------------------------------------------------------------

export const propertyCostRequestSchema = z
  .object({
    purchasePrice: positiveMoneySchema,
    downPayment: moneySchema,
    interestRatePercent: ratePercentSchema.optional(),
    termYears: termYearsSchema.optional(),
    propertyTaxAnnualAmount: moneySchema.optional(),
    insuranceAnnualAmount: moneySchema.optional(),
    hoaMonthly: moneySchema.optional(),
    otherMonthlyCosts: moneySchema.optional(),
    closingCostsAmount: moneySchema.optional(),
  })
  .superRefine((data, ctx) => {
    // Boundary case from docs/11 §4: "down payment ≥ price" must fail safely as a
    // validation error, never reach the math as a negative/zero/infinite loan amount.
    if (data.downPayment >= data.purchasePrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['downPayment'],
        message: 'Down payment must be less than the purchase price.',
      });
    }
  });
export type PropertyCostRequest = z.infer<typeof propertyCostRequestSchema>;

export const propertyCostResponseSchema = z.object({
  calculationVersion: z.string(),
  loanAmount: z.number(),
  monthlyBreakdown: z.object({
    principalAndInterest: z.number(),
    propertyTax: z.number(),
    insurance: z.number(),
    hoa: z.number(),
    other: z.number(),
    totalMonthlyOwnershipCost: z.number(),
  }),
  estimatedCashDueAtClosing: z.object({
    downPayment: z.number(),
    closingCosts: z.number(),
    total: z.number(),
  }),
  assumptionsUsed: z.array(assumptionEntrySchema),
  disclaimer: z.string(),
});
export type PropertyCostResponse = z.infer<typeof propertyCostResponseSchema>;

// ---------------------------------------------------------------------------
// Rent vs. buy
// ---------------------------------------------------------------------------

export const rentVsBuyRequestSchema = z
  .object({
    currentMonthlyRent: moneySchema,
    rentAnnualGrowthPercent: growthPercentSchema.optional(),
    purchasePrice: positiveMoneySchema,
    downPayment: moneySchema,
    interestRatePercent: ratePercentSchema.optional(),
    termYears: termYearsSchema.optional(),
    homeAppreciationAnnualPercent: growthPercentSchema.optional(),
    propertyTaxAnnualPercent: smallRatePercentSchema.optional(),
    insuranceAnnualPercent: smallRatePercentSchema.optional(),
    hoaMonthly: moneySchema.optional(),
    maintenanceAnnualPercent: smallRatePercentSchema.optional(),
    buyingClosingCostsPercent: z.number().min(0).max(15).optional(),
    sellingClosingCostsPercent: z.number().min(0).max(15).optional(),
    investmentReturnAnnualPercent: growthPercentSchema.optional(),
    timeHorizonYears: z.number().int().min(1).max(40),
  })
  .superRefine((data, ctx) => {
    if (data.downPayment >= data.purchasePrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['downPayment'],
        message: 'Down payment must be less than the purchase price.',
      });
    }
  });
export type RentVsBuyRequest = z.infer<typeof rentVsBuyRequestSchema>;

export const rentVsBuyResponseSchema = z.object({
  calculationVersion: z.string(),
  timeHorizonYears: z.number(),
  renting: z.object({
    totalRentPaid: z.number(),
    investmentGrowthOnUpfrontCash: z.number(),
    netCost: z.number(),
  }),
  buying: z.object({
    upfrontCash: z.number(),
    totalOwnershipCostsPaid: z.number(),
    homeValueAtHorizonEnd: z.number(),
    remainingLoanBalance: z.number(),
    sellingCosts: z.number(),
    netSaleProceeds: z.number(),
    netCost: z.number(),
  }),
  /**
   * `renting.netCost - buying.netCost`. Positive means buying cost less, net, over the
   * horizon; negative means renting cost less. Presented as a plain number alongside both
   * full breakdowns — never rendered as a verdict (docs/05 §2: "must not claim one choice is
   * universally better").
   */
  comparativeDifference: z.number(),
  assumptionsUsed: z.array(assumptionEntrySchema),
  disclaimer: z.string(),
  sensitivityWarning: z.string(),
});
export type RentVsBuyResponse = z.infer<typeof rentVsBuyResponseSchema>;
