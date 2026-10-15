import { Module } from '@nestjs/common';
import { PublicWidgetsController } from './public-widgets.controller';
import { PublicAnalyticsController } from './public-analytics.controller';
import { AgentWidgetsController } from './agent-widgets.controller';
import { AgentReportsController } from './agent-reports.controller';
import { WidgetsService } from './widgets.service';
import { AttributionService } from './attribution.service';

/**
 * Phase 4 — agent widget configuration, public embed config and attribution (docs/11 §5).
 * One module covers both the public (anonymous) and agent-authenticated route groups,
 * mirroring how `AuthModule` holds both `register`/`login` (public) and session-mutating
 * endpoints together -- there is no further split here since all four controllers share the
 * same two services.
 *
 * Two separate named rate-limit buckets (config vs. analytics), independent of the
 * auth/calculator limits, same in-memory approach (Redis deferred, CLAUDE.md §3) -- both
 * registered centrally in ../rate-limit/rate-limit.module.ts, not here (see that file: a
 * module-local `ThrottlerModule.forRootAsync()` call silently disables every *other*
 * module's rate limit application-wide, since `@nestjs/throttler`'s `ThrottlerModule` is
 * itself `@Global()`). `@nestjs/throttler`'s `ThrottlerGuard` checks every registered named
 * throttler against every guarded route by default, so each public controller here uses
 * `@SkipThrottle(...)` to opt out of every bucket that is not its own (including the
 * pre-existing `auth`/`calculators` ones), so the config endpoint is governed only by its
 * own (more generous) limit and the analytics endpoint only by its own (tighter) one.
 */
@Module({
  controllers: [
    PublicWidgetsController,
    PublicAnalyticsController,
    AgentWidgetsController,
    AgentReportsController,
  ],
  providers: [WidgetsService, AttributionService],
  exports: [WidgetsService],
})
export class WidgetsModule {}
