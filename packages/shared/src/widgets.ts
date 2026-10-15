import { z } from 'zod';

/**
 * Phase 4 — agent widget configuration, public embed config and attribution (docs/06,
 * docs/03 §2 "Widget and attribution", docs/04 §2). Kept Prisma-free like the rest of this
 * package; the API layer maps between these shapes and the Prisma `Widget`/`AttributionEvent`
 * rows (apps/api/prisma/schema.prisma).
 */

// ---------------------------------------------------------------------------
// Calculator types a widget can enable (subset of Phase 3's three calculators).
// ---------------------------------------------------------------------------

export const CalculatorType = {
  Affordability: 'AFFORDABILITY',
  PropertyCost: 'PROPERTY_COST',
  RentVsBuy: 'RENT_VS_BUY',
} as const;
export type CalculatorType = (typeof CalculatorType)[keyof typeof CalculatorType];

export const calculatorTypeSchema = z.enum([
  CalculatorType.Affordability,
  CalculatorType.PropertyCost,
  CalculatorType.RentVsBuy,
]);

// ---------------------------------------------------------------------------
// Public widget key (docs/06 §2, §4: "non-secret identifier", "not the UUID primary key
// itself, to avoid ever needing to rotate the PK"). A random, URL-safe opaque token — safe
// to appear in embed HTML/JS and in the public, unauthenticated config-lookup URL.
// ---------------------------------------------------------------------------

export const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const publicKeySchema = z
  .string()
  .regex(PUBLIC_KEY_PATTERN, 'Widget public key has an invalid format.');

// ---------------------------------------------------------------------------
// Allowed-origin validation (docs/06 §4: "normalized HTTPS origins for production";
// "Define local-development exceptions separately from production rules").
// ---------------------------------------------------------------------------

/** Exact-match local-dev exception: `http://localhost`, `http://localhost:5173`, ... */
const LOCALHOST_EXACT_PATTERN = /^http:\/\/localhost(:[0-9]{1,5})?$/;
/** Sentinel stored value meaning "any port on localhost" — never resolves to a real origin
 * on its own; only used on the allowed-origins *list* side of a match, documented separately
 * from the production HTTPS rule below so it can never be confused with it. */
export const LOCALHOST_WILDCARD_ORIGIN = 'http://localhost:*';
/** Production rule: `https://`, a plausible hostname, optional port, no path/query/fragment. */
const HTTPS_ORIGIN_PATTERN =
  /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$/;

/** Normalizes an origin for storage/comparison: lower-cases scheme+host, strips a trailing
 * slash. Does not validate; use `allowedOriginSchema` for that. */
export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * One entry in a widget's allowed-origins list. Accepts either the production HTTPS rule or
 * the literal local-development exceptions (an exact `http://localhost[:port]` origin, or the
 * `http://localhost:*` any-port wildcard) — two separate branches, never merged into one
 * permissive pattern, so the production rule alone can be tightened later without touching
 * the dev exception.
 */
export const allowedOriginSchema = z
  .string()
  .transform((value) => normalizeOrigin(value))
  .refine(
    (value) =>
      value === LOCALHOST_WILDCARD_ORIGIN ||
      LOCALHOST_EXACT_PATTERN.test(value) ||
      HTTPS_ORIGIN_PATTERN.test(value),
    {
      message:
        'Allowed origin must be a normalized https:// origin with no path, or the local-development exception (http://localhost[:port] or http://localhost:*).',
    },
  );

export const MAX_ALLOWED_ORIGINS = 10;
export const allowedOriginsSchema = z.array(allowedOriginSchema).max(MAX_ALLOWED_ORIGINS);

/**
 * Checks a request's `Origin` (or `Referer` origin) header against a widget's stored
 * allowed-origins list. Defense-in-depth signal only (docs/06 §4) — callers decide whether a
 * mismatch blocks the request or is merely logged.
 */
export function isOriginAllowed(
  origin: string | null | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  return allowedOrigins.some((allowed) => {
    if (allowed === LOCALHOST_WILDCARD_ORIGIN) {
      return LOCALHOST_EXACT_PATTERN.test(normalized);
    }
    return allowed === normalized;
  });
}

// ---------------------------------------------------------------------------
// Theme (docs/06 §2: "Theme tokens/logo URL where approved" — kept minimal per CLAUDE.md).
// ---------------------------------------------------------------------------

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const widgetThemeSchema = z.object({
  primaryColor: z.string().regex(HEX_COLOR_PATTERN, 'primaryColor must be a 6-digit hex color.'),
  logoUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), 'logoUrl must be an https:// URL.')
    .optional(),
});
export type WidgetTheme = z.infer<typeof widgetThemeSchema>;

export const DEFAULT_WIDGET_THEME: WidgetTheme = { primaryColor: '#0f5c4a' };

// ---------------------------------------------------------------------------
// Widget status and config (docs/03 §2, docs/06 §2).
// ---------------------------------------------------------------------------

export const WidgetStatus = { Active: 'ACTIVE', Paused: 'PAUSED' } as const;
export type WidgetStatus = (typeof WidgetStatus)[keyof typeof WidgetStatus];
export const widgetStatusSchema = z.enum([WidgetStatus.Active, WidgetStatus.Paused]);

export const widgetNameSchema = z.string().trim().min(1).max(100);

/** Agent-authenticated create request (`POST /api/v1/agent/widgets`). */
export const createWidgetRequestSchema = z.object({
  name: widgetNameSchema,
  theme: widgetThemeSchema.optional(),
  allowedOrigins: allowedOriginsSchema.default([]),
  enabledCalculators: z.array(calculatorTypeSchema).min(1).max(3),
});
export type CreateWidgetRequest = z.infer<typeof createWidgetRequestSchema>;

/** Agent-authenticated update/pause request (`PATCH /api/v1/agent/widgets/:id`). Every field
 * optional; at least one must be present. */
export const updateWidgetRequestSchema = z
  .object({
    name: widgetNameSchema.optional(),
    theme: widgetThemeSchema.optional(),
    allowedOrigins: allowedOriginsSchema.optional(),
    enabledCalculators: z.array(calculatorTypeSchema).min(1).max(3).optional(),
    status: widgetStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' });
export type UpdateWidgetRequest = z.infer<typeof updateWidgetRequestSchema>;

/** Full widget row as returned to the owning agent organization only — never to the public
 * endpoint (docs/10 §2: "Widget public configuration contains no secrets" — this shape is
 * richer than the public one but still contains no secrets, only tenant-private config). */
export const widgetResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  publicKey: publicKeySchema,
  name: z.string(),
  theme: widgetThemeSchema,
  allowedOrigins: z.array(z.string()),
  enabledCalculators: z.array(calculatorTypeSchema),
  status: widgetStatusSchema,
  configVersion: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WidgetResponse = z.infer<typeof widgetResponseSchema>;

/**
 * Public, unauthenticated config response (`GET /public/widgets/:publicKey/config`,
 * docs/06 §3-4). Deliberately omits `allowedOrigins`/`organizationId`/the DB `id` — origin
 * enforcement happens server-side, and nothing here needs to name the tenant. A PAUSED
 * widget still returns 200 with `status: 'PAUSED'` (docs/06 §8: "show a clear fallback
 * state", not a 404 — the widget exists).
 */
export const publicWidgetConfigResponseSchema = z.object({
  name: z.string(),
  theme: widgetThemeSchema,
  enabledCalculators: z.array(calculatorTypeSchema),
  status: widgetStatusSchema,
  configVersion: z.number().int().min(1),
});
export type PublicWidgetConfigResponse = z.infer<typeof publicWidgetConfigResponseSchema>;

// ---------------------------------------------------------------------------
// Attribution (docs/06 §5, docs/03 §2, docs/04 §4). Closed event-type enum — never an
// arbitrary client string. Dot-notation values match the internal domain-event names in
// docs/04 §4; they are mapped to/from the Prisma enum (upper-snake-case) in the API layer.
// ---------------------------------------------------------------------------

export const AttributionEventType = {
  WidgetViewed: 'widget.viewed',
  CalculatorCompleted: 'calculator.completed',
} as const;
export type AttributionEventType = (typeof AttributionEventType)[keyof typeof AttributionEventType];

export const attributionEventTypeSchema = z.enum([
  AttributionEventType.WidgetViewed,
  AttributionEventType.CalculatorCompleted,
]);

/**
 * A landing path with no query string or fragment (docs/06 §5 "landing path without
 * sensitive query parameters"; CLAUDE.md §4 "no sensitive input in URLs/logs"). Rejected
 * outright rather than silently truncated, so a caller sending a query string gets a clear
 * validation error instead of a surprising partial value.
 */
export const landingPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(
    /^\/[^?#]*$/,
    'landingPath must start with "/" and must not contain a query string or fragment.',
  );

const labelSchema = z.string().trim().min(1).max(100);

/** Public, unauthenticated attribution event (`POST /public/analytics/events`). No client
 * timestamp field: the server always stamps `occurredAt` itself (docs/06 §5). */
export const recordAttributionEventRequestSchema = z.object({
  widgetPublicKey: publicKeySchema,
  eventType: attributionEventTypeSchema,
  campaign: labelSchema.optional(),
  source: labelSchema.optional(),
  landingPath: landingPathSchema.optional(),
});
export type RecordAttributionEventRequest = z.infer<typeof recordAttributionEventRequestSchema>;

export const recordAttributionEventResponseSchema = z.object({ recorded: z.boolean() });
export type RecordAttributionEventResponse = z.infer<typeof recordAttributionEventResponseSchema>;

// ---------------------------------------------------------------------------
// Agent-authenticated aggregated reporting (`GET /api/v1/agent/reports/summary`).
// ---------------------------------------------------------------------------

export const DEFAULT_REPORT_WINDOW_DAYS = 30;
export const MAX_REPORT_WINDOW_DAYS = 90;

export const reportsSummaryQuerySchema = z.object({
  windowDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_REPORT_WINDOW_DAYS)
    .default(DEFAULT_REPORT_WINDOW_DAYS),
});
export type ReportsSummaryQuery = z.infer<typeof reportsSummaryQuerySchema>;

export const reportsSummaryRowSchema = z.object({
  widgetId: z.string().uuid(),
  widgetName: z.string(),
  eventType: attributionEventTypeSchema,
  count: z.number().int().min(0),
});

export const reportsSummaryResponseSchema = z.object({
  windowDays: z.number().int(),
  totalEvents: z.number().int().min(0),
  rows: z.array(reportsSummaryRowSchema),
});
export type ReportsSummaryResponse = z.infer<typeof reportsSummaryResponseSchema>;
