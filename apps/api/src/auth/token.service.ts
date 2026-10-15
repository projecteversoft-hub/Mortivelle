import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/config';

export const ACCESS_TOKEN_COOKIE = 'eversoft_at';
export const REFRESH_TOKEN_COOKIE = 'eversoft_rt';
export const CSRF_COOKIE = 'eversoft_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Access-token cookie is sent on every API request; refresh is scoped to /auth routes only. */
const ACCESS_COOKIE_PATH = '/api/v1';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
/**
 * The CSRF cookie must be readable via `document.cookie` from any page of the web app (e.g.
 * `/agent.html`), not just from API paths: cookie visibility to JS is scoped by the
 * *current page's* path falling under the cookie's Path attribute, not by which paths the
 * cookie is later sent to. `ACCESS_COOKIE_PATH` (`/api/v1`) is invisible to a page at `/`,
 * so `readCookie('eversoft_csrf')` in the frontend always returned undefined and every
 * CSRF-guarded request (logout, refresh) silently failed with CSRF_TOKEN_INVALID — caught
 * live via the agent dashboard's "Sign out" button doing nothing. The cookie's value is a
 * non-secret, non-HttpOnly token by design, so widening its Path to `/` has no security
 * cost; it is still sent on every request to this origin, same as before.
 */
const CSRF_COOKIE_PATH = '/';

export interface AccessTokenPayload {
  sub: string;
}

export interface IssuedRefreshToken {
  /** Raw opaque value — goes in the cookie only, never persisted. */
  token: string;
  /** SHA-256 hash — the only form persisted (docs/03 §2). */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Issues/verifies the short-lived JWT access token and generates opaque refresh-token
 * values, and centralizes the HttpOnly cookie settings used across the auth flows so every
 * endpoint applies the same Secure/SameSite/path policy (docs/02 §5, ADR-001: web and API
 * share a registrable domain, so SameSite=Lax cookies are same-site).
 */
@Injectable()
export class TokenService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  signAccessToken(userId: string): { token: string; expiresAt: Date } {
    const expiresAt = new Date(Date.now() + this.config.AUTH_ACCESS_TOKEN_TTL_SECONDS * 1000);
    const token = jwt.sign(
      { sub: userId } satisfies AccessTokenPayload,
      this.config.AUTH_JWT_SECRET,
      {
        expiresIn: this.config.AUTH_ACCESS_TOKEN_TTL_SECONDS,
        algorithm: 'HS256',
      },
    );
    return { token, expiresAt };
  }

  /** Returns the verified payload, or null for any invalid/expired/malformed token. */
  verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.config.AUTH_JWT_SECRET, { algorithms: ['HS256'] });
      if (typeof decoded === 'object' && decoded && typeof decoded.sub === 'string') {
        return { sub: decoded.sub };
      }
      return null;
    } catch {
      return null;
    }
  }

  issueRefreshToken(): IssuedRefreshToken {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    return { token, tokenHash: TokenService.hashOpaqueToken(token), expiresAt };
  }

  static hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  static newFamilyId(): string {
    return randomUUID();
  }

  generateCsrfToken(): string {
    return randomBytes(24).toString('base64url');
  }

  private cookieBase(): { httpOnly: boolean; secure: boolean; sameSite: 'lax' } {
    return { httpOnly: true, secure: this.config.NODE_ENV === 'production', sameSite: 'lax' };
  }

  setAccessTokenCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      ...this.cookieBase(),
      path: ACCESS_COOKIE_PATH,
      expires: expiresAt,
    });
  }

  setRefreshTokenCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_TOKEN_COOKIE, token, {
      ...this.cookieBase(),
      path: REFRESH_COOKIE_PATH,
      expires: expiresAt,
    });
  }

  /** Non-HttpOnly: the web app must be able to read it and echo it back as a header. */
  setCsrfCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: CSRF_COOKIE_PATH,
      expires: expiresAt,
    });
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: ACCESS_COOKIE_PATH });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_COOKIE_PATH });
    res.clearCookie(CSRF_COOKIE, { path: CSRF_COOKIE_PATH });
  }
}
