import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TokenService, ACCESS_TOKEN_COOKIE } from '../auth/token.service';

/**
 * Resolves the authenticated user from the access-token cookie (never from a client-supplied
 * header/body field). Deliberately stateless/claims-only: it verifies the JWT signature and
 * expiry but does not query the database, keeping the access token's short TTL as the bound
 * on how long a revoked/disabled account can still authenticate (documented trade-off —
 * tenant-scoped endpoints additionally require an ACTIVE Membership row via TenantGuard,
 * which does hit the database).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException();
    }
    const payload = this.tokens.verifyAccessToken(token);
    if (!payload) {
      throw new UnauthorizedException();
    }
    req.user = { id: payload.sub };
    return true;
  }
}
