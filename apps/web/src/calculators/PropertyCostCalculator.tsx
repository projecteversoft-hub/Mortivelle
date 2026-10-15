import { useMemo, useState } from 'react';
import {
  calculatePropertyCost,
  CalculatorType,
  ESTIMATE_DISCLAIMER,
  propertyCostRequestSchema,
} from '@tech-realty-rentals/shared';
import { AssumptionsList } from './AssumptionsList';
import { NumberField } from './NumberField';
import { formatCurrency } from './format';
import { fieldErrorsFromZod, parseOptionalNumber } from './formUtils';
import { LeadCaptureSection } from '../leads/LeadCaptureSection';

interface FormState {
  purchasePrice: string;
  downPayment: string;
  interestRatePercent: string;
  termYears: string;
  propertyTaxAnnualAmount: string;
  insuranceAnnualAmount: string;
  hoaMonthly: string;
  otherMonthlyCosts: string;
  closingCostsAmount: string;
}

const INITIAL_STATE: FormState = {
  purchasePrice: '',
  downPayment: '',
  interestRatePercent: '',
  termYears: '',
  propertyTaxAnnualAmount: '',
  insuranceAnnualAmount: '',
  hoaMonthly: '',
  otherMonthlyCosts: '',
  closingCostsAmount: '',
};

export interface PropertyCostCalculatorProps {
  /** See AffordabilityCalculator.tsx's prop doc — same documented scope decision. */
  leadCaptureWidgetPublicKey?: string;
}

/** Monthly payment / property true cost calculator (docs/05 §2). Client-side only; see
 * AffordabilityCalculator.tsx for the shared architecture note. */
export function PropertyCostCalculator({
  leadCaptureWidgetPublicKey,
}: PropertyCostCalculatorProps = {}) {
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
    if (form.purchasePrice.trim() !== '')
      raw.purchasePrice = parseOptionalNumber(form.purchasePrice);
    if (form.downPayment.trim() !== '') raw.downPayment = parseOptionalNumber(form.downPayment);
    else raw.downPayment = 0; // downPayment is required by the schema; blank means "none".
    if (form.interestRatePercent.trim() !== '')
      raw.interestRatePercent = parseOptionalNumber(form.interestRatePercent);
    if (form.termYears.trim() !== '') raw.termYears = parseOptionalNumber(form.termYears);
    if (form.propertyTaxAnnualAmount.trim() !== '')
      raw.propertyTaxAnnualAmount = parseOptionalNumber(form.propertyTaxAnnualAmount);
    if (form.insuranceAnnualAmount.trim() !== '')
      raw.insuranceAnnualAmount = parseOptionalNumber(form.insuranceAnnualAmount);
    if (form.hoaMonthly.trim() !== '') raw.hoaMonthly = parseOptionalNumber(form.hoaMonthly);
    if (form.otherMonthlyCosts.trim() !== '')
      raw.otherMonthlyCosts = parseOptionalNumber(form.otherMonthlyCosts);
    if (form.closingCostsAmount.trim() !== '')
      raw.closingCostsAmount = parseOptionalNumber(form.closingCostsAmount);

    const parsed = propertyCostRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return { result: null, errors: fieldErrorsFromZod(parsed.error) };
    }
    return { result: calculatePropertyCost(parsed.data), errors: {} as Record<string, string> };
  }, [form]);

  const shownError = (field: string): string | undefined =>
    touched.has(field) ? errors[field] : undefined;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form className="space-y-4" aria-labelledby="cost-heading">
        <h3 id="cost-heading" className="text-base font-semibold text-ink">
          Your numbers
        </h3>
        <NumberField
          id="cost-price"
          label="Purchase price"
          prefix="$"
          required
          value={form.purchasePrice}
          onChange={(v) => setField('purchasePrice', v)}
          onBlur={() => markTouched('purchasePrice')}
          error={shownError('purchasePrice')}
        />
        <NumberField
          id="cost-down"
          label="Down payment"
          prefix="$"
          helperText="Must be less than the purchase price. Defaults to $0 if left blank."
          value={form.downPayment}
          onChange={(v) => setField('downPayment', v)}
          onBlur={() => markTouched('downPayment')}
          error={shownError('downPayment')}
        />
        <NumberField
          id="cost-rate"
          label="Interest rate"
          suffix="%/yr"
          helperText="Illustrative default: 6.5%/yr if left blank."
          value={form.interestRatePercent}
          onChange={(v) => setField('interestRatePercent', v)}
          onBlur={() => markTouched('interestRatePercent')}
          error={shownError('interestRatePercent')}
        />
        <NumberField
          id="cost-term"
          label="Loan term"
          suffix="years"
          helperText="Illustrative default: 30 years if left blank."
          value={form.termYears}
          onChange={(v) => setField('termYears', v)}
          onBlur={() => markTouched('termYears')}
          error={shownError('termYears')}
        />
        <NumberField
          id="cost-tax"
          label="Annual property tax"
          prefix="$"
          helperText="Illustrative default if left blank: 1.1% of price per year."
          value={form.propertyTaxAnnualAmount}
          onChange={(v) => setField('propertyTaxAnnualAmount', v)}
          onBlur={() => markTouched('propertyTaxAnnualAmount')}
          error={shownError('propertyTaxAnnualAmount')}
        />
        <NumberField
          id="cost-insurance"
          label="Annual homeowners insurance"
          prefix="$"
          helperText="Illustrative default if left blank: 0.35% of price per year."
          value={form.insuranceAnnualAmount}
          onChange={(v) => setField('insuranceAnnualAmount', v)}
          onBlur={() => markTouched('insuranceAnnualAmount')}
          error={shownError('insuranceAnnualAmount')}
        />
        <NumberField
          id="cost-hoa"
          label="Monthly HOA dues"
          prefix="$"
          helperText="Defaults to $0 if left blank."
          value={form.hoaMonthly}
          onChange={(v) => setField('hoaMonthly', v)}
          onBlur={() => markTouched('hoaMonthly')}
          error={shownError('hoaMonthly')}
        />
        <NumberField
          id="cost-other"
          label="Other disclosed monthly costs"
          prefix="$"
          helperText="Defaults to $0 if left blank."
          value={form.otherMonthlyCosts}
          onChange={(v) => setField('otherMonthlyCosts', v)}
          onBlur={() => markTouched('otherMonthlyCosts')}
          error={shownError('otherMonthlyCosts')}
        />
        <NumberField
          id="cost-closing"
          label="Estimated closing costs"
          prefix="$"
          helperText="Illustrative default if left blank: 2.5% of price."
          value={form.closingCostsAmount}
          onChange={(v) => setField('closingCostsAmount', v)}
          onBlur={() => markTouched('closingCostsAmount')}
          error={shownError('closingCostsAmount')}
        />
      </form>

      <div aria-live="polite">
        <h3 className="text-base font-semibold text-ink">Estimated results</h3>
        {result ? (
          <div className="mt-2 rounded-lg border border-paper-line bg-paper-raised p-4">
            <p className="text-sm text-ink-soft">Loan amount</p>
            <p className="text-2xl font-semibold text-ink">{formatCurrency(result.loanAmount)}</p>
            <p className="mt-3 text-sm text-ink-soft">Estimated monthly ownership cost</p>
            <dl className="mt-1 space-y-1 text-sm text-ink">
              <Row
                label="Principal & interest"
                value={result.monthlyBreakdown.principalAndInterest}
              />
              <Row label="Property tax" value={result.monthlyBreakdown.propertyTax} />
              <Row label="Insurance" value={result.monthlyBreakdown.insurance} />
              <Row label="HOA" value={result.monthlyBreakdown.hoa} />
              {result.monthlyBreakdown.other > 0 ? (
                <Row label="Other costs" value={result.monthlyBreakdown.other} />
              ) : null}
              <Row
                label="Total"
                value={result.monthlyBreakdown.totalMonthlyOwnershipCost}
                emphasize
              />
            </dl>
            <p className="mt-3 text-sm text-ink-soft">Estimated cash due at closing</p>
            <dl className="mt-1 space-y-1 text-sm text-ink">
              <Row label="Down payment" value={result.estimatedCashDueAtClosing.downPayment} />
              <Row label="Closing costs" value={result.estimatedCashDueAtClosing.closingCosts} />
              <Row label="Total" value={result.estimatedCashDueAtClosing.total} emphasize />
            </dl>
            <h4 className="mt-4 text-sm font-semibold text-ink">Assumptions used</h4>
            <AssumptionsList assumptions={result.assumptionsUsed} />
            <p className="mt-4 text-xs text-ink-faint">{ESTIMATE_DISCLAIMER}</p>
            {leadCaptureWidgetPublicKey ? (
              <LeadCaptureSection
                widgetPublicKey={leadCaptureWidgetPublicKey}
                calculatorType={CalculatorType.PropertyCost}
                summary={{
                  loanAmount: Math.round(result.loanAmount),
                  totalMonthlyCost: Math.round(result.monthlyBreakdown.totalMonthlyOwnershipCost),
                }}
              />
            ) : null}
          </div>
        ) : (
          <p role="status" className="mt-2 text-sm text-ink-soft">
            Enter a purchase price to see an estimate. Fix any highlighted field to continue.
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
