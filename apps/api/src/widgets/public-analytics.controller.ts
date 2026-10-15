import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  recordAttributionEventRequestSchema,
  type RecordAttributionEventRequest,
  type RecordAttributionEventResponse,
} from '@tech-realty-rentals/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AttributionService } from './attribution.service';

/**
 * Public, unauthenticated attribution-event capture (docs/04 §2, docs/06 §5). No
 * `AuthGuard`/`TenantGuard`; rate-limited like the other public endpoints. CORS for this
 * route reflects any origin (see apps/api/src/widgets/public-widget-cors.ts for why) --
 * the actual Origin-vs-widget-allowlist check happens inside `AttributionService`.
 */
@Controller('public/analytics')
@SkipThrottle({ auth: true, calculators: true, 'widget-config': true, leads: true })
export class PublicAnalyticsController {
  constructor(private readonly attribution: AttributionService) {}

  @Post('events')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  async recordEvent(
    @Body(new ZodValidationPipe(recordAttributionEventRequestSchema))
    body: RecordAttributionEventRequest,
    @Req() req: Request,
  ): Promise<RecordAttributionEventResponse> {
    return this.attribution.recordEvent({
      ...body,
      originHeader: req.header('origin') ?? req.header('referer') ?? null,
    });
  }
}
