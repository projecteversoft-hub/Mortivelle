import { Injectable } from '@nestjs/common';
import {
  calculateAffordability,
  calculatePropertyCost,
  calculateRentVsBuy,
  type AffordabilityRequest,
  type AffordabilityResponse,
  type PropertyCostRequest,
  type PropertyCostResponse,
  type RentVsBuyRequest,
  type RentVsBuyResponse,
} from '@tech-realty-rentals/shared';

/**
 * Deliberately thin: the actual calculation logic (formulas, defaults, decimal rounding)
 * lives in `@tech-realty-rentals/shared` so it is framework-agnostic and directly reusable by
 * `apps/web` for client-side computation (see apps/web/src/calculators for why that's the
 * primary UX path). This service exists only so the controller has something to inject and
 * so a later phase can add logging/metrics around calculator usage without touching the
 * pure functions themselves.
 */
@Injectable()
export class CalculatorsService {
  affordability(input: AffordabilityRequest): AffordabilityResponse {
    return calculateAffordability(input);
  }

  propertyCost(input: PropertyCostRequest): PropertyCostResponse {
    return calculatePropertyCost(input);
  }

  rentVsBuy(input: RentVsBuyRequest): RentVsBuyResponse {
    return calculateRentVsBuy(input);
  }
}
