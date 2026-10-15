import { describe, expect, it } from 'vitest';
import { parseApiEnv } from './env';

const valid = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('parseApiEnv', () => {
  it('applies defaults', () => {
    const env = parseApiEnv(valid);
    expect(env.API_PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.WEB_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('splits multiple origins', () => {
    const env = parseApiEnv({ ...valid, WEB_ORIGINS: 'https://a.test, https://b.test' });
    expect(env.WEB_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('rejects a missing DATABASE_URL and names only the variable', () => {
    expect(() => parseApiEnv({})).toThrow('DATABASE_URL');
  });

  it('does not leak values in the error message', () => {
    try {
      parseApiEnv({ DATABASE_URL: 'mysql://secret-user:secret-pass@host/db' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('secret-pass');
    }
  });

  it('rejects a non-numeric port', () => {
    expect(() => parseApiEnv({ ...valid, API_PORT: 'abc' })).toThrow('API_PORT');
  });

  it('applies safe auth defaults', () => {
    const env = parseApiEnv(valid);
    expect(env.AUTH_ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.AUTH_REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.ARGON2_MEMORY_COST_KB).toBe(19456);
    expect(env.AUTH_JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('rejects the synthetic default AUTH_JWT_SECRET in production', () => {
    expect(() => parseApiEnv({ ...valid, NODE_ENV: 'production' })).toThrow('AUTH_JWT_SECRET');
  });

  it('accepts a production env once AUTH_JWT_SECRET is overridden', () => {
    const env = parseApiEnv({
      ...valid,
      NODE_ENV: 'production',
      AUTH_JWT_SECRET: 'a'.repeat(40),
      LEAD_MATCH_HMAC_SECRET: 'b'.repeat(40),
    });
    expect(env.NODE_ENV).toBe('production');
  });

  it('rejects the synthetic default LEAD_MATCH_HMAC_SECRET in production', () => {
    expect(() =>
      parseApiEnv({ ...valid, NODE_ENV: 'production', AUTH_JWT_SECRET: 'a'.repeat(40) }),
    ).toThrow('LEAD_MATCH_HMAC_SECRET');
  });
});
