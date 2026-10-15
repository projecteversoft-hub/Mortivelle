import { Injectable, Logger } from '@nestjs/common';
import type { ReadinessResponse } from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';

const READINESS_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Checks required dependencies with an explicit timeout. Never throws. */
  async checkReadiness(): Promise<ReadinessResponse> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('readiness timeout')), READINESS_TIMEOUT_MS);
      });
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return { status: 'ok' };
    } catch (error) {
      // Log only the error class/message: connection strings never appear in driver messages we emit.
      this.logger.warn(
        `Readiness check failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      return { status: 'unavailable' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
