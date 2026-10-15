import { z } from 'zod';
import { calculatorTypeSchema } from './widgets';
import { publicKeySchema } from './widgets';

/**
 * Phase 5 — consent, lead capture and lead CRM (docs/07, docs/08, docs/03 §2, docs/04 §3).
 * Kept Prisma-free like the rest of this package; the API layer maps between these shapes
 * and the Prisma `Lead`/`ConsentRecord`/`DisclosureVersion`/... rows
 * (apps/api/prisma/schema.prisma).
 *
 * LEGAL NOTICE (CLAUDE.md §4, docs/07 §1): nothing in this file is legal advice. All
 * disclosure/consent copy here is a SYNTHETIC PLACEHOLDER requiring qualified US counsel
 * review before any production use. Credit pulls, income verification and SSN/bank-
 * credential/full-credit-report collection remain permanently out of scope and nothing here
 * defines a field for any of them.
 */

// ---------------------------------------------------------------------------
// Purpose / channel / requested-action enums (docs/07 §2-3, docs/03 §2).
// ---------------------------------------------------------------------------

export const ConsentPurpose = {
  SaveResults: 'SAVE_RESULTS',
  RateAlerts: 'RATE_ALERTS',
  LenderContact: 'LENDER_CONTACT',
} as const;
export type ConsentPurpose = (typeof ConsentPurpose)[keyof typeof ConsentPurpose];
export const consentPurposeSchema = z.enum([
  ConsentPurpose.SaveResults,
  ConsentPurpose.RateAlerts,
  ConsentPurpose.LenderContact,
]);

export const ConsentChannel = {
  /** Not an outbound communication channel — covers "save this scenario to my account". */
  Account: 'ACCOUNT',
  Email: 'EMAIL',
  Phone: 'PHONE',
} as const;
export type ConsentChannel = (typeof ConsentChannel)[keyof typeof ConsentChannel];
export const consentChannelSchema = z.enum([
  ConsentChannel.Account,
  ConsentChannel.Email,
  ConsentChannel.Phone,
]);

/**
 * `RequestedAction` (docs/04 §3) deliberately shares its three values with `ConsentPurpose`
 * one-for-one — the requested action names the lead's primary purpose, and that exact
 * purpose must always appear in `consentSelections` (see `requiredPurposeForAction` below).
 * Kept as a separate named type/schema anyway (not a type alias) so request bodies stay
 * self-documenting and so the two could diverge later without a breaking rename.
 */
/**
 * Buyer status (docs/08 §4 "buyer status" is an approved, non-sensitive routing criterion —
 * a mortgage product/program category, not a protected trait). Defined here (not in
 * delivery.ts) because it is captured as part of `purchaseIntent` at lead-capture time;
 * `delivery.ts`'s `RoutingEligibilityConditions` imports it from here to avoid a circular
 * module dependency.
 */
export const BuyerStatus = {
  FirstTimeBuyer: 'FIRST_TIME_BUYER',
  RepeatBuyer: 'REPEAT_BUYER',
  Investor: 'INVESTOR',
  Unspecified: 'UNSPECIFIED',
} as const;
export type BuyerStatus = (typeof BuyerStatus)[keyof typeof BuyerStatus];
export const buyerStatusSchema = z.enum([
  BuyerStatus.FirstTimeBuyer,
  BuyerStatus.RepeatBuyer,
  BuyerStatus.Investor,
  BuyerStatus.Unspecified,
]);

export const RequestedAction = {
  SaveResults: 'SAVE_RESULTS',
  RateAlerts: 'RATE_ALERTS',
  LenderContact: 'LENDER_CONTACT',
} as const;
export type RequestedAction = (typeof RequestedAction)[keyof typeof RequestedAction];
export const requestedActionSchema = z.enum([
  RequestedAction.SaveResults,
  RequestedAction.RateAlerts,
  RequestedAction.LenderContact,
]);

/** The exact purpose that must be present (and actually granted) in `consentSelections` for
 * a given `requestedAction` — fail-closed source of truth used by both the API's validation
 * step and this file's own tests (docs/07 §5, docs/08 §2). */
export const REQUIRED_PURPOSE_FOR_ACTION: Record<RequestedAction, ConsentPurpose> = {
  [RequestedAction.SaveResults]: ConsentPurpose.SaveResults,
  [RequestedAction.RateAlerts]: ConsentPurpose.RateAlerts,
  [RequestedAction.LenderContact]: ConsentPurpose.LenderContact,
};

export function requiredPurposeForAction(action: RequestedAction): ConsentPurpose {
  return REQUIRED_PURPOSE_FOR_ACTION[action];
}

/**
 * Resolves the communication channel a given purpose's consent applies to. `SAVE_RESULTS`
 * and `RATE_ALERTS` always resolve to a fixed channel (saving is not a comms channel at all;
 * alerts are email-only in the MVP — SMS/calling remain disabled per docs/07 §2). It is only
 * `LENDER_CONTACT` whose channel genuinely depends on what contact info the user actually
 * supplied (a documented judgment call — see the Phase 5 final report): phone is preferred
 * when provided, since "request contact" most naturally implies a phone call/text-eligible
 * channel, falling back to email when no phone was given.
 */
export function resolveChannelForPurpose(
  purpose: ConsentPurpose,
  contact: { email?: string; phone?: string },
): ConsentChannel {
  if (purpose === ConsentPurpose.SaveResults) return ConsentChannel.Account;
  if (purpose === ConsentPurpose.RateAlerts) return ConsentChannel.Email;
  return contact.phone ? ConsentChannel.Phone : ConsentChannel.Email;
}

// ---------------------------------------------------------------------------
// Lead lifecycle (docs/08 §1). The full MVP-documented status set is modeled so the schema
// does not need to change again in Phase 6 — but Phase 5's domain service only allows the
// transitions reachable without routing/delivery/qualification infrastructure. See
// `assertLeadTransitionAllowed` below.
// ---------------------------------------------------------------------------

export const LeadStatus = {
  New: 'NEW',
  NeedsReview: 'NEEDS_REVIEW',
  Eligible: 'ELIGIBLE',
  Routing: 'ROUTING',
  Delivered: 'DELIVERED',
  Accepted: 'ACCEPTED',
  Rejected: 'REJECTED',
  Suppressed: 'SUPPRESSED',
  Closed: 'CLOSED',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];
export const leadStatusSchema = z.enum([
  LeadStatus.New,
  LeadStatus.NeedsReview,
  LeadStatus.Eligible,
  LeadStatus.Routing,
  LeadStatus.Delivered,
  LeadStatus.Accepted,
  LeadStatus.Rejected,
  LeadStatus.Suppressed,
  LeadStatus.Closed,
]);

/**
 * Phase 6 (docs/08 §1, docs/11 §7) extends the matrix with the routing/delivery/qualification
 * transitions Phase 5 explicitly left unreachable. Every transition below and its actor:
 *
 * - `NEW -> ELIGIBLE`, `NEEDS_REVIEW -> ELIGIBLE`: `QualificationService`, once qualification
 *   passes (syntactic validation + optional mock contact verification — docs/08 §3).
 * - `ELIGIBLE -> ROUTING`: `RoutingService`, the instant a matching active `RoutingPolicy`,
 *   an approved lender and a currently-granted `LENDER_CONTACT` consent are all confirmed and
 *   the `RoutingAttempt` row has been persisted — BEFORE the delivery adapter is invoked
 *   (docs/08 §4). A routing attempt that fails before reaching that point (no eligible
 *   policy, consent denied, lender not approved) leaves the lead in `ELIGIBLE`, unchanged —
 *   there is deliberately no `ELIGIBLE -> NEEDS_REVIEW` auto-transition on routing failure, so
 *   a later retry (e.g. after consent is (re-)granted or a policy is added) remains possible
 *   without an operator having to move the lead back out of `NEEDS_REVIEW` by hand.
 * - `ROUTING -> DELIVERED`: `DeliveryService`, when the mock delivery adapter acknowledges.
 * - `ROUTING -> REJECTED`: `DeliveryService`, on a definitive adapter rejection, OR on
 *   reconciliation of an ambiguous timeout that resolves to "not delivered" (docs/08 §5-6).
 * - `DELIVERED -> ACCEPTED`: the lender's own `POST /lender/deliveries/:id/acknowledge`
 *   action (docs/04 §2, docs/10 §4) — a second, lender-driven confirmation layer on top of
 *   the adapter's own delivery acknowledgment; idempotent (acknowledging twice does not
 *   re-transition or error).
 * - `NEW/NEEDS_REVIEW/ELIGIBLE/ROUTING/DELIVERED -> CLOSED`: an operator/compliance closeout
 *   path, reusing the same terminal `CLOSED` status Phase 5 already allowed from `NEW`/
 *   `NEEDS_REVIEW` (docs/08 §1 "also CLOSED from more states now").
 *
 * `ACCEPTED`, `REJECTED`, `SUPPRESSED` and `CLOSED` remain terminal — no outbound transitions
 * from any of them, same as Phase 5.
 */
const ALLOWED_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  [LeadStatus.New]: [
    LeadStatus.NeedsReview,
    LeadStatus.Eligible,
    LeadStatus.Suppressed,
    LeadStatus.Closed,
  ],
  [LeadStatus.NeedsReview]: [LeadStatus.Eligible, LeadStatus.Closed],
  [LeadStatus.Eligible]: [LeadStatus.Routing, LeadStatus.Closed],
  [LeadStatus.Routing]: [LeadStatus.Delivered, LeadStatus.Rejected, LeadStatus.Closed],
  [LeadStatus.Delivered]: [LeadStatus.Accepted, LeadStatus.Closed],
  [LeadStatus.Accepted]: [],
  [LeadStatus.Rejected]: [],
  [LeadStatus.Suppressed]: [],
  [LeadStatus.Closed]: [],
};

export class LeadTransitionError extends Error {}

/** Throws `LeadTransitionError` for any transition the domain matrix above does not list.
 * Called by the API's `LeadLifecycleService` before every status write — never an ad hoc
 * status assignment (docs/03 §3 "Status transitions are validated in domain services"). */
export function assertLeadTransitionAllowed(from: LeadStatus, to: LeadStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new LeadTransitionError(`Transition from "${from}" to "${to}" is not permitted.`);
  }
}

export function isValidLeadTransition(from: LeadStatus, to: LeadStatus): boolean {
  try {
    assertLeadTransitionAllowed(from, to);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Contact normalization, masking and HMAC match tokens (docs/03 §5, docs/08 §2).
// ---------------------------------------------------------------------------

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Best-effort phone normalization to a `+`-prefixed digit string (documented simplification
 * for the MVP, not full E.164/libphonenumber validation — docs/03 §5 "normalize carefully"):
 * a bare 10-digit number is assumed US/Canada and gets a `+1` prefix; an 11-digit number
 * already starting with `1` just gets the `+`; anything else is passed through digits-only
 * with a `+` prefix so international numbers are not silently mangled, at the cost of not
 * fully validating them. Full international support is a documented residual item.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

/** Masks an email's local part for low-privilege display (e.g. agent lead lists): the first
 * character is kept, the rest of the local part is replaced by a fixed `***`, and the domain
 * is shown in full — `john@example.com` -> `j***@example.com` (CLAUDE.md §4 "minimize PII in
 * ... responses", docs/06 §6, docs/02 §3). A fixed mask width (not proportional to length) is
 * a deliberate, documented choice: a variable-length mask would itself leak the local part's
 * length. */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '***';
  return `${email[0]}***${email.slice(atIndex)}`;
}

/** Masks a phone number to its last 4 digits (CLAUDE.md §4). Uses a fixed-width mask (not
 * proportional to the remaining digit count) for the same length-leak reason as
 * `maskEmail`. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last = digits.slice(-4);
  return `******${last}`;
}

/** SHA-256 hex digest via the standard Web Crypto API (`globalThis.crypto.subtle`), available
 * natively in Node >=20 (this repo's minimum engine) and in every modern browser — no
 * `node:crypto` import, so this module stays safely importable from `apps/web` too. Used for
 * disclosure content-integrity hashes (docs/07 §3 "immutable content hash"), which need a
 * hash but not a secret key. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

/** Keyed HMAC-SHA256 hex digest, also via Web Crypto — used for lead/suppression match
 * tokens (docs/03 §5 "Use keyed HMAC match tokens for lookup ... rather than plain hashes of
 * low-entropy identifiers"). Keying the hash on a server-only secret (`LEAD_MATCH_HMAC_SECRET`)
 * means the match token cannot be reversed or brute-forced offline from a leaked database
 * alone, unlike a plain `sha256(email)` — email addresses are low-entropy enough that a plain
 * hash is trivially reversible via a precomputed dictionary.
 */
export async function computeLeadMatchToken(
  secret: string,
  normalizedValue: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(normalizedValue),
  );
  return bytesToHex(new Uint8Array(signature));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Request schemas (docs/04 §3).
// ---------------------------------------------------------------------------

const PHONE_INPUT_PATTERN = /^[0-9()+\-.\s]{7,20}$/;

export const emailInputSchema = z
  .string()
  .trim()
  .email('A valid email address is required.')
  .transform(normalizeEmail);

export const phoneInputSchema = z
  .string()
  .trim()
  .regex(PHONE_INPUT_PATTERN, 'Phone number has an invalid format.')
  .transform(normalizePhone);

/** `contact` (docs/04 §3): email and/or phone, at least one required. Neither field alone is
 * sufficient proof of identity — it is only ever used for deduplication/contact, never as an
 * authorization credential. */
export const leadContactSchema = z
  .object({
    email: emailInputSchema.optional(),
    phone: phoneInputSchema.optional(),
  })
  .refine((value) => Boolean(value.email) || Boolean(value.phone), {
    message: 'At least one of email or phone is required.',
  });
export type LeadContact = z.infer<typeof leadContactSchema>;

export const PurchaseTimeline = {
  Within3Months: 'WITHIN_3_MONTHS',
  Within6Months: 'WITHIN_6_MONTHS',
  Within12Months: 'WITHIN_12_MONTHS',
  Exploring: 'EXPLORING',
} as const;
export type PurchaseTimeline = (typeof PurchaseTimeline)[keyof typeof PurchaseTimeline];
export const purchaseTimelineSchema = z.enum([
  PurchaseTimeline.Within3Months,
  PurchaseTimeline.Within6Months,
  PurchaseTimeline.Within12Months,
  PurchaseTimeline.Exploring,
]);

/** `purchaseIntent` (docs/04 §3): optional, non-sensitive, approved fields only — never SSN,
 * income, bank or credit fields (CLAUDE.md §4, permanently out of scope). */
export const purchaseIntentSchema = z
  .object({
    timeline: purchaseTimelineSchema.optional(),
    state: z
      .string()
      .trim()
      .length(2)
      .transform((v) => v.toUpperCase())
      .optional(),
    zip: z
      .string()
      .trim()
      .regex(/^\d{5}$/, 'zip must be 5 digits.')
      .optional(),
    priceRangeMin: z.number().int().min(0).max(100_000_000).optional(),
    priceRangeMax: z.number().int().min(0).max(100_000_000).optional(),
    /** Phase 6 addition (docs/08 §4 "buyer status" as an approved routing criterion) — added
     * here, additively, so `RoutingPolicy` eligibility conditions have a real lead attribute
     * to match against. Optional; `UNSPECIFIED` is the default a routing policy sees when a
     * buyer declines to say (resolved server-side, never left undefined downstream — see
     * leads.service.ts). */
    buyerStatus: buyerStatusSchema.optional(),
  })
  .refine(
    (v) =>
      v.priceRangeMin === undefined ||
      v.priceRangeMax === undefined ||
      v.priceRangeMin <= v.priceRangeMax,
    { message: 'priceRangeMin must be less than or equal to priceRangeMax.' },
  );
export type PurchaseIntent = z.infer<typeof purchaseIntentSchema>;

const calculatorSummaryValueSchema = z.union([z.string().max(100), z.number(), z.boolean()]);

/** `calculatorContext` (docs/04 §3): "a minimal result/assumption summary, not the entire
 * clickstream" — bounded to at most 8 short fields so a caller cannot smuggle an entire raw
 * form state through this field. */
export const calculatorContextSchema = z
  .object({
    calculatorType: calculatorTypeSchema,
    summary: z.record(z.string().max(40), calculatorSummaryValueSchema).optional(),
  })
  .refine((v) => !v.summary || Object.keys(v.summary).length <= 8, {
    message: 'summary may contain at most 8 fields.',
  });
export type CalculatorContext = z.infer<typeof calculatorContextSchema>;

export const consentSelectionsSchema = z
  .array(consentPurposeSchema)
  .min(1)
  .max(3)
  .refine((arr) => new Set(arr).size === arr.length, {
    message: 'consentSelections must not contain duplicate purposes.',
  });

/** Client-generated once per form-fill session (e.g. `crypto.randomUUID()`), not per click
 * (docs/04 §1, docs/08 §6). */
export const idempotencyKeySchema = z.string().trim().min(8).max(100);

export const submitLeadRequestSchema = z.object({
  widgetPublicKey: publicKeySchema,
  contact: leadContactSchema,
  purchaseIntent: purchaseIntentSchema.optional(),
  requestedAction: requestedActionSchema,
  consentSelections: consentSelectionsSchema,
  calculatorContext: calculatorContextSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});
export type SubmitLeadRequest = z.infer<typeof submitLeadRequestSchema>;

/**
 * Neutral success response (docs/08 §2 "a neutral success response that avoids exposing
 * whether another person's record exists"). Deliberately carries no `leadId` and no
 * per-purpose outcome — identical whether the lead was newly created, matched an existing
 * one, or had a purpose silently skipped due to suppression. Idempotent replays of the same
 * key+payload return this exact same shape again.
 */
export const submitLeadResponseSchema = z.object({ received: z.literal(true) });
export type SubmitLeadResponse = z.infer<typeof submitLeadResponseSchema>;

// ---------------------------------------------------------------------------
// Disclosure versions (docs/07 §3-4). Synthetic placeholder content only — see the big
// legal notice at the top of this file and the Phase 5 final report.
// ---------------------------------------------------------------------------

export const DISCLOSURE_LOCALE = 'en-US';
export const DISCLOSURE_VERSION = 1;

/**
 * SYNTHETIC PLACEHOLDER disclosure copy — NOT legal advice, NOT reviewed or approved by
 * counsel (CLAUDE.md §4 "Do not provide legal advice in product copy"; docs/07 §1). This is
 * the single source of truth for each purpose's disclosure text: the Phase 5 seed script
 * writes these exact strings into `DisclosureVersion` rows (the database copy the API
 * actually serves/records), and the lead-capture UI imports this same constant to display
 * matching text without a network round trip. Sharing one constant avoids UI/DB copy drift;
 * it is NOT a trust boundary — the server always re-resolves and persists its own
 * `DisclosureVersion` row (and that row's immutable content hash) at submission time,
 * regardless of what the client happened to render.
 */
export const SYNTHETIC_DISCLOSURE_TEXT: Record<ConsentPurpose, string> = {
  [ConsentPurpose.SaveResults]:
    '[SYNTHETIC PLACEHOLDER — not legal advice, pending qualified US counsel review] ' +
    'By checking this box, you ask Tech Realty Rentals to save this calculator scenario to a record ' +
    'associated with your contact information so you can return to it later. Tech Realty Rentals is not ' +
    'a lender and this is not a loan application, pre-qualification, or approval.',
  [ConsentPurpose.RateAlerts]:
    '[SYNTHETIC PLACEHOLDER — not legal advice, pending qualified US counsel review] ' +
    'By checking this box, you ask Tech Realty Rentals to send you occasional email alerts about ' +
    'estimated mortgage rates or market information. You did not agree to any other use of ' +
    'your contact information, and this is not a loan offer or commitment to lend.',
  [ConsentPurpose.LenderContact]:
    '[SYNTHETIC PLACEHOLDER — not legal advice, pending qualified US counsel review] ' +
    'By checking this box, you ask Tech Realty Rentals to share the contact information and calculator ' +
    'summary you provide here with a mortgage professional in its network so that ' +
    'professional may contact you about your request. Tech Realty Rentals is not a lender, does not ' +
    'guarantee any specific lender will contact you, and this is not pre-qualification, ' +
    'pre-approval, or a commitment to lend.',
};

// ---------------------------------------------------------------------------
// Agent-authenticated lead visibility (`GET /api/v1/agent/leads`, docs/04 §2, docs/06 §6).
// PII-minimized by default — see `maskEmail`/`maskPhone` above.
// ---------------------------------------------------------------------------

export const agentLeadSummarySchema = z.object({
  id: z.string().uuid(),
  status: leadStatusSchema,
  maskedEmail: z.string().nullable(),
  maskedPhone: z.string().nullable(),
  /** Purposes with at least one currently-active (non-revoked) consent record — never the
   * raw evidence metadata. */
  activePurposes: z.array(consentPurposeSchema),
  purchaseIntentTimeline: purchaseTimelineSchema.nullable(),
  purchaseIntentState: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentLeadSummary = z.infer<typeof agentLeadSummarySchema>;
