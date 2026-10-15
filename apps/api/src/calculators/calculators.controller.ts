import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  affordabilityRequestSchema,
  propertyCostRequestSchema,
  rentVsBuyRequestSchema,
  type AffordabilityRequest,
  type AffordabilityResponse,
  type PropertyCostRequest,
  type PropertyCostResponse,
  type RentVsBuyRequest,
  type RentVsBuyResponse,
} from '@tech-realty-rentals/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CalculatorsService } from './calculators.service';

/**
 * Public, unauthenticated, rate-limited calculator endpoints (docs/04 §2 "Public calculator
 * and widget"; docs/05 §1 "usable without account creation"). No `AuthGuard`/`TenantGuard`
 * here — mirrors `apps/api/src/auth/auth.controller.ts`'s pattern for public endpoints, and
 * `ThrottlerGuard` is applied per-handler rather than globally, exactly like auth's
 * login/register/forgot-password/reset-password.
 *
 * These are pure computations: no database access, no PII, no session/tenant context. The
 * request body is validated end-to-end by the shared Zod schemas before any math runs, and
 * every response is built entirely from the shared pure functions in `@tech-realty-rentals/shared` —
 * nothing here ever echoes an unvalidated field back to the caller.
 */
@Controller('public/calculators')
// See rate-limit/rate-limit.module.ts: every named throttler bucket is registered centrally
// and `ThrottlerGuard` checks all of them by default, so this opts out of every bucket that
// is not this module's own 'calculators' one (a pre-existing bug fix, not a Phase 4 change).
@SkipThrottle({ auth: true, 'widget-config': true, analytics: true, leads: true })
export class CalculatorsController {
  constructor(private readonly calculators: CalculatorsService) {}

  @Post('affordability')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  affordability(
    @Body(new ZodValidationPipe(affordabilityRequestSchema)) body: AffordabilityRequest,
  ): AffordabilityResponse {
    return this.calculators.affordability(body);
  }

  @Post('property-cost')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  propertyCost(
    @Body(new ZodValidationPipe(propertyCostRequestSchema)) body: PropertyCostRequest,
  ): PropertyCostResponse {
    return this.calculators.propertyCost(body);
  }

  @Post('rent-vs-buy')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  rentVsBuy(
    @Body(new ZodValidationPipe(rentVsBuyRequestSchema)) body: RentVsBuyRequest,
  ): RentVsBuyResponse {
    return this.calculators.rentVsBuy(body);
  }
}
