import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '@tech-realty-rentals/shared';
import { DomainException } from '../common/domain-exception';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { EmailVerificationService } from './email-verification.service';
import { TokenService } from './token.service';

export interface RegisteredUser {
  id: string;
  email: string;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
}

export interface IssuedSession {
  userId: string;
  email: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenId: string;
  refreshTokenExpiresAt: Date;
  csrfToken: string;
}

/** Normalizes the way auth.service/env.ts both expect an email: trim + lower-case. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  async register(email: string, password: string): Promise<RegisteredUser> {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await this.passwords.hash(password);
    try {
      const user = await this.prisma.user.create({
        data: { email: normalizedEmail, passwordHash },
      });
      // Best-effort: a failure here must not roll back the created account; the user can
      // request a fresh verification email later (not yet a separate endpoint in Phase 2 —
      // documented residual gap).
      await this.emailVerification.issue(user.id, user.email);
      return { id: user.id, email: user.email, status: user.status };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainException(ErrorCode.EmailAlreadyRegistered, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async login(email: string, password: string): Promise<IssuedSession> {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Always run a verify (even against a dummy hash) so a nonexistent email takes roughly
    // the same code path/time as a wrong password, rather than short-circuiting instantly.
    const hashToCheck = user?.passwordHash ?? AuthService.DUMMY_HASH;
    const passwordMatches = await this.passwords.verify(password, hashToCheck);

    if (!user || !user.passwordHash || !passwordMatches) {
      throw new DomainException(ErrorCode.InvalidCredentials, HttpStatus.UNAUTHORIZED);
    }
    if (user.status === 'PENDING_VERIFICATION') {
      throw new DomainException(ErrorCode.EmailNotVerified, HttpStatus.FORBIDDEN);
    }
    if (user.status === 'DISABLED') {
      throw new DomainException(ErrorCode.AccountDisabled, HttpStatus.FORBIDDEN);
    }

    return this.issueSession(user.id, user.email, TokenService.newFamilyId());
  }

  /**
   * Rotates a refresh token. Reuse of an already-rotated/revoked token revokes its whole
   * family (every token descended from the same login), since presenting a token we already
   * rotated away from indicates it was stolen/replayed (docs/02 §5, docs/09 §2).
   */
  async refresh(rawRefreshToken: string): Promise<IssuedSession> {
    const tokenHash = TokenService.hashOpaqueToken(rawRefreshToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record) {
      throw new DomainException(ErrorCode.TokenInvalid, HttpStatus.UNAUTHORIZED);
    }

    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new DomainException(ErrorCode.TokenInvalid, HttpStatus.UNAUTHORIZED);
    }

    if (record.expiresAt.getTime() < Date.now()) {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      throw new DomainException(ErrorCode.TokenExpired, HttpStatus.UNAUTHORIZED);
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new DomainException(ErrorCode.TokenInvalid, HttpStatus.UNAUTHORIZED);
    }

    const session = await this.issueSession(user.id, user.email, record.familyId);
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedById: session.refreshTokenId },
    });
    return session;
  }

  /** Idempotent: revoking an already-revoked/unknown token is not an error. */
  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = TokenService.hashOpaqueToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyEmail(rawToken: string): Promise<void> {
    await this.emailVerification.consume(rawToken);
  }

  private async issueSession(
    userId: string,
    email: string,
    familyId: string,
  ): Promise<IssuedSession> {
    const access = this.tokens.signAccessToken(userId);
    const refresh = this.tokens.issueRefreshToken();
    const created = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refresh.tokenHash,
        familyId,
        expiresAt: refresh.expiresAt,
      },
    });
    return {
      userId,
      email,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshTokenId: created.id,
      refreshTokenExpiresAt: refresh.expiresAt,
      csrfToken: this.tokens.generateCsrfToken(),
    };
  }

  // A syntactically valid Argon2id "encoded" hash that no real password will ever match,
  // used only to keep login's timing shape similar when the email does not exist.
  private static readonly DUMMY_HASH =
    '$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$0GF5aoRUyV648U69ea5nQiW/FJ4UeIo7x5raNxNJDko';
}
