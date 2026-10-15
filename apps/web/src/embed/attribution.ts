import type { AttributionEventType } from '@tech-realty-rentals/shared';

/**
 * Fire-and-forget attribution beacon (docs/06 §5, docs/04 §2). Never blocks or affects
 * rendering: a failed/slow network call must not break the embed. No client timestamp is
 * sent -- the server always stamps `occurredAt` itself.
 */
export function recordAttributionEvent(input: {
  widgetPublicKey: string;
  eventType: AttributionEventType;
  campaign?: string;
  source?: string;
  landingPath?: string;
}): void {
  fetch('/api/v1/public/analytics/events', {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).catch(() => {
    // Analytics is best-effort; swallow network errors.
  });
}
