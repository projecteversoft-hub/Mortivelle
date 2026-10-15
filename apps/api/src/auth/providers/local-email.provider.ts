import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailProvider,
  SendPasswordResetEmailInput,
  SendVerificationEmailInput,
} from './email-provider';

/** Shows only enough of the address to be useful for local debugging (e.g. "j***@example.com"). */
function redactEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Mock/local EmailProvider (CLAUDE.md §3, §7: adapter-based, mock by default — no real
 * provider is approved yet). It never sends real email; it only logs the verification/reset
 * token at debug level so a developer running the API locally can complete the flow by
 * hand. This is intentionally the *only* place the raw token is ever logged, and it is
 * logged at `debug` (not `log`/`error`), clearly tagged, and with the email redacted. This
 * must be swapped for a real provider before any production use of email verification or
 * password reset (docs/02 §5).
 */
@Injectable()
export class LocalEmailProvider implements EmailProvider {
  private readonly logger = new Logger('mock-email-adapter');

  async sendVerificationEmail({
    toEmail,
    verificationToken,
  }: SendVerificationEmailInput): Promise<void> {
    this.logger.debug(
      `[LOCAL MOCK — no email sent] verification token for ${redactEmail(toEmail)}: ${verificationToken}`,
    );
  }

  async sendPasswordResetEmail({
    toEmail,
    resetToken,
  }: SendPasswordResetEmailInput): Promise<void> {
    this.logger.debug(
      `[LOCAL MOCK — no email sent] password reset token for ${redactEmail(toEmail)}: ${resetToken}`,
    );
  }
}
