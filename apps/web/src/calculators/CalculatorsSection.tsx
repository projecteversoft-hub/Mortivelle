import { useState } from 'react';
import {
  CalculatorType,
  type CalculatorType as CalculatorTypeValue,
} from '@tech-realty-rentals/shared';
import { AffordabilityCalculator } from './AffordabilityCalculator';
import { PropertyCostCalculator } from './PropertyCostCalculator';
import { RentVsBuyCalculator } from './RentVsBuyCalculator';

/*
 * Architecture note (Phase 3, docs/11 §4): results are computed entirely client-side, by
 * calling the shared pure functions from `@tech-realty-rentals/shared` directly in each calculator
 * component — there is no network round-trip per keystroke. A server round-trip for every
 * input change would be bad UX (visible latency on every keypress) and would risk exactly
 * what docs/05 §7 and docs/11 §4 prohibit: "no sensitive input in URL query strings,
 * analytics payloads or logs" is easiest to guarantee when the numbers never leave the
 * browser in the first place. The public `POST /api/v1/public/calculators/*` endpoints
 * (apps/api/src/calculators) still exist and are fully implemented/tested as the
 * documented, versioned contract docs/04 §2 requires — they matter for Phase 4's widget
 * embedding (an agent's embedded widget on a third-party page is a separate, less-trusted
 * execution context than this first-party app) and for any future server-sourced default
 * (docs/05 §3 "external rate/property data" stays disabled either way). Nothing in this
 * MVP requires the API round-trip for the first-party calculator UI itself.
 *
 * Simple local tab state, not a router: three calculators don't justify adding
 * `react-router` (there is no router anywhere in this app yet) — a segmented control is a
 * smaller, zero-dependency way to let a visitor switch between them without losing scroll
 * position or triggering a full navigation.
 */

type CalculatorKey = 'affordability' | 'property-cost' | 'rent-vs-buy';

/** Maps the widget-facing `CalculatorType` enum (packages/shared/src/widgets.ts, Phase 4) to
 * this component's own internal tab keys, so the public widget/agent dashboard config
 * ("which calculators does this widget enable") can filter these same tabs without
 * duplicating any calculator UI code (docs/06: "reuse them"). */
const CALCULATOR_TYPE_TO_KEY: Record<CalculatorTypeValue, CalculatorKey> = {
  [CalculatorType.Affordability]: 'affordability',
  [CalculatorType.PropertyCost]: 'property-cost',
  [CalculatorType.RentVsBuy]: 'rent-vs-buy',
};

const TABS: Array<{ key: CalculatorKey; label: string }> = [
  { key: 'affordability', label: 'Affordability' },
  { key: 'property-cost', label: 'Monthly payment & true cost' },
  { key: 'rent-vs-buy', label: 'Rent vs. buy' },
];

export interface CalculatorsSectionProps {
  /** Restricts which calculator tabs render (Phase 4 widget embed). Omitted (the default,
   * and the only path Phase 3's first-party app uses) renders all three, unchanged. */
  enabledCalculators?: CalculatorTypeValue[];
  /** Phase 5 lead capture (docs/05 §4): threaded down to each calculator so its "Save /
   * Alerts / Contact" section can resolve a widget to submit against. Omitted in the
   * first-party app (no resolvable widget yet); passed through from the embed context. */
  leadCaptureWidgetPublicKey?: string;
}

export function CalculatorsSection({
  enabledCalculators,
  leadCaptureWidgetPublicKey,
}: CalculatorsSectionProps = {}) {
  const enabledKeys = enabledCalculators
    ? new Set(enabledCalculators.map((type) => CALCULATOR_TYPE_TO_KEY[type]))
    : null;
  const visibleTabs = enabledKeys ? TABS.filter((tab) => enabledKeys.has(tab.key)) : TABS;
  const [active, setActive] = useState<CalculatorKey>(visibleTabs[0]?.key ?? 'affordability');

  return (
    <section aria-labelledby="calculators-heading" className="mt-10">
      <h2 id="calculators-heading" className="text-xl font-semibold tracking-tight text-ink">
        Homebuyer calculators
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        No sign-in required. Every number below is editable — defaults shown are illustrative, not
        live market data.
      </p>

      {visibleTabs.length === 0 ? (
        <p role="status" className="mt-4 text-sm text-ink-soft">
          No calculators are enabled for this widget.
        </p>
      ) : null}

      <div role="tablist" aria-label="Choose a calculator" className="mt-4 flex flex-wrap gap-2">
        {visibleTabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.key}`}
              onClick={() => setActive(tab.key)}
              className={`rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                isActive
                  ? 'bg-brand text-white'
                  : 'bg-paper-raised text-ink-soft hover:bg-paper-line'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {visibleTabs.some((tab) => tab.key === 'affordability') ? (
        <div
          role="tabpanel"
          id="panel-affordability"
          aria-labelledby="tab-affordability"
          hidden={active !== 'affordability'}
          className="mt-6"
        >
          {active === 'affordability' ? (
            <AffordabilityCalculator leadCaptureWidgetPublicKey={leadCaptureWidgetPublicKey} />
          ) : null}
        </div>
      ) : null}
      {visibleTabs.some((tab) => tab.key === 'property-cost') ? (
        <div
          role="tabpanel"
          id="panel-property-cost"
          aria-labelledby="tab-property-cost"
          hidden={active !== 'property-cost'}
          className="mt-6"
        >
          {active === 'property-cost' ? (
            <PropertyCostCalculator leadCaptureWidgetPublicKey={leadCaptureWidgetPublicKey} />
          ) : null}
        </div>
      ) : null}
      {visibleTabs.some((tab) => tab.key === 'rent-vs-buy') ? (
        <div
          role="tabpanel"
          id="panel-rent-vs-buy"
          aria-labelledby="tab-rent-vs-buy"
          hidden={active !== 'rent-vs-buy'}
          className="mt-6"
        >
          {active === 'rent-vs-buy' ? (
            <RentVsBuyCalculator leadCaptureWidgetPublicKey={leadCaptureWidgetPublicKey} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
