import type {
  DeliveryPayloadV1,
  DeliveryProviderOutcome,
  DeliveryRejectionReason,
} from '@tech-realty-rentals/shared';

/**
 * Adapter contract for transmitting a lead to a lender (docs/04 §5, docs/08 §5). Domain
 * services (`DeliveryService`) depend only on this interface, never on a concrete provider —
 * same Symbol-token + interface-in-one-file pattern as
 * apps/api/src/auth/providers/email-provider.ts. A real provider (a contracted lender's real
 * intake API) would implement this same interface, but CLAUDE.md and docs/11 Gate 6 forbid
 * ever wiring one in this phase: `MockLeadDeliveryProvider` is the only implementation that
 * may be bound to this token.
 */
export const LEAD_DELIVERY_PROVIDER = Symbol('LEAD_DELIVERY_PROVIDER');

export interface LeadDeliveryOptions {
  /** Safe error/timeout bound for the attempt (docs/08 §5 "Timeout and safe error
   * categories"). The mock provider never actually blocks this long — it resolves
   * immediately — but the option is threaded through so a real provider's contract would
   * already have a place to plug in a real timeout. */
  timeoutMs: number;
  /** Test-only / controllable simulated-outcome hook (docs/08 §5). Never derived from the
   * payload; absent in normal/production-shaped calls, where the mock provider falls back to
   * its own fixed deterministic default (ACKNOWLEDGED). */
  simulateOutcome?: DeliveryProviderOutcome;
}

export interface LeadDeliveryResult {
  outcome: DeliveryProviderOutcome;
  /** The (mock) provider's own correlation ID for this attempt — safe to log/store, carries
   * no PII. */
  providerCorrelationId: string;
  /** Only present when `outcome` is `REJECTED` (docs/08 §7: a closed reason-code enum, never
   * free text). */
  rejectionReason?: DeliveryRejectionReason;
  /** Whether THIS outcome category may be retried (docs/08 §5-6). Only `TRANSIENT_ERROR` is
   * ever retryable; `TIMEOUT` is deliberately never retryable (ambiguous — goes to
   * reconciliation instead), and `ACKNOWLEDGED`/`REJECTED` are terminal outcomes with nothing
   * to retry. */
  retryable: boolean;
}

export interface LeadDeliveryProvider {
  /**
   * Attempts to deliver one lead payload to one lender. Implementations must never make a
   * real outbound network call in this phase (CLAUDE.md, docs/11 Gate 6) and must never log
   * the raw `payload` — only redacted/safe fields (docs/08 §5 "Redacted logs").
   */
  deliver(payload: DeliveryPayloadV1, options: LeadDeliveryOptions): Promise<LeadDeliveryResult>;
}
