import { z } from 'zod';

/** Consistent API error shape (docs/04 §1). Never carries stack traces or provider payloads. */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.array(z.string())).optional(),
  requestId: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const ErrorCode = {
  BadRequest: 'BAD_REQUEST',
  ValidationFailed: 'VALIDATION_FAILED',
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  RateLimited: 'RATE_LIMITED',
  PayloadTooLarge: 'PAYLOAD_TOO_LARGE',
  ServiceUnavailable: 'SERVICE_UNAVAILABLE',
  Internal: 'INTERNAL_ERROR',
  // Phase 2 — auth/tenancy domain error codes (docs/02, docs/04 §1).
  InvalidCredentials: 'INVALID_CREDENTIALS',
  EmailAlreadyRegistered: 'EMAIL_ALREADY_REGISTERED',
  EmailNotVerified: 'EMAIL_NOT_VERIFIED',
  AccountDisabled: 'ACCOUNT_DISABLED',
  TokenInvalid: 'TOKEN_INVALID',
  TokenExpired: 'TOKEN_EXPIRED',
  OrganizationContextRequired: 'ORGANIZATION_CONTEXT_REQUIRED',
  CsrfTokenInvalid: 'CSRF_TOKEN_INVALID',
  // Phase 4 — agent widgets and public attribution (docs/06).
  OriginNotAllowed: 'ORIGIN_NOT_ALLOWED',
  // Phase 5 — consent, lead capture and lead CRM (docs/07, docs/08).
  ConsentRequired: 'CONSENT_REQUIRED',
  WidgetNotActive: 'WIDGET_NOT_ACTIVE',
  IdempotencyConflict: 'IDEMPOTENCY_CONFLICT',
  // Phase 6 — exclusive lender delivery, mock routing/delivery adapter, simulated billing
  // (docs/08, docs/11 §7).
  LeadNotInExpectedStatus: 'LEAD_NOT_IN_EXPECTED_STATUS',
  QualificationFailed: 'QUALIFICATION_FAILED',
  NoEligibleRoutingPolicy: 'NO_ELIGIBLE_ROUTING_POLICY',
  ConsentNotGranted: 'CONSENT_NOT_GRANTED',
  LenderNotApproved: 'LENDER_NOT_APPROVED',
  DeliveryNotReconcilable: 'DELIVERY_NOT_RECONCILABLE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
