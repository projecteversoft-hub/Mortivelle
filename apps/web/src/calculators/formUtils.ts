import type { ZodError } from 'zod';

/**
 * Blank means "use the illustrative default" (mirrors the API: an omitted field, not a
 * sent-but-empty one). Anything else is passed through as a number — including `NaN` for
 * non-numeric text, which the shared Zod schema then rejects with an accessible message
 * rather than this code trying to pre-validate the string itself.
 */
export function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  return Number(trimmed);
}

/** First validation message per top-level field, keyed the same way the API's `fieldErrors` are. */
export function fieldErrorsFromZod(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_';
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}
