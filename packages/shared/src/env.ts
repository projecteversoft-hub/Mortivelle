import { z } from 'zod';

/**
 * Clearly-marked synthetic default so local dev/test boots without any file edits. This
 * exact string is rejected at NODE_ENV=production (see superRefine below), so production
 * deployments are forced to inject a real secret via the environment/secret manager.
 */
export const DEV_ONLY_DEFAULT_JWT_SECRET =
  'dev-only-synthetic-insecure-jwt-signing-secret-change-me-0000000000';

/**
 * Same synthetic-default-rejected-in-production pattern as `AUTH_JWT_SECRET` above, for the
 * keyed HMAC secret used to compute lead/suppression dedup match tokens (docs/03 §5). This
 * secret must differ from `AUTH_JWT_SECRET` in a real deployment (two unrelated purposes),
 * but sharing the same placeholder-rejection mechanism is intentional and documented.
 */
export const DEV_ONLY_DEFAULT_LEAD_MATCH_HMAC_SECRET =
  'dev-only-synthetic-insecure-lead-match-hmac-secret-change-me-0000000000';

/**
 * API environment contract. Validated once at process start; the API refuses to boot on
 * invalid configuration. Only synthetic values belong in .env.example.
 */
export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    WEB_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().url()).min(1)),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
        message: 'DATABASE_URL must be a PostgreSQL connection string',
      }),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // --- Phase 2: authentication / session / tenancy (docs/02 §5) ---
    /** Signs/verifies short-lived access tokens. Must be overridden outside local dev. */
    AUTH_JWT_SECRET: z.string().min(32).default(DEV_ONLY_DEFAULT_JWT_SECRET),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    // Argon2id parameters (docs/02 §5). Defaults follow OWASP's minimum recommendation.
    ARGON2_MEMORY_COST_KB: z.coerce.number().int().min(8192).default(19456),
    ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
    // In-memory rate limiting (Redis deferred per CLAUDE.md §3) for login/register/
    // forgot-password/reset-password.
    AUTH_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),

    // --- Phase 3: public calculators (docs/11 §4) ---
    // Same in-memory @nestjs/throttler approach as auth (Redis deferred, CLAUDE.md §3), but
    // calculators are pure CPU-only computation with no credentials or PII to brute-force —
    // the limit exists to bound abuse/scraping rather than to slow a credential-guessing
    // attack, so it is deliberately more generous than the auth limits.
    CALCULATOR_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
    CALCULATOR_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),

    // --- Phase 4: public widget config + attribution (docs/11 §5) ---
    // Same in-memory @nestjs/throttler approach (Redis deferred, CLAUDE.md §3). The config
    // endpoint is read-only and cacheable-ish (generous limit); the analytics endpoint
    // accepts writes from anonymous visitors, so it gets a tighter limit.
    WIDGET_CONFIG_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
    WIDGET_CONFIG_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    ANALYTICS_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
    ANALYTICS_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),

    // --- Phase 5: consent and lead capture (docs/03 §5, docs/07, docs/08, docs/11 §6) ---
    /** Keys lead/suppression dedup match tokens. Must be overridden outside local dev. */
    LEAD_MATCH_HMAC_SECRET: z.string().min(32).default(DEV_ONLY_DEFAULT_LEAD_MATCH_HMAC_SECRET),
    // Same in-memory @nestjs/throttler approach as the other public endpoints (Redis
    // deferred, CLAUDE.md §3). Tighter than the calculator/widget-config limits: this
    // endpoint accepts writes containing contact information from anonymous visitors.
    LEAD_SUBMIT_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
    LEAD_SUBMIT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),

    // --- Phase 6: exclusive lender delivery, mock routing/delivery adapter (docs/08 §5-6,
    // docs/11 §7) ---
    /** Passed through to the (mock) delivery adapter's contract — not actually enforced as a
     * real blocking timeout by the mock provider, which never makes a real network call, but
     * kept as a real config knob so a future real provider already has a place to plug into
     * (docs/04 §5 "Timeout"). */
    DELIVERY_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5000),
    /** Additional delivery attempts after the first, for the one retryable error category
     * (`TRANSIENT_ERROR`) only — never for an ambiguous timeout or a definitive rejection
     * (docs/08 §5-6). Kept small and synchronous; no Redis/queue-backed retry per CLAUDE.md
     * §3. */
    DELIVERY_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    /** Fixed per-attempt backoff in milliseconds (not exponential — a documented
     * simplification appropriate for a synchronous, in-process mock adapter with no real
     * network variance to back off from). */
    DELIVERY_RETRY_BACKOFF_MS: z.coerce.number().int().min(0).max(5000).default(25),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.AUTH_JWT_SECRET === DEV_ONLY_DEFAULT_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_JWT_SECRET'],
        message: 'AUTH_JWT_SECRET must be overridden in production',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      env.LEAD_MATCH_HMAC_SECRET === DEV_ONLY_DEFAULT_LEAD_MATCH_HMAC_SECRET
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LEAD_MATCH_HMAC_SECRET'],
        message: 'LEAD_MATCH_HMAC_SECRET must be overridden in production',
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Parses env and throws an error listing variable names only (never values). */
export function parseApiEnv(source: Record<string, string | undefined>): ApiEnv {
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${names.join(', ')}`);
  }
  return result.data;
}
