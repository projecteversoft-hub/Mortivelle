import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { MembershipsModule } from './memberships/memberships.module';
import { CalculatorsModule } from './calculators/calculators.module';
import { WidgetsModule } from './widgets/widgets.module';
import { LeadsModule } from './leads/leads.module';
import { DeliveryModule } from './delivery/delivery.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    // Must be imported before any feature module that uses `@UseGuards(ThrottlerGuard)` --
    // see rate-limit.module.ts for why this must be the ONLY `ThrottlerModule.forRootAsync()`
    // registration anywhere in the app (a pre-existing bug, not introduced by Phase 4, fixed
    // here because it silently disabled login/calculator rate limiting -- see that file).
    RateLimitModule,
    HealthModule,
    AuthModule,
    TenancyModule,
    MembershipsModule,
    CalculatorsModule,
    WidgetsModule,
    LeadsModule,
    DeliveryModule,
  ],
})
export class AppModule {}
