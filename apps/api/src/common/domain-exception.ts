import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, type ErrorCode as ErrorCodeType } from '@tech-realty-rentals/shared';

/**
 * The only way application code should signal a domain-specific error that needs its own
 * `code`/`message` (e.g. invalid credentials, expired token) beyond the generic HTTP-status
 * mapping in ApiExceptionFilter. The filter recognizes this type explicitly (rather than
 * trusting any HttpException's response body) and extends its own fixed code/message/status
 * tables from it, so clients never see ad hoc JSON shapes or leaked internals.
 */
export class DomainException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCodeType,
    status: HttpStatus,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super({ code: errorCode }, status);
  }
}

/** Safe, fixed message for each domain error code. Never derived from user input. */
export const DOMAIN_ERROR_MESSAGES: Record<string, string> = {
  [ErrorCode.InvalidCredentials]: 'The email or password is incorrect.',
  [ErrorCode.EmailAlreadyRegistered]: 'An account with this email already exists.',
  [ErrorCode.EmailNotVerified]: 'Please verify your email address before signing in.',
  [ErrorCode.AccountDisabled]: 'This account is disabled.',
  [ErrorCode.TokenInvalid]: 'This link or token is invalid.',
  [ErrorCode.TokenExpired]: 'This link or token has expired.',
  [ErrorCode.ValidationFailed]: 'The request failed validation.',
  [ErrorCode.OrganizationContextRequired]:
    'An active organization context is required for this request.',
  [ErrorCode.CsrfTokenInvalid]: 'The request could not be verified. Please try again.',
  [ErrorCode.OriginNotAllowed]: 'This request origin is not permitted for this widget.',
  [ErrorCode.ConsentRequired]: 'The requested action requires its own matching consent selection.',
  [ErrorCode.WidgetNotActive]: 'This widget is not currently accepting submissions.',
  [ErrorCode.IdempotencyConflict]:
    'This idempotency key was already used with a different request.',
  // Phase 6 — exclusive lender delivery, mock routing/delivery adapter, simulated billing.
  [ErrorCode.LeadNotInExpectedStatus]: 'This lead is not in the expected status for this action.',
  [ErrorCode.QualificationFailed]: 'This lead did not pass qualification.',
  [ErrorCode.NoEligibleRoutingPolicy]: 'No eligible routing policy matched this lead.',
  [ErrorCode.ConsentNotGranted]: 'The required consent is missing or has been revoked.',
  [ErrorCode.LenderNotApproved]: "The matched lender's contract is not approved.",
  [ErrorCode.DeliveryNotReconcilable]: 'This delivery is not awaiting reconciliation.',
};
