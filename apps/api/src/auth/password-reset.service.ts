import { randomBytes, createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@tech-realty-rentals/shared';
import { DomainException } from '../common/domain-exception';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { EMAIL_PROVIDER, type EmailProvider } from './providers/email-provider';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — shorter than email verification, deliberately.

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  /**
   * Enumeration-safe (docs/02 §5): always does the same amount of "real" work (a DB lookup,
   * and — only if a matching active user exists — a token insert) and always returns
   * normally with no indication of which branch ran. Callers must return the exact same
   * response body regardless of the outcome here.
   */
  async requestReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'DISABLED') {
      return;
    }
    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });
    await this.emailProvider.sendPasswordResetEmail({ toEmail: user.email, resetToken: token });
  }

  /** Returns the affected userId. Throws DomainException(TokenInvalid|TokenExpired) otherwise. */
  async resetPassword(rawToken: string, newPassword: string): Promise<string> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.consumedAt) {
      throw new DomainException(ErrorCode.TokenInvalid, HttpStatus.BAD_REQUEST);
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new DomainException(ErrorCode.TokenExpired, HttpStatus.BAD_REQUEST);
    }

    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      // Force logout everywhere: a password reset must invalidate every existing session.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return record.userId;
  }
}
