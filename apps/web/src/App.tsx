import { CalculatorsSection } from './calculators/CalculatorsSection';
import { useApiHealth, type HealthState } from './useApiHealth';

const LABEL: Record<HealthState, string> = {
  checking: 'Checking the platform API…',
  ready: 'Platform API is ready.',
  unavailable: 'Platform API is unavailable.',
};

const TONE: Record<HealthState, string> = {
  checking: 'text-ink-soft',
  ready: 'text-ok',
  unavailable: 'text-bad',
};

export function App() {
  const { state, recheck } = useApiHealth();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Tech Realty Rentals</h1>
      <p className="mt-3 text-ink-soft">
        Homebuyer calculators and agent-branded tools. Calculators are available below. Agents can
        sign in to the{' '}
        <a className="underline" href="/agent.html">
          agent dashboard
        </a>{' '}
        to configure embeddable widgets; consent-based lead capture and lender delivery are not yet
        available.
      </p>

      <section
        aria-labelledby="status-heading"
        className="mt-10 rounded-lg border border-paper-line bg-paper-raised p-5"
      >
        <h2 id="status-heading" className="text-sm font-medium text-ink-soft">
          System status
        </h2>
        <p role="status" aria-live="polite" className={`mt-2 text-lg font-medium ${TONE[state]}`}>
          {LABEL[state]}
        </p>
        <button
          type="button"
          onClick={recheck}
          className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
        >
          Check again
        </button>
      </section>

      <CalculatorsSection />

      <p className="mt-10 text-xs text-ink-faint">
        Estimates shown by Tech Realty Rentals tools are not loan offers, approvals, or financial
        advice.
      </p>
    </main>
  );
}
