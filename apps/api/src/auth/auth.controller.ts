import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ErrorCode,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
  type ForgotPasswordResponse,
  type LoginRequest,
  type LogoutResponse,
  type RegisterRequest,
  type RegisterResponse,
  type ResetPasswordRequest,
  type SessionResponse,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
} from '@tech-realty-rentals/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CsrfGuard } from '../common/csrf.guard';
import { DomainException } from '../common/domain-exception';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { REFRESH_TOKEN_COOKIE, TokenService } from './token.service';

const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for that email, a reset link has been sent.' as const;

@Controller('auth')
// See rate-limit/rate-limit.module.ts: every named throttler bucket is registered centrally
// and `ThrottlerGuard` checks all of them by default, so this opts out of every bucket that
// is not this module's own 'auth' one (a pre-existing bug fix, not a Phase 4 behavior change).
@SkipThrottle({ calculators: true, 'widget-config': true, analytics: true, leads: true })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Req() req: Request,
  ): Promise<RegisterResponse> {
    const correlationId = req.requestId ?? 'unknown';
    try {
      const user = await this.auth.register(body.email, body.password);
      await this.audit.record({
        actorUserId: user.id,
        action: 'auth.register',
        outcome: 'SUCCESS',
        correlationId,
        resourceType: 'User',
        resourceId: user.id,
      });
      return user;
    } catch (error) {
      await this.audit.record({
        action: 'auth.register',
        outcome: 'FAILURE',
        correlationId,
      });
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const correlationId = req.requestId ?? 'unknown';
    try {
      const session = await this.auth.login(body.email, body.password);
      this.applySessionCookies(res, session);
      await this.audit.record({
        actorUserId: session.userId,
        action: 'auth.login',
        outcome: 'SUCCESS',
        correlationId,
        resourceType: 'User',
        resourceId: session.userId,
      });
      return {
        user: { id: session.userId, email: session.email },
        accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
      };
    } catch (error) {
      await this.audit.record({
        action: 'auth.login',
        outcome: 'FAILURE',
        correlationId,
      });
      throw error;
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const correlationId = req.requestId ?? 'unknown';
    const rawRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    try {
      if (typeof rawRefreshToken !== 'string' || rawRefreshToken.length === 0) {
        throw new DomainException(ErrorCode.TokenInvalid, HttpStatus.UNAUTHORIZED);
      }
      const session = await this.auth.refresh(rawRefreshToken);
      this.applySessionCookies(res, session);
      await this.audit.record({
        actorUserId: session.userId,
        action: 'auth.refresh',
        outcome: 'SUCCESS',
        correlationId,
        resourceType: 'User',
        resourceId: session.userId,
      });
      return {
        user: { id: session.userId, email: session.email },
        accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
      };
    } catch (error) {
      await this.audit.record({ action: 'auth.refresh', outcome: 'FAILURE', correlationId });
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponse> {
    const correlationId = req.requestId ?? 'unknown';
    const rawRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    await this.auth.logout(rawRefreshToken);
    this.tokens.clearAuthCookies(res);
    await this.audit.record({ action: 'auth.logout', outcome: 'SUCCESS', correlationId });
    return { success: true };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailRequestSchema)) body: VerifyEmailRequest,
    @Req() req: Request,
  ): Promise<VerifyEmailResponse> {
    const correlationId = req.requestId ?? 'unknown';
    try {
      await this.auth.verifyEmail(body.token);
      await this.audit.record({
        action: 'auth.verify_email',
        outcome: 'SUCCESS',
        correlationId,
      });
      return { success: true };
    } catch (error) {
      await this.audit.record({
        action: 'auth.verify_email',
        outcome: 'FAILURE',
        correlationId,
      });
      throw error;
    }
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: { email: string },
    @Req() req: Request,
  ): Promise<ForgotPasswordResponse> {
    const correlationId = req.requestId ?? 'unknown';
    // Enumeration-safe: identical response and audit action regardless of outcome. The
    // outcome recorded is always SUCCESS here because "we processed the request" succeeded
    // either way; whether an email existed is never surfaced, including in the audit log.
    await this.passwordReset.requestReset(body.email);
    await this.audit.record({
      action: 'auth.password_reset.requested',
      outcome: 'SUCCESS',
      correlationId,
    });
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    const correlationId = req.requestId ?? 'unknown';
    try {
      const userId = await this.passwordReset.resetPassword(body.token, body.newPassword);
      await this.audit.record({
        actorUserId: userId,
        action: 'auth.password_reset.completed',
        outcome: 'SUCCESS',
        correlationId,
        resourceType: 'User',
        resourceId: userId,
      });
      return { success: true };
    } catch (error) {
      await this.audit.record({
        action: 'auth.password_reset.completed',
        outcome: 'FAILURE',
        correlationId,
      });
      throw error;
    }
  }

  private applySessionCookies(
    res: Response,
    session: {
      accessToken: string;
      accessTokenExpiresAt: Date;
      refreshToken: string;
      refreshTokenExpiresAt: Date;
      csrfToken: string;
    },
  ): void {
    this.tokens.setAccessTokenCookie(res, session.accessToken, session.accessTokenExpiresAt);
    this.tokens.setRefreshTokenCookie(res, session.refreshToken, session.refreshTokenExpiresAt);
    this.tokens.setCsrfCookie(res, session.csrfToken, session.refreshTokenExpiresAt);
  }
}
