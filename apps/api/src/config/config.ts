import { parseApiEnv, type ApiEnv } from '@tech-realty-rentals/shared';

/** Injection token for the validated, immutable environment configuration. */
export const APP_CONFIG = Symbol('APP_CONFIG');
export type AppConfig = Readonly<ApiEnv>;

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  return Object.freeze(parseApiEnv(source));
}
