import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { argon2id, argon2Verify } from 'hash-wasm';
import { APP_CONFIG, type AppConfig } from '../config/config';

const SALT_LENGTH_BYTES = 16;
const HASH_LENGTH_BYTES = 32;

/**
 * Argon2id password hashing (docs/02 §5) via `hash-wasm` — a pure WebAssembly
 * implementation with no native (.node) bindings. Chosen deliberately over `argon2` /
 * `@node-rs/argon2`: this environment has a confirmed, pre-existing Windows ACL issue
 * loading native addons (the SWC "ERR_SWC_NATIVE_CACHE" failure noted in the brief), and a
 * WASM-based implementation sidesteps that whole class of failure while still being
 * Argon2id per OWASP guidance. The 'encoded' output format embeds the salt and cost
 * parameters in the stored string (PHC-like), so verification needs no separate column.
 */
@Injectable()
export class PasswordService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async hash(plaintext: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH_BYTES);
    return argon2id({
      password: plaintext,
      salt,
      parallelism: this.config.ARGON2_PARALLELISM,
      iterations: this.config.ARGON2_TIME_COST,
      memorySize: this.config.ARGON2_MEMORY_COST_KB,
      hashLength: HASH_LENGTH_BYTES,
      outputType: 'encoded',
    });
  }

  async verify(plaintext: string, encodedHash: string): Promise<boolean> {
    try {
      return await argon2Verify({ password: plaintext, hash: encodedHash });
    } catch {
      // Malformed/legacy hash: treat as a verification failure, never throw into callers.
      return false;
    }
  }
}
