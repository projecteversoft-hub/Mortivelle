import { randomBytes } from 'node:crypto';
import { PUBLIC_KEY_PATTERN } from '@tech-realty-rentals/shared';

/**
 * Generates a random, URL-safe, non-secret widget public key (docs/06 §4; see
 * packages/shared/src/widgets.ts for why this is deliberately not the UUID primary key).
 * 24 random bytes -> 32 base64url characters, comfortably inside `PUBLIC_KEY_PATTERN`'s
 * 16-64 character range.
 */
export function generateWidgetPublicKey(): string {
  const key = randomBytes(24).toString('base64url');
  if (!PUBLIC_KEY_PATTERN.test(key)) {
    // Defensive only: base64url output can never actually fail this pattern. Guards against
    // a future accidental change to either the pattern or the generation scheme.
    throw new Error('Generated widget public key failed its own format check');
  }
  return key;
}
