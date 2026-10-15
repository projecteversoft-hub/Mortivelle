import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ErrorCode } from '@tech-realty-rentals/shared';
import { DomainException } from './domain-exception';
import { CSRF_COOKIE, CSRF_HEADER } from '../auth/token.service';

/**
 * Double-submit-cookie CSRF protection for cookie-authenticated, state-changing requests
 * (docs/02 §5). Chosen over a server-side token store because it needs no persistence and
 * no Redis (CLAUDE.md §3: Redis deferred): the CSRF cookie is opaque, set alongside the
 * auth cookies, non-HttpOnly so the web app's JS can read it, and must be echoed back as a
 * request header. A cross-site form/script cannot read another origin's cookie, so it
 * cannot reproduce the header value even though the cookie itself rides along automatically.
 * Applied explicitly per-route (not globally) to the specific cookie-authenticated
 * mutating endpoints that need it (logout, refresh); it is not meaningful on
 * register/login/forgot-password, which do not yet have an authenticated session to ride on.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.header(CSRF_HEADER);

    if (
      typeof cookieToken !== 'string' ||
      typeof headerToken !== 'string' ||
      cookieToken.length === 0 ||
      cookieToken.length !== headerToken.length ||
      !timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
    ) {
      throw new DomainException(ErrorCode.CsrfTokenInvalid, HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
