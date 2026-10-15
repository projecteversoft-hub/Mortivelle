import type { AssumptionEntry } from '@tech-realty-rentals/shared';

/**
 * Echoes every assumption the calculation used, labeled "You entered" vs "Illustrative
 * default" (docs/05 §2: "Show which values are user-provided versus defaulted or
 * externally sourced"; docs/10 §1: "All assumptions/defaults are visible and editable").
 * Status (user vs. default) is conveyed by text, not color alone.
 */
export function AssumptionsList({ assumptions }: { assumptions: AssumptionEntry[] }) {
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {assumptions.map((assumption) => (
        <li key={assumption.field} className="flex flex-wrap items-baseline gap-x-2 text-ink-soft">
          <span className="font-medium text-ink">{assumption.label}:</span>
          <span>{assumption.value}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              assumption.source === 'user'
                ? 'bg-brand/10 text-brand-strong'
                : 'bg-paper-line text-ink-faint'
            }`}
          >
            {assumption.source === 'user' ? 'You entered' : 'Illustrative default'}
          </span>
          {assumption.note ? (
            <span className="text-xs text-ink-faint">({assumption.note})</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
