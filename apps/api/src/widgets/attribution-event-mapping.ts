import { AttributionEventType as PrismaAttributionEventType } from '@prisma/client';
import { AttributionEventType } from '@tech-realty-rentals/shared';

/**
 * Prisma enum members cannot contain `.`, so the public API's dot-notation event-type values
 * (`widget.viewed`, `calculator.completed` -- matching docs/04 §4's internal domain-event
 * naming) are mapped to/from the Prisma enum's upper-snake-case members here, in one place.
 */
const TO_PRISMA: Record<AttributionEventType, PrismaAttributionEventType> = {
  [AttributionEventType.WidgetViewed]: PrismaAttributionEventType.WIDGET_VIEWED,
  [AttributionEventType.CalculatorCompleted]: PrismaAttributionEventType.CALCULATOR_COMPLETED,
};

const FROM_PRISMA: Record<PrismaAttributionEventType, AttributionEventType> = {
  [PrismaAttributionEventType.WIDGET_VIEWED]: AttributionEventType.WidgetViewed,
  [PrismaAttributionEventType.CALCULATOR_COMPLETED]: AttributionEventType.CalculatorCompleted,
};

export function toPrismaAttributionEventType(
  value: AttributionEventType,
): PrismaAttributionEventType {
  return TO_PRISMA[value];
}

export function fromPrismaAttributionEventType(
  value: PrismaAttributionEventType,
): AttributionEventType {
  return FROM_PRISMA[value];
}
