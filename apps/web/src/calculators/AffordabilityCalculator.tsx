import { useMemo, useState } from 'react';
import {
  affordabilityRequestSchema,
  calculateAffordability,
  CalculatorType,
  ESTIMATE_DISCLAIMER,
} from '@tech-realty-rentals/shared';
import { AssumptionsList } from './AssumptionsList';
import { NumberField } from './NumberField';
import { formatCurrency } from './format';
import { fieldErrorsFromZod, parseOptionalNumber } from './formUtils';
import { LeadCaptureSection } from '../leads/LeadCaptureSection';

interface FormState {
  grossMonthlyIncome: string;
  monthlyDebts: string;
  downPayment: string;
  interestRatePercent: string;
  termYears: string;
  propertyTaxAnnualPercent: string;
  insuranceAnnualPercent: string;
  hoaMonthly: string;
  includeMortgageInsurance: boolean;
  mortgageInsuranceAnnualPercent: string;
}

const INITIAL_STATE: FormState = {
  grossMonthlyIncome: '',
  monthlyDebts: '',
  downPayment: '',
  interestRatePercent: '',
  termYears: '',
  propertyTaxAnnualPercent: '',
  insuranceAnnualPercent: '',
  hoaMonthly: '',
  includeMortgageInsurance: false,
  mortgageInsuranceAnnualPercent: '',
};

/**
 * Affordability calculator (docs/05 §2). Computed entirely client-side via the shared pure
 * function — see apps/web/src/calculators/README-architecture note in CalculatorsSection.tsx
 * for why. No field here is ever written to the URL (docs/05 §7).
 */
export interface AffordabilityCalculatorProps {
  /** Omitted in the first-party app (no resolvable widget yet — see the Phase 5 final
   * report); passed through from the embed context, where a widget always exists. */
  leadCaptureWidgetPublicKey?: string;
}

export function AffordabilityCalculator({
  leadCaptureWidgetPublicKey,
}: AffordabilityCalculatorProps = {}) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  function setField<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function markTouched(key: string): void {
    setTouched((prev) => new Set(prev).add(key));
  }

  const { result, errors } = useMemo(() => {
    const raw: Record<string, unknown> = {
      includeMortgageInsurance: form.includeMortgageInsurance,
    };
    if (form.grossMonthlyIncome.trim() !== '')
      raw.grossMonthlyIncome = parseOptionalNumber(form.grossMonthlyIncome);
    if (form.monthlyDebts.trim() !== '') raw.monthlyDebts = parseOptionalNumber(form.monthlyDebts);
    if (form.downPayment.trim() !== '') raw.downPayment = parseOptionalNumber(form.downPayment);
    if (form.interestRatePercent.trim() !== '')
      raw.interestRatePercent = parseOptionalNumber(form.interestRatePercent);
    if (form.termYears.trim() !== '') raw.termYears = parseOptionalNumber(form.termYears);
    if (form.propertyTaxAnnualPercent.trim() !== '')
      raw.propertyTaxAnnualPercent = parseOptionalNumber(form.propertyTaxAnnualPercent);
    if (form.insuranceAnnualPercent.trim() !== '')
      raw.insuranceAnnualPercent = parseOptionalNumber(form.insuranceAnnualPercent);
    if (form.hoaMonthly.trim() !== '') raw.hoaMonthly = parseOptionalNumber(form.hoaMonthly);
    if (form.includeMortgageInsurance && form.mortgageInsuranceAnnualPercent.trim() !== '') {
      raw.mortgageInsuranceAnnualPercent = parseOptionalNumber(form.mortgageInsuranceAnnualPercent);
    }

    const parsed = affordabilityRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return { result: null, errors: fieldErrorsFromZod(parsed.error) };
    }
    return { result: calculateAffordability(parsed.data), errors: {} as Record<string, string> };
  }, [form]);

  const shownError = (field: string): string | undefined =>
    touched.has(field) ? errors[field] : undefined;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form className="space-y-4" aria-labelledby="affordability-heading">
        <h3 id="affordability-heading" className="text-base font-semibold text-ink">
          Your numbers
        </h3>
        <NumberField
          id="aff-income"
          label="Gross monthly household income"
          prefix="$"
          required
          value={form.grossMonthlyIncome}
          onChange={(v) => setField('grossMonthlyIncome', v)}
          onBlur={() => markTouched('grossMonthlyIncome')}
          error={shownError('grossMonthlyIncome')}
        />
        <NumberField
          id="aff-debts"
          label="Recurring monthly debt payments"
          prefix="$"
          helperText="Defaults to $0 if left blank."
          value={form.monthlyDebts}
          onChange={(v) => setField('monthlyDebts', v)}
          onBlur={() => markTouched('monthlyDebts')}
          error={shownError('monthlyDebts')}
        />
        <NumberField
          id="aff-down"
          label="Down payment"
          prefix="$"
          helperText="Defaults to $0 if left blank."
          value={form.downPayment}
          onChange={(v) => setField('downPayment', v)}
          onBlur={() => markTouched('downPayment')}
          error={shownError('downPayment')}
        />
        <NumberField
          id="aff-rate"
          label="Estimated interest rate"
          suffix="%/yr"
          helperText="Illustrative default: 6.5%/yr if left blank. Not a live market rate."
          value={form.interestRatePercent}
          onChange={(v) => setField('interestRatePercent', v)}
          onBlur={() => markTouched('interestRatePercent')}
          error={shownError('interestRatePercent')}
        />
        <NumberField
          id="aff-term"
          label="Loan term"
          suffix="years"
          helperText="Illustrative default: 30 years if left blank."
          value={form.termYears}
          onChange={(v) => setField('termYears', v)}
          onBlur={() => markTouched('termYears')}
          error={shownError('termYears')}
        />
        <NumberField
          id="aff-tax"
          label="Property tax"
          suffix="%/yr of price"
          helperText="Illustrative default: 1.1%/yr if left blank."
          value={form.propertyTaxAnnualPercent}
          onChange={(v) => setField('propertyTaxAnnualPercent', v)}
          onBlur={() => markTouched('propertyTaxAnnualPercent')}
          error={shownError('propertyTaxAnnualPercent')}
        />
        <NumberField
          id="aff-insurance"
          label="Homeowners insurance"
          suffix="%/yr of price"
          helperText="Illustrative default: 0.35%/yr if left blank."
          value={form.insuranceAnnualPercent}
          onChange={(v) => setField('insuranceAnnualPercent', v)}
          onBlur={() => markTouched('insuranceAnnualPercent')}
          error={shownError('insuranceAnnualPercent')}
        />
        <NumberField
          id="aff-hoa"
          label="Monthly HOA dues"
          prefix="$"
          helperText="Defaults to $0 if left blank."
          value={form.hoaMonthly}
          onChange={(v) => setField('hoaMonthly', v)}
          onBlur={() => markTouched('hoaMonthly')}
          error={shownError('hoaMonthly')}
        />
        <div className="flex items-center gap-2">
          <input
            id="aff-include-pmi"
            type="checkbox"
            checked={form.includeMortgageInsurance}
            onChange={(e) => setField('includeMortgageInsurance', e.target.checked)}
            className="h-4 w-4 rounded border-paper-line text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <label htmlFor="aff-include-pmi" className="text-sm text-ink">
            Include an illustrative mortgage insurance assumption
          </label>
        </div>
        {form.includeMortgageInsurance ? (
          <NumberField
            id="aff-pmi"
            label="Mortgage insurance"
            suffix="%/yr of loan"
            helperText="Illustrative default: 0.5%/yr if left blank."
            value={form.mortgageInsuranceAnnualPercent}
            onChange={(v) => setField('mortgageInsuranceAnnualPercent', v)}
            onBlur={() => markTouched('mortgageInsuranceAnnualPercent')}
            error={shownError('mortgageInsuranceAnnualPercent')}
          />
        ) : null}
      </form>

      <div aria-live="polite">
        <h3 className="text-base font-semibold text-ink">Estimated results</h3>
        {result ? (
          <div className="mt-2 rounded-lg border border-paper-line bg-paper-raised p-4">
            <p className="text-sm text-ink-soft">Estimated purchase budget</p>
            <p className="text-2xl font-semibold text-ink">
              {formatCurrency(result.estimatedPurchaseBudget)}
            </p>
            <p className="mt-3 text-sm text-ink-soft">Estimated monthly housing cost</p>
            <dl className="mt-1 space-y-1 text-sm text-ink">
              <Row
                label="Principal & interest"
                value={result.monthlyBreakdown.principalAndInterest}
              />
              <Row label="Property tax" value={result.monthlyBreakdown.propertyTax} />
              <Row label="Insurance" value={result.monthlyBreakdown.insurance} />
              <Row label="HOA" value={result.monthlyBreakdown.hoa} />
              {result.monthlyBreakdown.mortgageInsurance > 0 ? (
                <Row label="Mortgage insurance" value={result.monthlyBreakdown.mortgageInsurance} />
              ) : null}
              <Row label="Total" value={result.monthlyBreakdown.total} emphasize />
            </dl>
            <h4 className="mt-4 text-sm font-semibold text-ink">Assumptions used</h4>
            <AssumptionsList assumptions={result.assumptionsUsed} />
            <p className="mt-4 text-xs text-ink-faint">
              This is a budget estimate, not a credit decision, pre-qualification, or loan approval.{' '}
              {ESTIMATE_DISCLAIMER}
            </p>
            {/* Phase 5 lead-capture actions (docs/05 §4) — additive, after the result, never
                blocking. Only rendered when a widget context is known (see
                AffordabilityCalculatorProps doc above). */}
            {leadCaptureWidgetPublicKey ? (
              <LeadCaptureSection
                widgetPublicKey={leadCaptureWidgetPublicKey}
                calculatorType={CalculatorType.Affordability}
                summary={{
                  estimatedPurchaseBudget: Math.round(result.estimatedPurchaseBudget),
                  totalMonthlyCost: Math.round(result.monthlyBreakdown.total),
                }}
              />
            ) : null}
          </div>
        ) : (
          <p role="status" className="mt-2 text-sm text-ink-soft">
            Enter your gross monthly income to see an estimate. Fix any highlighted field to
            continue.
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
