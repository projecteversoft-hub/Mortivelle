import { randomBytes, createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@tech-realty-rentals/shared';
import { DomainException } from '../common/domain-exception';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_PROVIDER, type EmailProvider } from './providers/email-provider';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async issue(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });
    await this.emailProvider.sendVerificationEmail({ toEmail: email, verificationToken: token });
  }

  /** Returns the verified userId. Throws DomainException(TokenInvalid|TokenExpired) otherwise. */
  async consume(rawToken: string): Promise<string> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.consumedAt) {
      throw new DomainException(ErrorCode.TokenInvalid, HttpStatus.BAD_REQUEST);
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new DomainException(ErrorCode.TokenExpired, HttpStatus.BAD_REQUEST);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
      select: { status: true },
    });
    // Only PENDING_VERIFICATION -> ACTIVE. Never reactivates an account an admin disabled.
    const nextStatus = user?.status === 'PENDING_VERIFICATION' ? 'ACTIVE' : user?.status;

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date(), ...(nextStatus ? { status: nextStatus } : {}) },
      }),
    ]);

    return record.userId;
  }
}
