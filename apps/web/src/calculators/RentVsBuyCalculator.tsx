import { useMemo, useState } from 'react';
import {
  calculateRentVsBuy,
  CalculatorType,
  ESTIMATE_DISCLAIMER,
  rentVsBuyRequestSchema,
} from '@tech-realty-rentals/shared';
import { AssumptionsList } from './AssumptionsList';
import { NumberField } from './NumberField';
import { formatCurrency } from './format';
import { fieldErrorsFromZod, parseOptionalNumber } from './formUtils';
import { LeadCaptureSection } from '../leads/LeadCaptureSection';

interface FormState {
  currentMonthlyRent: string;
  rentAnnualGrowthPercent: string;
  purchasePrice: string;
  downPayment: string;
  interestRatePercent: string;
  termYears: string;
  homeAppreciationAnnualPercent: string;
  propertyTaxAnnualPercent: string;
  insuranceAnnualPercent: string;
  hoaMonthly: string;
  maintenanceAnnualPercent: string;
  buyingClosingCostsPercent: string;
  sellingClosingCostsPercent: string;
  investmentReturnAnnualPercent: string;
  timeHorizonYears: string;
}

const INITIAL_STATE: FormState = {
  currentMonthlyRent: '',
  rentAnnualGrowthPercent: '',
  purchasePrice: '',
  downPayment: '',
  interestRatePercent: '',
  termYears: '',
  homeAppreciationAnnualPercent: '',
  propertyTaxAnnualPercent: '',
  insuranceAnnualPercent: '',
  hoaMonthly: '',
  maintenanceAnnualPercent: '',
  buyingClosingCostsPercent: '',
  sellingClosingCostsPercent: '',
  investmentReturnAnnualPercent: '',
  timeHorizonYears: '5',
};

const OPTIONAL_PERCENT_FIELDS = [
  'rentAnnualGrowthPercent',
  'interestRatePercent',
  'homeAppreciationAnnualPercent',
  'propertyTaxAnnualPercent',
  'insuranceAnnualPercent',
  'maintenanceAnnualPercent',
  'buyingClosingCostsPercent',
  'sellingClosingCostsPercent',
  'investmentReturnAnnualPercent',
] as const satisfies readonly (keyof FormState)[];

export interface RentVsBuyCalculatorProps {
  /** See AffordabilityCalculator.tsx's prop doc — same documented scope decision. */
  leadCaptureWidgetPublicKey?: string;
}

/** Rent-vs-buy calculator (docs/05 §2). Presents both sides' numbers only — never a verdict
 * on which choice is better (docs/05 §2) — and always shows the sensitivity warning. */
export function RentVsBuyCalculator({ leadCaptureWidgetPublicKey }: RentVsBuyCalculatorProps = {}) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  function setField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function markTouched(key: string): void {
    setTouched((prev) => new Set(prev).add(key));
  }

  const { result, errors } = useMemo(() => {
    const raw: Record<string, unknown> = {};
    if (form.currentMonthlyRent.trim() !== '')
      raw.currentMonthlyRent = parseOptionalNumber(form.currentMonthlyRent);
    if (form.purchasePrice.trim() !== '')
      raw.purchasePrice = parseOptionalNumber(form.purchasePrice);
    raw.downPayment = form.downPayment.trim() !== '' ? parseOptionalNumber(form.downPayment) : 0;
    raw.timeHorizonYears =
      form.timeHorizonYears.trim() !== '' ? parseOptionalNumber(form.timeHorizonYears) : undefined;
    if (form.termYears.trim() !== '') raw.termYears = parseOptionalNumber(form.termYears);
    if (form.hoaMonthly.trim() !== '') raw.hoaMonthly = parseOptionalNumber(form.hoaMonthly);
    for (const field of OPTIONAL_PERCENT_FIELDS) {
      if (form[field].trim() !== '') raw[field] = parseOptionalNumber(form[field]);
    }

    const parsed = rentVsBuyRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return { result: null, errors: fieldErrorsFromZod(parsed.error) };
    }
    return { result: calculateRentVsBuy(parsed.data), errors: {} as Record<string, string> };
  }, [form]);

  const shownError = (field: string): string | undefined =>
    touched.has(field) ? errors[field] : undefined;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form className="space-y-4" aria-labelledby="rvb-heading">
        <h3 id="rvb-heading" className="text-base font-semibold text-ink">
          Your numbers
        </h3>
        <NumberField
          id="rvb-rent"
          label="Current monthly rent"
          prefix="$"
          required
          value={form.currentMonthlyRent}
          onChange={(v) => setField('currentMonthlyRent', v)}
          onBlur={() => markTouched('currentMonthlyRent')}
          error={shownError('currentMonthlyRent')}
        />
        <NumberField
          id="rvb-rent-growth"
          label="Annual rent growth"
          suffix="%/yr"
          helperText="Illustrative default: 3%/yr if left blank."
          value={form.rentAnnualGrowthPercent}
          onChange={(v) => setField('rentAnnualGrowthPercent', v)}
          onBlur={() => markTouched('rentAnnualGrowthPercent')}
          error={shownError('rentAnnualGrowthPercent')}
        />
        <NumberField
          id="rvb-price"
          label="Purchase price (if buying)"
          prefix="$"
          required
          value={form.purchasePrice}
          onChange={(v) => setField('purchasePrice', v)}
          onBlur={() => markTouched('purchasePrice')}
          error={shownError('purchasePrice')}
        />
        <NumberField
          id="rvb-down"
          label="Down payment"
          prefix="$"
          helperText="Must be less than the purchase price. Defaults to $0 if left blank."
          value={form.downPayment}
          onChange={(v) => setField('downPayment', v)}
          onBlur={() => markTouched('downPayment')}
          error={shownError('downPayment')}
        />
        <NumberField
          id="rvb-rate"
          label="Mortgage interest rate"
          suffix="%/yr"
          helperText="Illustrative default: 6.5%/yr if left blank."
          value={form.interestRatePercent}
          onChange={(v) => setField('interestRatePercent', v)}
          onBlur={() => markTouched('interestRatePercent')}
          error={shownError('interestRatePercent')}
        />
        <NumberField
          id="rvb-term"
          label="Loan term"
          suffix="years"
          helperText="Illustrative default: 30 years if left blank."
          value={form.termYears}
          onChange={(v) => setField('termYears', v)}
          onBlur={() => markTouched('termYears')}
          error={shownError('termYears')}
        />
        <NumberField
          id="rvb-appreciation"
          label="Home-price appreciation"
          suffix="%/yr"
          helperText="Illustrative default: 3%/yr if left blank."
          value={form.homeAppreciationAnnualPercent}
          onChange={(v) => setField('homeAppreciationAnnualPercent', v)}
          onBlur={() => markTouched('homeAppreciationAnnualPercent')}
          error={shownError('homeAppreciationAnnualPercent')}
        />
        <NumberField
          id="rvb-tax"
          label="Property tax"
          suffix="%/yr of value"
          helperText="Illustrative default: 1.1%/yr if left blank."
          value={form.propertyTaxAnnualPercent}
          onChange={(v) => setField('propertyTaxAnnualPercent', v)}
          onBlur={() => markTouched('propertyTaxAnnualPercent')}
          error={shownError('propertyTaxAnnualPercent')}
        />
        <NumberField
          id="rvb-insurance"
          label="Homeowners insurance"
          suffix="%/yr of value"
          helperText="Illustrative default: 0.35%/yr if left blank."
          value={form.insuranceAnnualPercent}
          onChange={(v) => setField('insuranceAnnualPercent', v)}
          onBlur={() => markTouched('insuranceAnnualPercent')}
          error={shownError('insuranceAnnualPercent')}
        />
        <NumberField
          id="rvb-hoa"
          label="Monthly HOA dues"
          prefix="$"
          helperText="Defaults to $0 if left blank."
          value={form.hoaMonthly}
          onChange={(v) => setField('hoaMonthly', v)}
          onBlur={() => markTouched('hoaMonthly')}
          error={shownError('hoaMonthly')}
        />
        <NumberField
          id="rvb-maintenance"
          label="Annual maintenance"
          suffix="%/yr of value"
          helperText="Illustrative default: 1%/yr if left blank."
          value={form.maintenanceAnnualPercent}
          onChange={(v) => setField('maintenanceAnnualPercent', v)}
          onBlur={() => markTouched('maintenanceAnnualPercent')}
          error={shownError('maintenanceAnnualPercent')}
        />
        <NumberField
          id="rvb-buy-closing"
          label="Buying closing costs"
          suffix="% of price"
          helperText="Illustrative default: 2.5% if left blank."
          value={form.buyingClosingCostsPercent}
          onChange={(v) => setField('buyingClosingCostsPercent', v)}
          onBlur={() => markTouched('buyingClosingCostsPercent')}
          error={shownError('buyingClosingCostsPercent')}
        />
        <NumberField
          id="rvb-sell-closing"
          label="Selling costs"
          suffix="% of sale price"
          helperText="Illustrative default: 7% if left blank."
          value={form.sellingClosingCostsPercent}
          onChange={(v) => setField('sellingClosingCostsPercent', v)}
          onBlur={() => markTouched('sellingClosingCostsPercent')}
          error={shownError('sellingClosingCostsPercent')}
        />
        <NumberField
          id="rvb-investment"
          label="Opportunity-cost investment return"
          suffix="%/yr"
          helperText="Illustrative default: 5%/yr if left blank."
          value={form.investmentReturnAnnualPercent}
          onChange={(v) => setField('investmentReturnAnnualPercent', v)}
          onBlur={() => markTouched('investmentReturnAnnualPercent')}
          error={shownError('investmentReturnAnnualPercent')}
        />
        <NumberField
          id="rvb-horizon"
          label="Time horizon"
          suffix="years"
          required
          value={form.timeHorizonYears}
          onChange={(v) => setField('timeHorizonYears', v)}
          onBlur={() => markTouched('timeHorizonYears')}
          error={shownError('timeHorizonYears')}
        />
      </form>

      <div aria-live="polite">
        <h3 className="text-base font-semibold text-ink">Estimated comparison</h3>
        {result ? (
          <div className="mt-2 rounded-lg border border-paper-line bg-paper-raised p-4">
            <p className="text-sm text-ink-soft">Over {result.timeHorizonYears} years, net cost</p>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-ink-faint">Renting</p>
                <p className="text-xl font-semibold text-ink">
                  {formatCurrency(result.renting.netCost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-faint">Buying</p>
                <p className="text-xl font-semibold text-ink">
                  {formatCurrency(result.buying.netCost)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-ink">
              Difference: {formatCurrency(Math.abs(result.comparativeDifference))}{' '}
              {result.comparativeDifference >= 0 ? 'less net cost buying' : 'less net cost renting'}{' '}
              over this horizon, under these assumptions.
            </p>
            <p role="note" className="mt-2 rounded-md bg-warn/10 p-2 text-xs font-medium text-warn">
              {result.sensitivityWarning}
            </p>
            <h4 className="mt-4 text-sm font-semibold text-ink">Renting breakdown</h4>
            <dl className="mt-1 space-y-1 text-sm text-ink">
              <Row label="Total rent paid" value={result.renting.totalRentPaid} />
              <Row
                label="Forgone investment growth offset"
                value={result.renting.investmentGrowthOnUpfrontCash}
              />
              <Row label="Net cost" value={result.renting.netCost} emphasize />
            </dl>
            <h4 className="mt-4 text-sm font-semibold text-ink">Buying breakdown</h4>
            <dl className="mt-1 space-y-1 text-sm text-ink">
              <Row label="Upfront cash" value={result.buying.upfrontCash} />
              <Row label="Ownership costs paid" value={result.buying.totalOwnershipCostsPaid} />
              <Row label="Home value at horizon end" value={result.buying.homeValueAtHorizonEnd} />
              <Row label="Remaining loan balance" value={result.buying.remainingLoanBalance} />
              <Row label="Selling costs" value={result.buying.sellingCosts} />
              <Row label="Net sale proceeds" value={result.buying.netSaleProceeds} />
              <Row label="Net cost" value={result.buying.netCost} emphasize />
            </dl>
            <h4 className="mt-4 text-sm font-semibold text-ink">Assumptions used</h4>
            <AssumptionsList assumptions={result.assumptionsUsed} />
            <p className="mt-4 text-xs text-ink-faint">{ESTIMATE_DISCLAIMER}</p>
            {leadCaptureWidgetPublicKey ? (
              <LeadCaptureSection
                widgetPublicKey={leadCaptureWidgetPublicKey}
                calculatorType={CalculatorType.RentVsBuy}
                summary={{
                  timeHorizonYears: result.timeHorizonYears,
                  comparativeDifference: Math.round(result.comparativeDifference),
                }}
              />
            ) : null}
          </div>
        ) : (
          <p role="status" className="mt-2 text-sm text-ink-soft">
            Enter your rent, purchase price, and time horizon to see a comparison. Fix any
            highlighted field to continue.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div
      className={`flex justify-between ${emphasize ? 'border-t border-paper-line pt-1 font-semibold' : ''}`}
    >
      <dt>{label}</dt>
      <dd>{formatCurrency(value)}</dd>
    </div>
  );
}
