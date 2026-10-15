import { useRef, useState } from 'react';
import type { RequestedAction } from '@tech-realty-rentals/shared';
import {
  ConsentPurpose,
  SYNTHETIC_DISCLOSURE_TEXT,
  type CalculatorType as CalculatorTypeValue,
  type SubmitLeadRequest,
} from '@tech-realty-rentals/shared';
import { submitLead } from './submitLead';

const PURPOSE_LABELS: Record<ConsentPurpose, string> = {
  [ConsentPurpose.SaveResults]: 'Save this scenario',
  [ConsentPurpose.RateAlerts]: 'Receive rate or market alerts',
  [ConsentPurpose.LenderContact]: 'Request contact from a mortgage professional',
};

/** When more than one purpose is checked, this order picks the single `requestedAction`
 * (docs/04 §3 requires exactly one) — a direct contact request is the most specific/
 * actionable intent, so it takes priority over an alerts subscription, which in turn takes
 * priority over a plain save. Documented UI-side judgment call (see the Phase 5 final
 * report) — the server only ever enforces that THIS resolved action's own purpose is present
 * in `consentSelections`, never which one the UI picked. */
const REQUESTED_ACTION_PRIORITY: ConsentPurpose[] = [
  ConsentPurpose.LenderContact,
  ConsentPurpose.RateAlerts,
  ConsentPurpose.SaveResults,
];

function resolveRequestedAction(selected: Set<ConsentPurpose>): RequestedAction {
  const picked = REQUESTED_ACTION_PRIORITY.find((p) => selected.has(p));
  return (picked ?? ConsentPurpose.SaveResults) as RequestedAction;
}

export interface LeadCaptureSectionProps {
  /** The widget this calculator result is being shown through — lead capture requires a
   * resolvable widget/tenant (docs/04 §3), so this section only renders when one is known
   * (currently: the embed context — see the Phase 5 final report for why the first-party
   * app does not render this yet). */
  widgetPublicKey: string;
  calculatorType: CalculatorTypeValue;
  /** A small, already-rounded summary of the result — never the full raw form state
   * (docs/04 §3 "minimal result/assumption summary"), at most 8 fields. */
  summary?: Record<string, string | number | boolean>;
}

type Status = 'idle' | 'submitting' | 'success' | 'error';

/**
 * The three optional, purpose-specific lead-capture actions shown after a calculator result
 * (docs/05 §4, docs/10 §1). Always additive: rendered below an already-visible result, never
 * a modal/takeover, and the result stays visible if this section is ignored or abandoned.
 * Nothing here is preselected (docs/07 §2).
 */
export function LeadCaptureSection({
  widgetPublicKey,
  calculatorType,
  summary,
}: LeadCaptureSectionProps) {
  const [selected, setSelected] = useState<Set<ConsentPurpose>>(new Set());
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // One idempotency key per form-fill session (this component instance), not per click
  // (docs/04 §1, docs/08 §6) -- a fresh calculator result/remount gets a fresh key.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  function togglePurpose(purpose: ConsentPurpose): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(purpose)) next.delete(purpose);
      else next.add(purpose);
      return next;
    });
  }

  const showContactFields = selected.size > 0;
  const hasContact = email.trim() !== '' || phone.trim() !== '';
  const canSubmit = showContactFields && hasContact && status !== 'submitting';

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus('submitting');
    setErrorMessage(null);

    const body: SubmitLeadRequest = {
      widgetPublicKey,
      contact: {
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      },
      requestedAction: resolveRequestedAction(selected),
      consentSelections: [...selected],
      ...(summary ? { calculatorContext: { calculatorType, summary } } : {}),
      idempotencyKey: idempotencyKeyRef.current,
    };

    const outcome = await submitLead(body);
    if (outcome.status === 'ok') {
      setStatus('success');
    } else if (outcome.status === 'validation-error') {
      setStatus('error');
      setErrorMessage(outcome.message);
    } else {
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
    }
  }

  if (status === 'success') {
    return (
      <div className="mt-4 rounded-md border border-paper-line bg-paper-raised p-3">
        <p role="status" aria-live="polite" className="text-sm text-ink">
          Thanks — your request has been received.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="lead-capture-heading"
      className="mt-4 rounded-md border border-paper-line bg-paper-raised p-4"
    >
      <h4 id="lead-capture-heading" className="text-sm font-semibold text-ink">
        Want to do more with this estimate?
      </h4>
      <p className="mt-1 text-xs text-ink-faint">
        Optional — your estimate above is already final and will not change or disappear based on
        anything below. Nothing is preselected. Draft disclosure text below is a placeholder pending
        review by qualified counsel; it is not legal advice.
      </p>

      <fieldset className="mt-3 space-y-3">
        <legend className="sr-only">Choose one or more optional next steps</legend>
        {Object.values(ConsentPurpose).map((purpose) => (
          <div key={purpose}>
            <div className="flex items-start gap-2">
              <input
                id={`lead-purpose-${purpose}`}
                type="checkbox"
                checked={selected.has(purpose)}
                onChange={() => togglePurpose(purpose)}
                className="mt-0.5 h-4 w-4 rounded border-paper-line text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
              <label htmlFor={`lead-purpose-${purpose}`} className="text-sm text-ink">
                {PURPOSE_LABELS[purpose]}
              </label>
            </div>
            {selected.has(purpose) ? (
              <p className="ml-6 mt-1 text-xs text-ink-faint">
                {SYNTHETIC_DISCLOSURE_TEXT[purpose]}
              </p>
            ) : null}
          </div>
        ))}
      </fieldset>

      {showContactFields ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="lead-email" className="text-xs font-medium text-ink-soft">
              Email
            </label>
            <input
              id="lead-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-paper-line px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="lead-phone" className="text-xs font-medium text-ink-soft">
              Phone (optional)
            </label>
            <input
              id="lead-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-paper-line px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </div>
          <p className="text-xs text-ink-faint sm:col-span-2">
            At least one of email or phone is required to continue.
          </p>
        </div>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="mt-3 text-sm text-bad">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'submitting' ? 'Sending…' : 'Submit'}
      </button>
    </form>
  );
}
