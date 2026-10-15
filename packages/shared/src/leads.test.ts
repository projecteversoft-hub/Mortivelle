import { describe, expect, it } from 'vitest';
import {
  assertLeadTransitionAllowed,
  computeLeadMatchToken,
  consentSelectionsSchema,
  isValidLeadTransition,
  leadContactSchema,
  LeadStatus,
  LeadTransitionError,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizePhone,
  requiredPurposeForAction,
  resolveChannelForPurpose,
  RequestedAction,
  ConsentPurpose,
  ConsentChannel,
  sha256Hex,
  submitLeadRequestSchema,
} from './leads';

describe('normalizeEmail / normalizePhone', () => {
  it('trims and lower-cases email', () => {
    expect(normalizeEmail('  John.Doe@Example.TEST ')).toBe('john.doe@example.test');
  });

  it('normalizes a bare 10-digit US number with a +1 prefix', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
  });

  it('normalizes an 11-digit number already starting with 1', () => {
    expect(normalizePhone('1-555-123-4567')).toBe('+15551234567');
  });

  it('produces the same normalized value for equivalent formats', () => {
    expect(normalizePhone('555.123.4567')).toBe(normalizePhone('(555) 123-4567'));
  });
});

describe('maskEmail / maskPhone (docs/02 §3, CLAUDE.md §4)', () => {
  it('masks the local part of an email to a fixed width', () => {
    expect(maskEmail('john@example.test')).toBe('j***@example.test');
    expect(maskEmail('a@example.test')).toBe('a***@example.test');
  });

  it('masks all but the last 4 digits of a phone number', () => {
    expect(maskPhone('+15551234567')).toBe('******4567');
  });

  it('never includes the raw email or phone value', () => {
    const email = 'jane.doe@example.test';
    const phone = '+15559876543';
    expect(maskEmail(email)).not.toContain('jane.doe');
    expect(maskPhone(phone)).not.toContain('98765');
  });
});

describe('computeLeadMatchToken / sha256Hex (docs/03 §5)', () => {
  it('produces the same token for the same secret and input', async () => {
    const a = await computeLeadMatchToken('secret-1', 'john@example.test');
    const b = await computeLeadMatchToken('secret-1', 'john@example.test');
    expect(a).toBe(b);
  });

  it('produces a different token for a different input', async () => {
    const a = await computeLeadMatchToken('secret-1', 'john@example.test');
    const b = await computeLeadMatchToken('secret-1', 'jane@example.test');
    expect(a).not.toBe(b);
  });

  it('produces a different token for a different secret (keyed, not a plain hash)', async () => {
    const a = await computeLeadMatchToken('secret-1', 'john@example.test');
    const b = await computeLeadMatchToken('secret-2', 'john@example.test');
    expect(a).not.toBe(b);
  });

  it('is a 64-character hex digest that does not trivially reveal the input', async () => {
    const token = await computeLeadMatchToken('secret-1', 'john@example.test');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toContain('john');
  });

  it('sha256Hex hashes content deterministically without a secret', async () => {
    const a = await sha256Hex('disclosure text v1');
    const b = await sha256Hex('disclosure text v1');
    const c = await sha256Hex('disclosure text v2');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('requiredPurposeForAction / resolveChannelForPurpose', () => {
  it('maps each requested action to its own-named required purpose', () => {
    expect(requiredPurposeForAction(RequestedAction.SaveResults)).toBe(ConsentPurpose.SaveResults);
    expect(requiredPurposeForAction(RequestedAction.RateAlerts)).toBe(ConsentPurpose.RateAlerts);
    expect(requiredPurposeForAction(RequestedAction.LenderContact)).toBe(
      ConsentPurpose.LenderContact,
    );
  });

  it('resolves fixed channels for SAVE_RESULTS and RATE_ALERTS', () => {
    expect(resolveChannelForPurpose(ConsentPurpose.SaveResults, {})).toBe(ConsentChannel.Account);
    expect(resolveChannelForPurpose(ConsentPurpose.RateAlerts, { email: 'a@b.test' })).toBe(
      ConsentChannel.Email,
    );
  });

  it('resolves LENDER_CONTACT to phone when provided, else email', () => {
    expect(
      resolveChannelForPurpose(ConsentPurpose.LenderContact, {
        phone: '+15551234567',
        email: 'a@b.test',
      }),
    ).toBe(ConsentChannel.Phone);
    expect(resolveChannelForPurpose(ConsentPurpose.LenderContact, { email: 'a@b.test' })).toBe(
      ConsentChannel.Email,
    );
  });
});

describe('lead lifecycle transition matrix (docs/08 §1)', () => {
  it('allows NEW -> NEEDS_REVIEW, NEW -> SUPPRESSED, NEW -> CLOSED', () => {
    expect(isValidLeadTransition(LeadStatus.New, LeadStatus.NeedsReview)).toBe(true);
    expect(isValidLeadTransition(LeadStatus.New, LeadStatus.Suppressed)).toBe(true);
    expect(isValidLeadTransition(LeadStatus.New, LeadStatus.Closed)).toBe(true);
  });

  it('allows NEEDS_REVIEW -> ELIGIBLE and NEEDS_REVIEW -> CLOSED only', () => {
    expect(isValidLeadTransition(LeadStatus.NeedsReview, LeadStatus.Eligible)).toBe(true);
    expect(isValidLeadTransition(LeadStatus.NeedsReview, LeadStatus.Closed)).toBe(true);
    expect(isValidLeadTransition(LeadStatus.NeedsReview, LeadStatus.Suppressed)).toBe(false);
  });

  // --- Phase 6 (docs/08 §1, docs/11 §7): the routing/delivery/qualification transitions
  // Phase 5 explicitly left unreachable are now allowed, and only exactly these.
  it('allows NEW -> ELIGIBLE (qualification passing)', () => {
    expect(isValidLeadTransition(LeadStatus.New, LeadStatus.Eligible)).toBe(true);
  });

  it('allows ELIGIBLE -> ROUTING and ELIGIBLE -> CLOSED only', () => {
    expect(isValidLeadTransition(LeadStatus.Eligible, LeadStatus.Routing)).toBe(true);
    expect(isValidLeadTransition(LeadStatus.Eligible, LeadStatus.Closed)).toBe(true);
    expect(isValidLeadTransition(LeadStatus.Eligible, LeadStatus.Delivered)).toBe(false);
    expect(isValidLeadTransition(LeadStatus.Eligible, LeadStatus.Accepted)).toBe(false);
  });

  it('allows ROUTING -> DELIVERED, ROUTING -> REJECTED and ROUTING -> CLOSED only', () => {
    expect(isValidLeadTransition(LeadStatus.Routing, LeadStatus.Delivered)).toBe(true);
    expect(isValidLeadTransition(LeadStatus.Routing, LeadStatus.Rejected)).toBe(true);
    expect(isValidLeadTransition(LeadStatus.Routing, LeadStatus.Closed)).toBe(true);
    expect(isValidLeadTransition(LeadStatus.Routing, LeadStatus.Eligible)).toBe(false);
    expect(isValidLeadTransition(LeadStatus.Routing, LeadStatus.Accepted)).toBe(false);
  });

  it('allows DELIVERED -> ACCEPTED and DELIVERED -> CLOSED only (lender-acknowledgment path)', () => {
    expect(isValidLeadTransition(LeadStatus.Delivered, LeadStatus.Accepted)).toBe(true);
    expect(isValidLeadTransition(LeadStatus.Delivered, LeadStatus.Closed)).toBe(true);
    expect(isValidLeadTransition(LeadStatus.Delivered, LeadStatus.Rejected)).toBe(false);
  });

  it('treats ACCEPTED, REJECTED, SUPPRESSED and CLOSED as terminal (no outbound transitions)', () => {
    for (const to of Object.values(LeadStatus)) {
      expect(isValidLeadTransition(LeadStatus.Accepted, to)).toBe(false);
      expect(isValidLeadTransition(LeadStatus.Rejected, to)).toBe(false);
      expect(isValidLeadTransition(LeadStatus.Suppressed, to)).toBe(false);
      expect(isValidLeadTransition(LeadStatus.Closed, to)).toBe(false);
    }
  });

  it('rejects an arbitrary unrelated transition', () => {
    expect(() => assertLeadTransitionAllowed(LeadStatus.Closed, LeadStatus.New)).toThrow(
      LeadTransitionError,
    );
    expect(() => assertLeadTransitionAllowed(LeadStatus.New, LeadStatus.Delivered)).toThrow(
      LeadTransitionError,
    );
    expect(() => assertLeadTransitionAllowed(LeadStatus.New, LeadStatus.Accepted)).toThrow(
      LeadTransitionError,
    );
  });
});

describe('leadContactSchema', () => {
  it('accepts email only, phone only, or both', () => {
    expect(leadContactSchema.safeParse({ email: 'a@b.test' }).success).toBe(true);
    expect(leadContactSchema.safeParse({ phone: '555-123-4567' }).success).toBe(true);
    expect(leadContactSchema.safeParse({ email: 'a@b.test', phone: '555-123-4567' }).success).toBe(
      true,
    );
  });

  it('rejects neither email nor phone', () => {
    expect(leadContactSchema.safeParse({}).success).toBe(false);
  });
});

describe('consentSelectionsSchema', () => {
  it('rejects duplicate purposes', () => {
    const result = consentSelectionsSchema.safeParse([
      ConsentPurpose.RateAlerts,
      ConsentPurpose.RateAlerts,
    ]);
    expect(result.success).toBe(false);
  });

  it('accepts a distinct, non-empty set', () => {
    const result = consentSelectionsSchema.safeParse([
      ConsentPurpose.RateAlerts,
      ConsentPurpose.LenderContact,
    ]);
    expect(result.success).toBe(true);
  });
});

describe('submitLeadRequestSchema (docs/04 §3)', () => {
  const base = {
    widgetPublicKey: 'a'.repeat(24),
    contact: { email: 'buyer@example.test' },
    requestedAction: RequestedAction.RateAlerts,
    consentSelections: [ConsentPurpose.RateAlerts],
    idempotencyKey: 'a-stable-idempotency-key-1',
  };

  it('accepts a minimal valid request', () => {
    expect(submitLeadRequestSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a calculatorContext summary with more than 8 fields', () => {
    const summary: Record<string, number> = {};
    for (let i = 0; i < 9; i += 1) summary[`field${i}`] = i;
    const result = submitLeadRequestSchema.safeParse({
      ...base,
      calculatorContext: { calculatorType: 'AFFORDABILITY', summary },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a too-short idempotency key', () => {
    const result = submitLeadRequestSchema.safeParse({ ...base, idempotencyKey: 'short' });
    expect(result.success).toBe(false);
  });
});
