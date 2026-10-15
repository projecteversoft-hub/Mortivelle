import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { publicKeySchema, type PublicWidgetConfigResponse } from '@tech-realty-rentals/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WidgetsService } from './widgets.service';

/**
 * Public, unauthenticated widget config lookup (docs/04 §2, docs/06 §3-4). No
 * `AuthGuard`/`TenantGuard` -- mirrors `CalculatorsController`'s pattern for anonymous,
 * rate-limited public endpoints. Per-widget CORS for this route is handled globally via
 * `app.enableCors()`'s delegate (apps/api/src/widgets/public-widget-cors.ts), not here.
 *
 * A paused widget is NOT a 404: it exists, so the response still returns 200 with
 * `status: 'PAUSED'`, letting the embed render a clear fallback state (docs/06 §8).
 */
@Controller('public/widgets')
@SkipThrottle({ auth: true, calculators: true, analytics: true, leads: true })
export class PublicWidgetsController {
  constructor(private readonly widgets: WidgetsService) {}

  @Get(':publicKey/config')
  @UseGuards(ThrottlerGuard)
  async getConfig(
    @Param('publicKey', new ZodValidationPipe(publicKeySchema)) publicKey: string,
  ): Promise<PublicWidgetConfigResponse> {
    return this.widgets.getPublicConfigByPublicKey(publicKey);
  }
}
