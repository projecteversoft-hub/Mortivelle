import type { SubmitLeadRequest, SubmitLeadResponse } from '@tech-realty-rentals/shared';

export type SubmitLeadOutcome =
  { status: 'ok' } | { status: 'validation-error'; message: string } | { status: 'error' };

/**
 * Posts a lead-capture submission (docs/04 §3). No credentials: this is the anonymous,
 * public endpoint, same as the calculator/analytics/widget-config fetches elsewhere in this
 * app. Never puts contact details or calculator inputs in a URL (CLAUDE.md §4) -- everything
 * goes in the POST body.
 */
export async function submitLead(body: SubmitLeadRequest): Promise<SubmitLeadOutcome> {
  try {
    const res = await fetch('/api/v1/public/leads', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const parsed = (await res.json()) as SubmitLeadResponse;
      return parsed.received ? { status: 'ok' } : { status: 'error' };
    }
    if (res.status === 400 || res.status === 409) {
      return {
        status: 'validation-error',
        message: 'This request could not be submitted. Please check your selections and try again.',
      };
    }
    return { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}
