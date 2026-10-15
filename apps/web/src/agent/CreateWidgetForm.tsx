import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  CalculatorType,
  type CalculatorType as CalculatorTypeValue,
} from '@tech-realty-rentals/shared';
import { ApiRequestError, createWidget } from './api';

const CALCULATOR_OPTIONS: Array<{ value: CalculatorTypeValue; label: string }> = [
  { value: CalculatorType.Affordability, label: 'Affordability' },
  { value: CalculatorType.PropertyCost, label: 'Monthly payment & true cost' },
  { value: CalculatorType.RentVsBuy, label: 'Rent vs. buy' },
];

export function CreateWidgetForm({
  organizationId,
  onCreated,
}: {
  organizationId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0f5c4a');
  const [enabled, setEnabled] = useState<CalculatorTypeValue[]>([CalculatorType.Affordability]);
  const [originsText, setOriginsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleCalculator(value: CalculatorTypeValue): void {
    setEnabled((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (enabled.length === 0) {
      setError('Select at least one calculator.');
      return;
    }
    setSubmitting(true);
    try {
      await createWidget(organizationId, {
        name,
        theme: { primaryColor },
        enabledCalculators: enabled,
        allowedOrigins: originsText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      });
      setName('');
      setOriginsText('');
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.apiError.message
          : err instanceof Error
            ? err.message
            : 'Failed to create widget.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 flex flex-col gap-4 rounded-lg border border-paper-line bg-paper-raised p-5"
      aria-labelledby="create-widget-heading"
    >
      <h3 id="create-widget-heading" className="text-sm font-semibold text-ink">
        Create a widget
      </h3>

      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-paper-line bg-paper px-3 py-2"
        />
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-ink">Enabled calculators</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {CALCULATOR_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={enabled.includes(option.value)}
                onChange={() => toggleCalculator(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        Primary color
        <input
          type="color"
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
          className="h-9 w-16 rounded-md border border-paper-line bg-paper"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        Allowed origins (one per line, e.g. https://your-site.com)
        <textarea
          value={originsText}
          onChange={(e) => setOriginsText(e.target.value)}
          rows={3}
          placeholder={'https://your-site.com\nhttp://localhost:5173'}
          className="rounded-md border border-paper-line bg-paper px-3 py-2 font-mono text-sm"
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm font-medium text-bad">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {submitting ? 'Creating…' : 'Create widget'}
      </button>
    </form>
  );
}
