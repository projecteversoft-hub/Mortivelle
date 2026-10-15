import { z } from 'zod';

/** Normalized (trimmed, lower-cased) before validation so duplicate checks are consistent. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('A valid email address is required.');

/**
 * Minimum length only, deliberately. Composition rules (must contain a digit, etc.) push
 * users toward predictable patterns and are no longer recommended (NIST SP 800-63B); length
 * plus Argon2id hashing and rate limiting is the chosen control. Documented deviation from
 * "composition" style policies some reviewers may expect.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .max(256, 'Password must be at most 256 characters.');

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const registerResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'DISABLED']),
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
});

export const sessionResponseSchema = z.object({
  user: authenticatedUserSchema,
  accessTokenExpiresAt: z.string(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const logoutResponseSchema = z.object({ success: z.literal(true) });
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(16).max(512),
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const verifyEmailResponseSchema = z.object({ success: z.literal(true) });
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

/**
 * Identical regardless of whether the email is registered (docs/02 §5): callers must not be
 * able to distinguish "sent" from "not sent" from the response body.
 */
export const forgotPasswordResponseSchema = z.object({
  message: z.literal('If an account exists for that email, a reset link has been sent.'),
});
export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(16).max(512),
  newPassword: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const resetPasswordResponseSchema = z.object({ success: z.literal(true) });
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
