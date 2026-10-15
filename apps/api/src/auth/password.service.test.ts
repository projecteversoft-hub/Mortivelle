import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';
import type { AppConfig } from '../config/config';

const config = {
  ARGON2_MEMORY_COST_KB: 8192,
  ARGON2_TIME_COST: 1,
  ARGON2_PARALLELISM: 1,
} as AppConfig;

describe('PasswordService', () => {
  const service = new PasswordService(config);

  it('hashes and verifies a matching password', async () => {
    const hash = await service.hash('a-correct-and-long-password');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await service.verify('a-correct-and-long-password', hash)).toBe(true);
  });

  it('rejects a non-matching password', async () => {
    const hash = await service.hash('a-correct-and-long-password');
    expect(await service.verify('totally-the-wrong-password', hash)).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await service.hash('same-password-same-password');
    const b = await service.hash('same-password-same-password');
    expect(a).not.toBe(b);
  });

  it('treats a malformed hash as a verification failure rather than throwing', async () => {
    await expect(service.verify('anything', 'not-a-real-hash')).resolves.toBe(false);
  });
});
