import { z } from 'zod';
import { BuyerStatus, buyerStatusSchema, purchaseTimelineSchema } from './leads';

export { BuyerStatus, buyerStatusSchema };

/**
 * Phase 6 — exclusive lender delivery, mock routing/delivery adapter and simulated billing
 * ledger (docs/08, docs/03 §2 "Qualification and marketplace", docs/04 §2/§5, docs/11 §7).
 * Kept Prisma-free like the rest of this package; the API layer maps between these shapes and
 * the Prisma `QualificationRecord`/`Lender`/`RoutingPolicy`/`RoutingAttempt`/`LeadDelivery`/
 * `BillingEntry` rows (apps/api/prisma/schema.prisma).
 *
 * CRITICAL, repeated from CLAUDE.md and docs/11 Gate 6: real lender delivery and real payment
 * processing remain disabled unless separately authorized. Everything here models a 100%
 * MOCK/SIMULATED delivery and billing system — `LenderIntegrationMode` below deliberately has
 * only one member (`MOCK`) so a "real" integration can never even be selected.
 */

// ---------------------------------------------------------------------------
// Qualification (docs/03 §2, docs/08 §3). MVP: syntactic validation plus an OPTIONAL mock
// email/phone verification step. No credit bureau or income verification — permanently out
// of scope (CLAUDE.md §4).
// ---------------------------------------------------------------------------

export const QualificationType = {
  ContactFormat: 'CONTACT_FORMAT',
  EmailVerification: 'EMAIL_VERIFICATION',
  PhoneVerification: 'PHONE_VERIFICATION',
} as const;
export type QualificationType = (typeof QualificationType)[keyof typeof QualificationType];
export const qualificationTypeSchema = z.enum([
  QualificationType.ContactFormat,
  QualificationType.EmailVerification,
  QualificationType.PhoneVerification,
]);

export const QualificationStatus = {
  Pending: 'PENDING',
  Passed: 'PASSED',
  Failed: 'FAILED',
} as const;
export type QualificationStatus = (typeof QualificationStatus)[keyof typeof QualificationStatus];
export const qualificationStatusSchema = z.enum([
  QualificationStatus.Pending,
  QualificationStatus.Passed,
  QualificationStatus.Failed,
]);

/** Provenance tag identifying which (mock) check produced a `QualificationRecord` — never a
 * real credit/income provider name (CLAUDE.md §4, docs/08 §3). */
export const QualificationProvider = {
  SyntacticValidator: 'SYNTACTIC_VALIDATOR',
  MockEmailVerification: 'MOCK_EMAIL_VERIFICATION',
  MockPhoneVerification: 'MOCK_PHONE_VERIFICATION',
} as const;
export type QualificationProvider =
  (typeof QualificationProvider)[keyof typeof QualificationProvider];

// ---------------------------------------------------------------------------
// Lender and routing policy (docs/03 §2, docs/08 §4). No public authoring API in Phase 6 —
// same documented-seed approach Phase 5 used for `DisclosureVersion` (see
// apps/api/src/delivery/lender-catalog-seed.service.ts). `LenderIntegrationMode` has exactly
// one member on purpose: a "real" mode can never be selected, by construction.
// ---------------------------------------------------------------------------

export const LenderIntegrationMode = { Mock: 'MOCK' } as const;
export type LenderIntegrationMode =
  (typeof LenderIntegrationMode)[keyof typeof LenderIntegrationMode];
export const lenderIntegrationModeSchema = z.enum([LenderIntegrationMode.Mock]);

export const LenderStatus = { Active: 'ACTIVE', Suspended: 'SUSPENDED' } as const;
export type LenderStatus = (typeof LenderStatus)[keyof typeof LenderStatus];
export const lenderStatusSchema = z.enum([LenderStatus.Active, LenderStatus.Suspended]);

export const RoutingStrategy = { Exclusive: 'EXCLUSIVE' } as const;
export type RoutingStrategy = (typeof RoutingStrategy)[keyof typeof RoutingStrategy];
export const routingStrategySchema = z.enum([RoutingStrategy.Exclusive]);

export const RoutingPolicyStatus = { Active: 'ACTIVE', INACTIVE: 'INACTIVE' } as const;

const STATE_CODE_PATTERN = /^[A-Z]{2}$/;

/**
 * Non-sensitive routing eligibility conditions (docs/08 §4 "Match only on approved,
 * non-sensitive criteria such as licensed/contracted territory, product availability and
 * buyer status. Do not infer or use protected traits."). `.strict()` rejects any unknown key
 * outright — this is the enforcement point that makes it structurally impossible to encode a
 * protected trait into a routing policy, since only these three named, non-sensitive fields
 * can ever be present.
 */
export const routingEligibilityConditionsSchema = z
  .object({
    /** Licensed/contracted territory — required and non-empty; a policy with no territory
     * can never match anything (fail-closed by construction, not by a special case). */
    territoryStates: z.array(z.string().regex(STATE_CODE_PATTERN)).min(1).max(50),
    minPrice: z.number().int().min(0).optional(),
    maxPrice: z.number().int().min(0).optional(),
    /** Omitted or empty = any buyer status matches. */
    buyerStatuses: z.array(buyerStatusSchema).min(1).max(4).optional(),
  })
  .strict()
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, {
    message: 'minPrice must be less than or equal to maxPrice.',
  });
export type RoutingEligibilityConditions = z.infer<typeof routingEligibilityConditionsSchema>;

/** The lead-side non-sensitive attributes a routing policy is matched against — exactly the
 * same approved categories as `RoutingEligibilityConditions` (territory/price/buyer status),
 * nothing else. */
export interface RoutingLeadAttributes {
  state: string | null;
  priceMin: number | null;
  priceMax: number | null;
  buyerStatus: BuyerStatus | null;
}

/**
 * Pure routing-match function (docs/11 §7 "eligibility/routing-match criteria evaluation ...
 * test this as a pure function"). Fail-closed on missing data: if a policy constrains price
 * but the lead supplied no price information at all, that policy does NOT match (never
 * assumed to pass). Price is checked as a range overlap between
 * `[lead.priceMin, lead.priceMax]` and `[criteria.minPrice, criteria.maxPrice]` (open bounds
 * default to -Infinity/+Infinity), so a lead with only one bound supplied still participates.
 */
export function evaluateRoutingEligibility(
  criteria: RoutingEligibilityConditions,
  lead: RoutingLeadAttributes,
): boolean {
  if (!lead.state || !criteria.territoryStates.includes(lead.state)) return false;

  if (criteria.minPrice !== undefined || criteria.maxPrice !== undefined) {
    if (lead.priceMin === null && lead.priceMax === null) return false;
    const leadLow = lead.priceMin ?? lead.priceMax ?? 0;
    const leadHigh = lead.priceMax ?? lead.priceMin ?? Number.MAX_SAFE_INTEGER;
    const policyLow = criteria.minPrice ?? 0;
    const policyHigh = criteria.maxPrice ?? Number.MAX_SAFE_INTEGER;
    if (leadHigh < policyLow || leadLow > policyHigh) return false;
  }

  if (criteria.buyerStatuses && criteria.buyerStatuses.length > 0) {
    if (!lead.buyerStatus || !criteria.buyerStatuses.includes(lead.buyerStatus)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Routing attempt (docs/03 §2, docs/08 §4). Persisted BEFORE any delivery attempt — see
// apps/api/src/delivery/routing.service.ts.
// ---------------------------------------------------------------------------

export const RoutingAttemptStatus = {
  /** Created, matched to a lender/policy, about to invoke the delivery adapter. */
  Pending: 'PENDING',
  /** Routing succeeded in reaching a recipient attempt; the delivery adapter was invoked
   * (its own outcome is tracked separately on `LeadDelivery`). */
  Dispatched: 'DISPATCHED',
  /** Routing itself never reached a recipient — see `failureReason`. */
  Failed: 'FAILED',
} as const;
export type RoutingAttemptStatus = (typeof RoutingAttemptStatus)[keyof typeof RoutingAttemptStatus];

export const RoutingFailureReason = {
  NoEligiblePolicy: 'NO_ELIGIBLE_POLICY',
  ConsentNotGranted: 'CONSENT_NOT_GRANTED',
  LenderNotApproved: 'LENDER_NOT_APPROVED',
} as const;
export type RoutingFailureReason = (typeof RoutingFailureReason)[keyof typeof RoutingFailureReason];

// ---------------------------------------------------------------------------
// Delivery adapter contract (docs/04 §5, docs/08 §5-6). Typed payload+version, timeout, error
// categories (retryable vs. not), idempotency, redacted logs, reconciliation for ambiguous
// timeouts. MVP uses a mock provider only — see
// apps/api/src/delivery/providers/mock-lead-delivery.provider.ts.
// ---------------------------------------------------------------------------

export const DELIVERY_PAYLOAD_SCHEMA_VERSION = 1;

/** The data that would be transmitted to a lender's intake system. Carries real (not masked)
 * contact fields, because this literally IS the delivery payload the lead's `LENDER_CONTACT`
 * consent authorized sending to this one recipient — masking happens only in logs/audit
 * metadata and in list-view API responses, never in the payload itself (docs/07 §2-3). */
export const deliveryPayloadV1Schema = z.object({
  schemaVersion: z.literal(DELIVERY_PAYLOAD_SCHEMA_VERSION),
  leadId: z.string().uuid(),
  lenderId: z.string().uuid(),
  routingAttemptId: z.string().uuid(),
  contact: z.object({
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  purchaseIntent: z.object({
    timeline: purchaseTimelineSchema.nullable(),
    state: z.string().nullable(),
    zip: z.string().nullable(),
    priceMin: z.number().int().nullable(),
    priceMax: z.number().int().nullable(),
    buyerStatus: buyerStatusSchema.nullable(),
  }),
});
export type DeliveryPayloadV1 = z.infer<typeof deliveryPayloadV1Schema>;

export const DeliveryStatus = {
  Pending: 'PENDING',
  Acknowledged: 'ACKNOWLEDGED',
  Rejected: 'REJECTED',
  /** Distinct, clearly-flagged state for a simulated ambiguous timeout — never auto-retried,
   * never silently treated as success or failure. Only `reconcile()` may move a delivery out
   * of this state (docs/08 §5-6). */
  ReconciliationPending: 'RECONCILIATION_PENDING',
  /** Retries of a retryable (transient) failure were exhausted; dead-letter/manual-review
   * state. */
  Failed: 'FAILED',
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

/** Closed rejection/failure reason-code enum (docs/08 §7) — never free-text, never PII. */
export const DeliveryRejectionReason = {
  InvalidContact: 'INVALID_CONTACT',
  OutsideTerritory: 'OUTSIDE_TERRITORY',
  DuplicateUnderContract: 'DUPLICATE_UNDER_CONTRACT',
  UnsupportedRequest: 'UNSUPPORTED_REQUEST',
  TechnicalFailure: 'TECHNICAL_FAILURE',
} as const;
export type DeliveryRejectionReason =
  (typeof DeliveryRejectionReason)[keyof typeof DeliveryRejectionReason];
export const deliveryRejectionReasonSchema = z.enum([
  DeliveryRejectionReason.InvalidContact,
  DeliveryRejectionReason.OutsideTerritory,
  DeliveryRejectionReason.DuplicateUnderContract,
  DeliveryRejectionReason.UnsupportedRequest,
  DeliveryRejectionReason.TechnicalFailure,
]);

/** The mock provider's raw outcome vocabulary (apps/api/src/delivery/providers/
 * lead-delivery-provider.ts). `TransientError` is the only retryable category; `Timeout` is
 * the ambiguous case that must never be blindly retried (docs/08 §5-6). */
export const DeliveryProviderOutcome = {
  Acknowledged: 'ACKNOWLEDGED',
  Rejected: 'REJECTED',
  Timeout: 'TIMEOUT',
  TransientError: 'TRANSIENT_ERROR',
} as const;
export type DeliveryProviderOutcome =
  (typeof DeliveryProviderOutcome)[keyof typeof DeliveryProviderOutcome];

/** Test-only / controllable simulated outcome hook (docs/08 §5 "deterministically or via a
 * controllable test hook ... never a real network call"). Never persisted as part of the
 * payload whose hash is used for idempotency-conflict detection — it steers the MOCK
 * provider's behavior only, so replaying the same idempotency key+payload with a different
 * `simulateOutcome` is still treated as "the same request" for conflict purposes (the
 * requester, not the simulated network, controls this). */
export const simulateOutcomeSchema = z
  .enum([
    DeliveryProviderOutcome.Acknowledged,
    DeliveryProviderOutcome.Rejected,
    DeliveryProviderOutcome.Timeout,
    DeliveryProviderOutcome.TransientError,
  ])
  .optional();
export type SimulateOutcome = z.infer<typeof simulateOutcomeSchema>;

// ---------------------------------------------------------------------------
// Billing ledger (docs/03 §2, docs/08 §8). Simulated only — no real payment processing.
// ---------------------------------------------------------------------------

export const BillingEventType = { LeadDeliveryFee: 'LEAD_DELIVERY_FEE' } as const;
export type BillingEventType = (typeof BillingEventType)[keyof typeof BillingEventType];

export const BillingEntryStatus = { Posted: 'POSTED' } as const;
export type BillingEntryStatus = (typeof BillingEntryStatus)[keyof typeof BillingEntryStatus];

/** Fixed, synthetic simulated price for the one billable event type in MVP — a documented
 * placeholder, not a real commercial pricing model (CLAUDE.md §3, docs/08 §8). */
export const SIMULATED_LEAD_DELIVERY_FEE_AMOUNT_CENTS = 2500;
export const SIMULATED_LEAD_DELIVERY_FEE_CURRENCY = 'USD';

// ---------------------------------------------------------------------------
// Lender-portal response DTOs (`GET /api/v1/lender/deliveries`,
// `GET /api/v1/lender/deliveries/:id`, `POST /api/v1/lender/deliveries/:id/acknowledge` —
// docs/04 §2, docs/10 §4).
// ---------------------------------------------------------------------------

export const deliveryStatusSchema = z.enum([
  DeliveryStatus.Pending,
  DeliveryStatus.Acknowledged,
  DeliveryStatus.Rejected,
  DeliveryStatus.ReconciliationPending,
  DeliveryStatus.Failed,
]);

/** List view — PII-minimized, same discipline as `agentLeadSummarySchema` (CLAUDE.md §4,
 * docs/02 §3). Full contact detail is only ever returned from the single-delivery detail
 * endpoint, where it is the entire point of the delivery. */
export const lenderDeliverySummarySchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  status: deliveryStatusSchema,
  payloadVersion: z.number().int(),
  maskedEmail: z.string().nullable(),
  maskedPhone: z.string().nullable(),
  attemptedAt: z.string(),
  acknowledgedAt: z.string().nullable(),
  lenderAcknowledgedAt: z.string().nullable(),
  errorCode: deliveryRejectionReasonSchema.nullable(),
  createdAt: z.string(),
});
export type LenderDeliverySummary = z.infer<typeof lenderDeliverySummarySchema>;

export const lenderDeliveryDetailSchema = lenderDeliverySummarySchema
  .omit({ maskedEmail: true, maskedPhone: true })
  .extend({
    contact: z.object({ email: z.string().nullable(), phone: z.string().nullable() }),
    purchaseIntent: z.object({
      timeline: purchaseTimelineSchema.nullable(),
      state: z.string().nullable(),
      zip: z.string().nullable(),
      priceMin: z.number().int().nullable(),
      priceMax: z.number().int().nullable(),
      buyerStatus: buyerStatusSchema.nullable(),
    }),
  });
export type LenderDeliveryDetail = z.infer<typeof lenderDeliveryDetailSchema>;

export const acknowledgeDeliveryResponseSchema = z.object({
  id: z.string().uuid(),
  lenderAcknowledgedAt: z.string(),
});
export type AcknowledgeDeliveryResponse = z.infer<typeof acknowledgeDeliveryResponseSchema>;

export const deliveryIdParamSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// Internal ops endpoints (docs/04 §2 "ops" group, docs/08 §3-6) — PLATFORM_ADMIN-only. Not
// part of the lender-facing surface. Qualification/routing have no public authoring API in
// Phase 6 (docs/11 §7 task list), but something has to be able to trigger them for the
// required lifecycle to be exercisable end to end (automated tests and a live walkthrough) —
// these three endpoints are that minimal, documented trigger surface, in the same spirit as
// docs/04 §2's own `PATCH /api/v1/ops/routing-policies/:id` example.
// ---------------------------------------------------------------------------

export const leadIdParamSchema = z.string().uuid();

export const qualifyLeadResponseSchema = z.object({
  status: qualificationStatusSchema,
  reasons: z.array(z.string()),
});
export type QualifyLeadResponse = z.infer<typeof qualifyLeadResponseSchema>;

export const routeLeadRequestSchema = z.object({ simulateOutcome: simulateOutcomeSchema }).strict();
export type RouteLeadRequest = z.infer<typeof routeLeadRequestSchema>;

export const routeLeadResponseSchema = z.object({
  routingAttemptId: z.string().uuid(),
  status: z.enum(['PENDING', 'DISPATCHED', 'FAILED']),
  failureReason: z
    .enum([
      RoutingFailureReason.NoEligiblePolicy,
      RoutingFailureReason.ConsentNotGranted,
      RoutingFailureReason.LenderNotApproved,
    ])
    .optional(),
  lenderId: z.string().uuid().optional(),
  deliveryId: z.string().uuid().optional(),
  deliveryStatus: deliveryStatusSchema.optional(),
});
export type RouteLeadResponse = z.infer<typeof routeLeadResponseSchema>;

export const reconcileDeliveryRequestSchema = z
  .object({ resolution: z.enum(['ACKNOWLEDGED', 'REJECTED']) })
  .strict();
export type ReconcileDeliveryRequest = z.infer<typeof reconcileDeliveryRequestSchema>;

export const reconcileDeliveryResponseSchema = z.object({
  id: z.string().uuid(),
  status: deliveryStatusSchema,
});
export type ReconcileDeliveryResponse = z.infer<typeof reconcileDeliveryResponseSchema>;
