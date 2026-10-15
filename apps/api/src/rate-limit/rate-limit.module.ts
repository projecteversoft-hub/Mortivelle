import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../config/config';

/**
 * Centralizes EVERY named `@nestjs/throttler` bucket into exactly one
 * `ThrottlerModule.forRootAsync()` registration, for the whole app (docs/02 §5 "Rate-limit
 * login, password reset and verification flows"; docs/11 §4-5).
 *
 * Why this exists (a pre-existing bug, found and fixed while verifying Phase 4, not
 * introduced by it): `@nestjs/throttler`'s `ThrottlerModule` class is marked `@Global()` by
 * the library itself. Each feature module here (`AuthModule`, `CalculatorsModule`, and this
 * phase's `WidgetsModule`) previously called `ThrottlerModule.forRootAsync(...)` itself, with
 * its own named config. Because the module class is global, every one of those registrations
 * becomes a competing global binding for the same `THROTTLER_OPTIONS`/`ThrottlerStorage`
 * tokens -- in practice, only the LAST one registered in `AppModule`'s import graph ends up
 * effective for every `@UseGuards(ThrottlerGuard)` call site application-wide, silently
 * disabling every other module's own rate limit. This was confirmed live: a manual curl
 * brute-force against `/api/v1/auth/login` with `AUTH_RATE_LIMIT_MAX=5` never returned 429
 * even after 7 attempts, and reproducing it with `WidgetsModule` removed from `AppModule`
 * showed the same failure -- so this predates Phase 4 (CalculatorsModule's own registration,
 * added in Phase 3, was already silently winning over AuthModule's).
 *
 * The fix: register every named bucket exactly once, here, imported first in `AppModule`.
 * Each controller that calls `@UseGuards(ThrottlerGuard)` now also needs `@SkipThrottle(...)`
 * for every bucket that is not its own (`AuthController`, `CalculatorsController`,
 * `PublicWidgetsController`, `PublicAnalyticsController`) -- `ThrottlerGuard` checks every
 * registered named throttler against every guarded route by default. No rate-limit VALUE or
 * env var changes; this only fixes which configuration is actually applied where.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [
        {
          name: 'auth',
          ttl: config.AUTH_RATE_LIMIT_TTL_SECONDS * 1000,
          limit: config.AUTH_RATE_LIMIT_MAX,
        },
        {
          name: 'calculators',
          ttl: config.CALCULATOR_RATE_LIMIT_TTL_SECONDS * 1000,
          limit: config.CALCULATOR_RATE_LIMIT_MAX,
        },
        {
          name: 'widget-config',
          ttl: config.WIDGET_CONFIG_RATE_LIMIT_TTL_SECONDS * 1000,
          limit: config.WIDGET_CONFIG_RATE_LIMIT_MAX,
        },
        {
          name: 'analytics',
          ttl: config.ANALYTICS_RATE_LIMIT_TTL_SECONDS * 1000,
          limit: config.ANALYTICS_RATE_LIMIT_MAX,
        },
        {
          // Phase 5 — public lead submission (docs/11 §6). Its own bucket, tighter than
          // widget-config/analytics since it is a write that accepts contact information
          // from an anonymous caller (packages/shared/src/env.ts).
          name: 'leads',
          ttl: config.LEAD_SUBMIT_RATE_LIMIT_TTL_SECONDS * 1000,
          limit: config.LEAD_SUBMIT_RATE_LIMIT_MAX,
        },
      ],
    }),
  ],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
