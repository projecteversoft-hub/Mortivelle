/**
 * Adapter contract for sending auth-related email (docs/04 §5: provider adapters must be
 * typed, swappable, and mockable). Domain services depend only on this interface, never on
 * a concrete provider, so a real provider (e.g. SES/Postmark) can be substituted later
 * without touching AuthService/EmailVerificationService/PasswordResetService.
 */
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface SendVerificationEmailInput {
  toEmail: string;
  verificationToken: string;
}

export interface SendPasswordResetEmailInput {
  toEmail: string;
  resetToken: string;
}

export interface EmailProvider {
  sendVerificationEmail(input: SendVerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void>;
}
