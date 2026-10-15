import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { LivenessResponse, ReadinessResponse } from '@tech-realty-rentals/shared';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is running. No dependency checks. */
  @Get('live')
  live(): LivenessResponse {
    return { status: 'ok' };
  }

  /** Readiness: required dependencies are reachable. 503 when not. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const result = await this.health.checkReadiness();
    if (result.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
