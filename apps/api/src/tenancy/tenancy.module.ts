import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthGuard } from './auth.guard';
import { TenantGuard } from './tenant.guard';
import { RolesGuard } from './roles.guard';

/**
 * Global so any controller can `@UseGuards(AuthGuard, TenantGuard, RolesGuard)` without
 * each feature module re-declaring/importing guard providers.
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [AuthGuard, TenantGuard, RolesGuard],
  exports: [AuthGuard, TenantGuard, RolesGuard],
})
export class TenancyModule {}
