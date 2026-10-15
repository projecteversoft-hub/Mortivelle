import { describe, expect, it } from 'vitest';
import { TokenService } from './token.service';
import type { AppConfig } from '../config/config';

const config = {
  AUTH_JWT_SECRET: 'unit-test-secret-at-least-32-characters-long-000000',
  AUTH_ACCESS_TOKEN_TTL_SECONDS: 900,
  AUTH_REFRESH_TOKEN_TTL_DAYS: 30,
  NODE_ENV: 'test',
} as AppConfig;

describe('TokenService', () => {
  const service = new TokenService(config);

  it('signs an access token that verifies back to the same subject', () => {
    const { token } = service.signAccessToken('user-123');
    const payload = service.verifyAccessToken(token);
    expect(payload).toEqual({ sub: 'user-123' });
  });

  it('rejects a malformed access token', () => {
    expect(service.verifyAccessToken('not-a-jwt')).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const other = new TokenService({
      ...config,
      AUTH_JWT_SECRET: 'a-totally-different-secret-000000000000',
    });
    const { token } = other.signAccessToken('user-123');
    expect(service.verifyAccessToken(token)).toBeNull();
  });

  it('issues unique, unguessable-looking opaque refresh tokens', () => {
    const a = service.issueRefreshToken();
    const b = service.issueRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
    expect(a.token.length).toBeGreaterThanOrEqual(32);
  });

  it('hashes the same opaque token deterministically, and never stores the raw value', () => {
    const issued = service.issueRefreshToken();
    expect(TokenService.hashOpaqueToken(issued.token)).toBe(issued.tokenHash);
    expect(issued.tokenHash).not.toContain(issued.token);
  });
});
