import { Module } from '@nestjs/common';
import { CalculatorsController } from './calculators.controller';
import { CalculatorsService } from './calculators.service';

// Rate limiting: the 'calculators' named throttler bucket this module's
// `@UseGuards(ThrottlerGuard)` routes use is registered centrally in
// ../rate-limit/rate-limit.module.ts, not here -- see that file for why a module-local
// `ThrottlerModule.forRootAsync()` call is unsafe.
@Module({
  controllers: [CalculatorsController],
  providers: [CalculatorsService],
})
export class CalculatorsModule {}
