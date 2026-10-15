const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats a number already rounded to cents (by the shared calculator functions) as USD. */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return currencyFormatter.format(value);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value}%`;
}
