import { describe, expect, it } from 'vitest';
import {
  allowedOriginSchema,
  attributionEventTypeSchema,
  createWidgetRequestSchema,
  isOriginAllowed,
  landingPathSchema,
  LOCALHOST_WILDCARD_ORIGIN,
  publicKeySchema,
  recordAttributionEventRequestSchema,
  updateWidgetRequestSchema,
  widgetThemeSchema,
} from './widgets';

describe('publicKeySchema', () => {
  it('accepts a URL-safe token', () => {
    expect(publicKeySchema.safeParse('ab_CD-09'.repeat(2)).success).toBe(true);
  });

  it('rejects a too-short value and one containing invalid characters', () => {
    expect(publicKeySchema.safeParse('short').success).toBe(false);
    expect(publicKeySchema.safeParse('has a space here!!').success).toBe(false);
  });
});

describe('allowedOriginSchema (docs/06 §4)', () => {
  it('accepts a normalized production HTTPS origin', () => {
    const result = allowedOriginSchema.safeParse('https://Agent-Example.com');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('https://agent-example.com');
  });

  it('accepts an HTTPS origin with a port', () => {
    expect(allowedOriginSchema.safeParse('https://example.com:8443').success).toBe(true);
  });

  it('strips a trailing slash before validating', () => {
    const result = allowedOriginSchema.safeParse('https://example.com/');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('https://example.com');
  });

  it('rejects a plain HTTP production origin', () => {
    expect(allowedOriginSchema.safeParse('http://example.com').success).toBe(false);
  });

  it('rejects an origin carrying a path', () => {
    expect(allowedOriginSchema.safeParse('https://example.com/widget').success).toBe(false);
  });

  it('accepts the local-development exceptions', () => {
    expect(allowedOriginSchema.safeParse('http://localhost:5173').success).toBe(true);
    expect(allowedOriginSchema.safeParse('http://localhost').success).toBe(true);
    expect(allowedOriginSchema.safeParse(LOCALHOST_WILDCARD_ORIGIN).success).toBe(true);
  });

  it('rejects a non-localhost plain-HTTP origin pretending to be a dev exception', () => {
    expect(allowedOriginSchema.safeParse('http://evil.example.com').success).toBe(false);
  });
});

describe('isOriginAllowed', () => {
  it('matches an exact configured origin', () => {
    expect(isOriginAllowed('https://agent.example.com', ['https://agent.example.com'])).toBe(true);
  });

  it('does not match a different origin', () => {
    expect(isOriginAllowed('https://attacker.example.com', ['https://agent.example.com'])).toBe(
      false,
    );
  });

  it('matches any localhost port under the wildcard exception', () => {
    expect(isOriginAllowed('http://localhost:4000', [LOCALHOST_WILDCARD_ORIGIN])).toBe(true);
    expect(isOriginAllowed('http://localhost', [LOCALHOST_WILDCARD_ORIGIN])).toBe(true);
  });

  it('is false for a missing origin header', () => {
    expect(isOriginAllowed(null, ['https://agent.example.com'])).toBe(false);
    expect(isOriginAllowed(undefined, ['https://agent.example.com'])).toBe(false);
  });

  it('normalizes case/trailing-slash before comparing', () => {
    expect(isOriginAllowed('HTTPS://Agent.Example.com/', ['https://agent.example.com'])).toBe(true);
  });
});

describe('widgetThemeSchema', () => {
  it('accepts a 6-digit hex color with an optional https logo', () => {
    expect(
      widgetThemeSchema.safeParse({
        primaryColor: '#112233',
        logoUrl: 'https://cdn.example.com/a.png',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-hex color', () => {
    expect(widgetThemeSchema.safeParse({ primaryColor: 'red' }).success).toBe(false);
  });

  it('rejects a non-https logo URL', () => {
    expect(
      widgetThemeSchema.safeParse({
        primaryColor: '#112233',
        logoUrl: 'http://cdn.example.com/a.png',
      }).success,
    ).toBe(false);
  });
});

describe('createWidgetRequestSchema / updateWidgetRequestSchema', () => {
  it('requires at least one enabled calculator', () => {
    expect(
      createWidgetRequestSchema.safeParse({ name: 'My widget', enabledCalculators: [] }).success,
    ).toBe(false);
  });

  it('accepts a minimal valid create request, defaulting allowedOrigins to empty', () => {
    const result = createWidgetRequestSchema.safeParse({
      name: 'My widget',
      enabledCalculators: ['AFFORDABILITY'],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.allowedOrigins).toEqual([]);
  });

  it('rejects an update request with no fields at all', () => {
    expect(updateWidgetRequestSchema.safeParse({}).success).toBe(false);
  });

  it('accepts an update request that only pauses the widget', () => {
    expect(updateWidgetRequestSchema.safeParse({ status: 'PAUSED' }).success).toBe(true);
  });
});

describe('attributionEventTypeSchema / recordAttributionEventRequestSchema', () => {
  it('accepts the two defined event types', () => {
    expect(attributionEventTypeSchema.safeParse('widget.viewed').success).toBe(true);
    expect(attributionEventTypeSchema.safeParse('calculator.completed').success).toBe(true);
  });

  it('rejects an arbitrary out-of-enum event type', () => {
    expect(attributionEventTypeSchema.safeParse('lead.captured').success).toBe(false);
    expect(attributionEventTypeSchema.safeParse('<script>').success).toBe(false);
  });

  it('rejects a landing path carrying a query string', () => {
    const result = landingPathSchema.safeParse('/calculators?utm_source=x&email=a@b.com');
    expect(result.success).toBe(false);
  });

  it('rejects a landing path carrying a fragment', () => {
    expect(landingPathSchema.safeParse('/calculators#section').success).toBe(false);
  });

  it('accepts a clean landing path', () => {
    expect(landingPathSchema.safeParse('/calculators/affordability').success).toBe(true);
  });

  it('accepts a full valid attribution event request with no client timestamp field', () => {
    const result = recordAttributionEventRequestSchema.safeParse({
      widgetPublicKey: 'ab_CD-09ab_CD-09',
      eventType: 'widget.viewed',
      campaign: 'spring-promo',
      landingPath: '/embed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed widget public key', () => {
    const result = recordAttributionEventRequestSchema.safeParse({
      widgetPublicKey: 'not a key!',
      eventType: 'widget.viewed',
    });
    expect(result.success).toBe(false);
  });
});
