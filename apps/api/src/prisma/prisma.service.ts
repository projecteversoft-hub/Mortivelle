import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/config';

/**
 * Thin PrismaClient wrapper. It does not connect eagerly, so the API can boot (and report
 * "unavailable" from the readiness probe) while the database is down.
 * Tenant-scoped repositories are introduced in Phase 2; do not query tenant data directly.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ datasources: { db: { url: config.DATABASE_URL } } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
