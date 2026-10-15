import type { AssumptionEntry } from './schemas';

/**
 * Builds one echoed assumption entry. `rawInput` is the value exactly as received from the
 * request (before any `??` default fallback) — `undefined` means the user left the field
 * blank, so the resolved `value` came from `./defaults`; anything else (including `0`,
 * which `??` would otherwise treat the same as "missing") means the user supplied it.
 */
export function assumption(
  field: string,
  label: string,
  value: number,
  rawInput: number | undefined,
  note?: string,
): AssumptionEntry {
  return {
    field,
    label,
    value,
    source: rawInput === undefined ? 'default' : 'user',
    ...(note ? { note } : {}),
  };
}
