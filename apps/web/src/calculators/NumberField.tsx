import type { ChangeEvent, FocusEvent } from 'react';

export interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  /** e.g. "Illustrative default: 6.5%/yr if left blank." Never claims a real-time market rate. */
  helperText?: string;
  prefix?: string;
  suffix?: string;
  required?: boolean;
}

/**
 * A labeled numeric input used by all three calculators (docs/10 §5 / docs/05 §5
 * accessibility requirements):
 *  - `label`'s `htmlFor` is programmatically associated with the input's `id`.
 *  - Helper text and the validation error are both wired via `aria-describedby`, so a
 *    screen reader announces them together with the field, not just visually alongside it.
 *  - The error is never color-only: it is prefixed with a text/glyph marker and has its own
 *    `role="alert"` text, in addition to the red border.
 *  - It's a native `<input>`, so it is reachable and operable by keyboard with no extra
 *    wiring, and the focus ring is visible (Tailwind `focus-visible` classes below).
 *  - Never written to a URL: this is plain React state, not a query param (docs/05 §7).
 */
export function NumberField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  helperText,
  prefix,
  suffix,
  required,
}: NumberFieldProps) {
  const helperId = helperText ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(' ') || undefined;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }
  function handleBlur(_event: FocusEvent<HTMLInputElement>) {
    onBlur?.();
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-bad">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {helperText ? (
        <p id={helperId} className="mt-0.5 text-xs text-ink-faint">
          {helperText}
        </p>
      ) : null}
      <div className="mt-1 flex items-stretch">
        {prefix ? (
          <span
            aria-hidden="true"
            className="inline-flex items-center rounded-l-md border border-r-0 border-paper-line bg-paper px-2 text-sm text-ink-soft"
          >
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          name={id}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required ? true : undefined}
          className={`w-full rounded-md border bg-paper-raised px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            prefix ? 'rounded-l-none' : ''
          } ${suffix ? 'rounded-r-none' : ''} ${error ? 'border-bad' : 'border-paper-line'}`}
        />
        {suffix ? (
          <span
            aria-hidden="true"
            className="inline-flex items-center rounded-r-md border border-l-0 border-paper-line bg-paper px-2 text-sm text-ink-soft"
          >
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm font-medium text-bad">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
