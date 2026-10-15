import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  DeliveryProviderOutcome,
  DeliveryRejectionReason,
  type DeliveryPayloadV1,
} from '@tech-realty-rentals/shared';
import type {
  LeadDeliveryOptions,
  LeadDeliveryProvider,
  LeadDeliveryResult,
} from './lead-delivery-provider';

/** Shows only enough of an email/phone to be useful for local debugging, same redaction
 * style as apps/api/src/auth/providers/local-email.provider.ts's `redactEmail`. */
function redactContact(contact: DeliveryPayloadV1['contact']): string {
  const email = contact.email
    ? (() => {
        const [local, domain] = contact.email!.split('@');
        return local && domain ? `${local.slice(0, 1)}***@${domain}` : '***';
      })()
    : null;
  const phone = contact.phone ? `***${contact.phone.slice(-4)}` : null;
  return [email, phone].filter(Boolean).join(' / ') || 'no contact';
}

/**
 * Mock/simulated `LeadDeliveryProvider` (CLAUDE.md §3/§7, docs/08 §5, docs/11 Gate 6). This
 * is the ONLY delivery provider implementation in this codebase and it NEVER makes a real
 * outbound network call — it resolves synchronously (after a `setImmediate` tick, just to
 * keep the interface honestly asynchronous) with a deterministic simulated outcome.
 *
 * Testability (documented per the Phase 6 task description): the caller passes
 * `options.simulateOutcome` to force a specific outcome for a test or demo. When omitted
 * (the default, "production-shaped" call), this mock defaults to `ACKNOWLEDGED` — i.e. a
 * normal successful simulated delivery — so the system is usable end-to-end without any
 * special test flag. A deterministic hash-based "random" default was considered and
 * rejected: a fixed default keeps live/manual smoke testing predictable, and every e2e test
 * that needs a different outcome sets `simulateOutcome` explicitly rather than relying on
 * chance.
 */
@Injectable()
export class MockLeadDeliveryProvider implements LeadDeliveryProvider {
  private readonly logger = new Logger('mock-lead-delivery-adapter');

  async deliver(
    payload: DeliveryPayloadV1,
    options: LeadDeliveryOptions,
  ): Promise<LeadDeliveryResult> {
    // Keep the interface honestly asynchronous without ever touching the network or a real
    // timer-based delay (CLAUDE.md §3, docs/11 Gate 6).
    await new Promise<void>((resolve) => setImmediate(resolve));

    const providerCorrelationId = randomUUID();
    const outcome = options.simulateOutcome ?? DeliveryProviderOutcome.Acknowledged;

    this.logger.debug(
      `[MOCK — no network call made] lenderId=${payload.lenderId} routingAttemptId=` +
        `${payload.routingAttemptId} contact=${redactContact(payload.contact)} outcome=${outcome} ` +
        `providerCorrelationId=${providerCorrelationId}`,
    );

    switch (outcome) {
      case DeliveryProviderOutcome.Acknowledged:
        return { outcome, providerCorrelationId, retryable: false };
      case DeliveryProviderOutcome.Rejected:
        return {
          outcome,
          providerCorrelationId,
          rejectionReason: DeliveryRejectionReason.OutsideTerritory,
          retryable: false,
        };
      case DeliveryProviderOutcome.Timeout:
        // Ambiguous — never retryable from here; DeliveryService must land this in
        // RECONCILIATION_PENDING rather than retrying blindly (docs/08 §5-6).
        return { outcome, providerCorrelationId, retryable: false };
      case DeliveryProviderOutcome.TransientError:
        // The only retryable category (docs/08 §5-6).
        return { outcome, providerCorrelationId, retryable: true };
      default:
        return { outcome, providerCorrelationId, retryable: false };
    }
  }
}
