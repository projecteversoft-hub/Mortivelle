import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

/**
 * In-memory fake standing in for PrismaService in e2e tests. Docker/PostgreSQL are not
 * available in this environment (confirmed, same constraint as Gate 1), so Phase 2's auth/
 * tenancy/audit e2e tests exercise real business logic (hashing, token rotation, guards,
 * tenant scoping) against this fake rather than a live database — the same `useMocker`
 * style as test/health.e2e.test.ts, just with a slightly richer fake than a single mocked
 * method. It is deliberately simple: synchronous mutation of in-memory arrays wrapped in
 * resolved Promises, so `$transaction([...])` is NOT truly atomic here (unlike real
 * Postgres) — acceptable for Phase 2 because none of the required tests depend on
 * transactional rollback. Real Postgres behavior remains unverified (see final report).
 */
export interface FakeUserRow {
  id: string;
  email: string;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeOrganizationRow {
  id: string;
  name: string;
  type: 'PLATFORM' | 'AGENT_ORG' | 'LENDER_ORG';
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeMembershipRow {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeRefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  createdAt: Date;
}

export interface FakeTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface FakeAuditEventRow {
  id: string;
  actorUserId: string | null;
  organizationId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  correlationId: string;
  metadata: unknown;
  createdAt: Date;
}

// --- Phase 4: widgets and attribution (apps/api/src/widgets/*) ---

export interface FakeWidgetRow {
  id: string;
  organizationId: string;
  publicKey: string;
  name: string;
  themePrimaryColor: string;
  themeLogoUrl: string | null;
  allowedOrigins: string[];
  enabledCalculators: string[];
  status: 'ACTIVE' | 'PAUSED';
  configVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeAttributionEventRow {
  id: string;
  widgetId: string;
  organizationId: string;
  eventType: 'WIDGET_VIEWED' | 'CALCULATOR_COMPLETED';
  campaign: string | null;
  source: string | null;
  landingPath: string | null;
  occurredAt: Date;
}

// --- Phase 5: consent and lead capture (apps/api/src/leads/*) ---

export interface FakeDisclosureVersionRow {
  id: string;
  purpose: string;
  locale: string;
  version: number;
  content: string;
  contentHash: string;
  reviewStatus: string;
  publishedAt: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
}

export interface FakeLeadRow {
  id: string;
  contactEmail: string | null;
  contactPhone: string | null;
  emailMatchToken: string | null;
  phoneMatchToken: string | null;
  status: string;
  sourceWidgetId: string;
  sourceOrganizationId: string;
  purchaseIntentTimeline: string | null;
  purchaseIntentState: string | null;
  purchaseIntentZip: string | null;
  purchaseIntentPriceMin: number | null;
  purchaseIntentPriceMax: number | null;
  // Phase 6 addition (docs/08 §4).
  purchaseIntentBuyerStatus: string | null;
  retentionUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeLeadRelationshipRow {
  id: string;
  leadId: string;
  organizationId: string;
  relationshipType: string;
  createdAt: Date;
}

export interface FakeConsentRecordRow {
  id: string;
  leadId: string;
  disclosureVersionId: string;
  purpose: string;
  channel: string;
  recipientScope: string | null;
  userAction: string;
  capturedAt: Date;
  sourceWidgetId: string;
  correlationId: string;
  evidenceMetadata: unknown;
  revokedAt: Date | null;
  revokedReason: string | null;
}

export interface FakeLeadEventRow {
  id: string;
  leadId: string;
  eventType: string;
  actorType: string;
  correlationId: string;
  metadata: unknown;
  occurredAt: Date;
}

export interface FakeSuppressionRecordRow {
  id: string;
  matchToken: string;
  purpose: string;
  channel: string;
  reason: string;
  source: string;
  createdAt: Date;
}

export interface FakeLeadIdempotencyKeyRow {
  id: string;
  widgetId: string;
  idempotencyKey: string;
  requestHash: string;
  leadId: string | null;
  responseSnapshot: unknown;
  createdAt: Date;
}

// --- Phase 6: exclusive lender delivery, mock routing/delivery adapter and simulated billing
// ledger (apps/api/src/delivery/*) ---

export interface FakeLenderRow {
  id: string;
  organizationId: string;
  displayName: string;
  status: string;
  integrationMode: string;
  contractApprovedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeRoutingPolicyRow {
  id: string;
  lenderId: string;
  strategy: string;
  eligibilityConditions: unknown;
  priority: number;
  status: string;
  version: number;
  activeFrom: Date | null;
  activeUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeRoutingAttemptRow {
  id: string;
  leadId: string;
  routingPolicyId: string | null;
  policyVersion: number | null;
  lenderId: string | null;
  status: string;
  failureReason: string | null;
  idempotencyKey: string;
  correlationId: string;
  createdAt: Date;
  completedAt: Date | null;
}

export interface FakeLeadDeliveryRow {
  id: string;
  leadId: string;
  lenderId: string;
  routingAttemptId: string;
  status: string;
  payloadVersion: number;
  idempotencyKey: string;
  requestHash: string;
  attemptedAt: Date;
  acknowledgedAt: Date | null;
  lenderAcknowledgedAt: Date | null;
  errorCode: string | null;
  providerCorrelationId: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeBillingEntryRow {
  id: string;
  leadDeliveryId: string;
  eventType: string;
  amountCents: number;
  currency: string;
  status: string;
  externalReference: string | null;
  createdAt: Date;
}

export interface FakeQualificationRecordRow {
  id: string;
  leadId: string;
  type: string;
  provider: string;
  status: string;
  requestedAt: Date;
  completedAt: Date | null;
  resultSummary: unknown;
  correlationId: string;
}

function now(): Date {
  return new Date();
}

export class FakePrisma {
  readonly users: FakeUserRow[] = [];
  readonly organizations: FakeOrganizationRow[] = [];
  readonly memberships: FakeMembershipRow[] = [];
  readonly refreshTokens: FakeRefreshTokenRow[] = [];
  readonly emailVerificationTokens: FakeTokenRow[] = [];
  readonly passwordResetTokens: FakeTokenRow[] = [];
  readonly auditEvents: FakeAuditEventRow[] = [];
  readonly widgets: FakeWidgetRow[] = [];
  readonly attributionEvents: FakeAttributionEventRow[] = [];
  readonly disclosureVersions: FakeDisclosureVersionRow[] = [];
  readonly leads: FakeLeadRow[] = [];
  readonly leadRelationships: FakeLeadRelationshipRow[] = [];
  readonly consentRecords: FakeConsentRecordRow[] = [];
  readonly leadEvents: FakeLeadEventRow[] = [];
  readonly suppressionRecords: FakeSuppressionRecordRow[] = [];
  readonly leadIdempotencyKeys: FakeLeadIdempotencyKeyRow[] = [];
  readonly lenders: FakeLenderRow[] = [];
  readonly routingPolicies: FakeRoutingPolicyRow[] = [];
  readonly routingAttempts: FakeRoutingAttemptRow[] = [];
  readonly leadDeliveries: FakeLeadDeliveryRow[] = [];
  readonly billingEntries: FakeBillingEntryRow[] = [];
  readonly qualificationRecords: FakeQualificationRecordRow[] = [];

  $queryRaw = (): Promise<unknown> => Promise.resolve([{ '?column?': 1 }]);

  $transaction = <T extends unknown[]>(ops: T): Promise<T> => Promise.all(ops) as never;

  user = {
    create: ({ data }: { data: Partial<FakeUserRow> }): Promise<FakeUserRow> => {
      if (this.users.some((u) => u.email === data.email)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: FakeUserRow = {
        id: randomUUID(),
        email: data.email as string,
        passwordHash: data.passwordHash ?? null,
        emailVerifiedAt: null,
        status: 'PENDING_VERIFICATION',
        createdAt: now(),
        updatedAt: now(),
      };
      this.users.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
    }: {
      where: { id?: string; email?: string };
    }): Promise<FakeUserRow | null> => {
      const row = this.users.find((u) => (where.id ? u.id === where.id : u.email === where.email));
      return Promise.resolve(row ?? null);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeUserRow>;
    }): Promise<FakeUserRow> => {
      const row = this.users.find((u) => u.id === where.id);
      if (!row) throw new Error('user not found');
      Object.assign(row, data, { updatedAt: now() });
      return Promise.resolve(row);
    },
  };

  organization = {
    create: ({ data }: { data: Partial<FakeOrganizationRow> }): Promise<FakeOrganizationRow> => {
      const id = data.id ?? randomUUID();
      if (this.organizations.some((o) => o.id === id)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: FakeOrganizationRow = {
        id,
        name: data.name as string,
        type: data.type as FakeOrganizationRow['type'],
        status: 'ACTIVE',
        createdAt: now(),
        updatedAt: now(),
      };
      this.organizations.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({ where }: { where: { id: string } }): Promise<FakeOrganizationRow | null> =>
      Promise.resolve(this.organizations.find((o) => o.id === where.id) ?? null),
  };

  membership = {
    create: ({ data }: { data: Partial<FakeMembershipRow> }): Promise<FakeMembershipRow> => {
      const row: FakeMembershipRow = {
        id: randomUUID(),
        userId: data.userId as string,
        organizationId: data.organizationId as string,
        role: data.role as string,
        status: (data.status as FakeMembershipRow['status']) ?? 'ACTIVE',
        createdAt: now(),
        updatedAt: now(),
      };
      this.memberships.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
    }: {
      where: { userId_organizationId: { userId: string; organizationId: string } };
    }): Promise<FakeMembershipRow | null> => {
      const { userId, organizationId } = where.userId_organizationId;
      const row = this.memberships.find(
        (m) => m.userId === userId && m.organizationId === organizationId,
      );
      return Promise.resolve(row ?? null);
    },
    findMany: ({
      where,
      take,
      skip,
      include,
      orderBy,
    }: {
      where: { organizationId?: string; userId?: string; status?: string };
      orderBy?: { createdAt?: 'asc' | 'desc' };
      take?: number;
      skip?: number;
      include?: { organization?: { select?: { name?: boolean } } };
    }): Promise<unknown[]> => {
      let rows = this.memberships.filter(
        (m) =>
          (where.organizationId === undefined || m.organizationId === where.organizationId) &&
          (where.userId === undefined || m.userId === where.userId) &&
          (where.status === undefined || m.status === where.status),
      );
      const direction = orderBy?.createdAt === 'asc' ? 1 : -1;
      rows = rows.sort((a, b) => direction * (a.createdAt.getTime() - b.createdAt.getTime()));
      const start = skip ?? 0;
      const end = take !== undefined ? start + take : undefined;
      const page = rows.slice(start, end);
      if (!include?.organization) return Promise.resolve(page);
      return Promise.resolve(
        page.map((row) => ({
          ...row,
          organization: this.organizations.find((o) => o.id === row.organizationId) ?? null,
        })),
      );
    },
    count: ({ where }: { where: { organizationId: string } }): Promise<number> =>
      Promise.resolve(
        this.memberships.filter((m) => m.organizationId === where.organizationId).length,
      ),
  };

  refreshToken = {
    create: ({ data }: { data: Partial<FakeRefreshTokenRow> }): Promise<FakeRefreshTokenRow> => {
      const row: FakeRefreshTokenRow = {
        id: randomUUID(),
        userId: data.userId as string,
        tokenHash: data.tokenHash as string,
        familyId: data.familyId as string,
        expiresAt: data.expiresAt as Date,
        revokedAt: null,
        replacedById: null,
        createdAt: now(),
      };
      this.refreshTokens.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
    }: {
      where: { tokenHash: string };
    }): Promise<FakeRefreshTokenRow | null> => {
      const row = this.refreshTokens.find((t) => t.tokenHash === where.tokenHash);
      return Promise.resolve(row ?? null);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeRefreshTokenRow>;
    }): Promise<FakeRefreshTokenRow> => {
      const row = this.refreshTokens.find((t) => t.id === where.id);
      if (!row) throw new Error('refresh token not found');
      Object.assign(row, data);
      return Promise.resolve(row);
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { userId?: string; familyId?: string; tokenHash?: string; revokedAt?: null };
      data: Partial<FakeRefreshTokenRow>;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of this.refreshTokens) {
        if (where.userId !== undefined && row.userId !== where.userId) continue;
        if (where.familyId !== undefined && row.familyId !== where.familyId) continue;
        if (where.tokenHash !== undefined && row.tokenHash !== where.tokenHash) continue;
        if (where.revokedAt === null && row.revokedAt !== null) continue;
        Object.assign(row, data);
        count += 1;
      }
      return Promise.resolve({ count });
    },
  };

  emailVerificationToken = {
    create: ({ data }: { data: Partial<FakeTokenRow> }): Promise<FakeTokenRow> => {
      const row: FakeTokenRow = {
        id: randomUUID(),
        userId: data.userId as string,
        tokenHash: data.tokenHash as string,
        expiresAt: data.expiresAt as Date,
        consumedAt: null,
        createdAt: now(),
      };
      this.emailVerificationTokens.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({ where }: { where: { tokenHash: string } }): Promise<FakeTokenRow | null> =>
      Promise.resolve(
        this.emailVerificationTokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
      ),
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeTokenRow>;
    }): Promise<FakeTokenRow> => {
      const row = this.emailVerificationTokens.find((t) => t.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return Promise.resolve(row);
    },
  };

  passwordResetToken = {
    create: ({ data }: { data: Partial<FakeTokenRow> }): Promise<FakeTokenRow> => {
      const row: FakeTokenRow = {
        id: randomUUID(),
        userId: data.userId as string,
        tokenHash: data.tokenHash as string,
        expiresAt: data.expiresAt as Date,
        consumedAt: null,
        createdAt: now(),
      };
      this.passwordResetTokens.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({ where }: { where: { tokenHash: string } }): Promise<FakeTokenRow | null> =>
      Promise.resolve(
        this.passwordResetTokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
      ),
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeTokenRow>;
    }): Promise<FakeTokenRow> => {
      const row = this.passwordResetTokens.find((t) => t.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return Promise.resolve(row);
    },
  };

  auditEvent = {
    create: ({ data }: { data: Partial<FakeAuditEventRow> }): Promise<FakeAuditEventRow> => {
      const row: FakeAuditEventRow = {
        id: randomUUID(),
        actorUserId: data.actorUserId ?? null,
        organizationId: data.organizationId ?? null,
        action: data.action as string,
        resourceType: data.resourceType ?? null,
        resourceId: data.resourceId ?? null,
        outcome: data.outcome as FakeAuditEventRow['outcome'],
        correlationId: data.correlationId as string,
        metadata: data.metadata ?? null,
        createdAt: now(),
      };
      this.auditEvents.push(row);
      return Promise.resolve(row);
    },
  };

  widget = {
    create: ({ data }: { data: Partial<FakeWidgetRow> }): Promise<FakeWidgetRow> => {
      if (this.widgets.some((w) => w.publicKey === data.publicKey)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: FakeWidgetRow = {
        id: randomUUID(),
        organizationId: data.organizationId as string,
        publicKey: data.publicKey as string,
        name: data.name as string,
        themePrimaryColor: data.themePrimaryColor as string,
        themeLogoUrl: data.themeLogoUrl ?? null,
        allowedOrigins: data.allowedOrigins ?? [],
        enabledCalculators: data.enabledCalculators ?? [],
        status: (data.status as FakeWidgetRow['status']) ?? 'ACTIVE',
        configVersion: data.configVersion ?? 1,
        createdAt: now(),
        updatedAt: now(),
      };
      this.widgets.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
      select,
    }: {
      where: { publicKey?: string; id?: string };
      select?: { allowedOrigins?: boolean; id?: boolean; organizationId?: boolean };
    }): Promise<unknown> => {
      const row = this.widgets.find((w) =>
        where.publicKey ? w.publicKey === where.publicKey : w.id === where.id,
      );
      if (!row) return Promise.resolve(null);
      if (!select) return Promise.resolve(row);
      const projected: Record<string, unknown> = {};
      for (const key of Object.keys(select) as Array<keyof FakeWidgetRow>) {
        projected[key] = row[key];
      }
      return Promise.resolve(projected);
    },
    findFirst: ({
      where,
    }: {
      where: { id: string; organizationId: string };
    }): Promise<FakeWidgetRow | null> => {
      const row = this.widgets.find(
        (w) => w.id === where.id && w.organizationId === where.organizationId,
      );
      return Promise.resolve(row ?? null);
    },
    findMany: ({
      where,
      take,
      skip,
    }: {
      where: { organizationId: string };
      orderBy?: unknown;
      take?: number;
      skip?: number;
    }): Promise<FakeWidgetRow[]> => {
      const rows = this.widgets
        .filter((w) => w.organizationId === where.organizationId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const start = skip ?? 0;
      const end = take !== undefined ? start + take : undefined;
      return Promise.resolve(rows.slice(start, end));
    },
    count: ({ where }: { where: { organizationId: string } }): Promise<number> =>
      Promise.resolve(this.widgets.filter((w) => w.organizationId === where.organizationId).length),
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Omit<Partial<FakeWidgetRow>, 'configVersion'> & {
        configVersion?: { increment: number } | number;
      };
    }): Promise<FakeWidgetRow> => {
      const row = this.widgets.find((w) => w.id === where.id);
      if (!row) throw new Error('widget not found');
      const { configVersion, ...rest } = data;
      Object.assign(row, rest, { updatedAt: now() });
      if (configVersion !== undefined) {
        row.configVersion =
          typeof configVersion === 'object'
            ? row.configVersion + configVersion.increment
            : configVersion;
      }
      return Promise.resolve(row);
    },
  };

  attributionEvent = {
    create: ({
      data,
    }: {
      data: Partial<FakeAttributionEventRow>;
    }): Promise<FakeAttributionEventRow> => {
      const row: FakeAttributionEventRow = {
        id: randomUUID(),
        widgetId: data.widgetId as string,
        organizationId: data.organizationId as string,
        eventType: data.eventType as FakeAttributionEventRow['eventType'],
        campaign: data.campaign ?? null,
        source: data.source ?? null,
        landingPath: data.landingPath ?? null,
        occurredAt: now(),
      };
      this.attributionEvents.push(row);
      return Promise.resolve(row);
    },
    groupBy: ({
      where,
    }: {
      by: string[];
      where: { organizationId: string; occurredAt?: { gte: Date } };
      _count: { _all: boolean };
    }): Promise<Array<{ widgetId: string; eventType: string; _count: { _all: number } }>> => {
      const matching = this.attributionEvents.filter(
        (e) =>
          e.organizationId === where.organizationId &&
          (!where.occurredAt || e.occurredAt >= where.occurredAt.gte),
      );
      const counts = new Map<string, { widgetId: string; eventType: string; count: number }>();
      for (const event of matching) {
        const key = `${event.widgetId}::${event.eventType}`;
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { widgetId: event.widgetId, eventType: event.eventType, count: 1 });
        }
      }
      return Promise.resolve(
        [...counts.values()].map((c) => ({
          widgetId: c.widgetId,
          eventType: c.eventType,
          _count: { _all: c.count },
        })),
      );
    },
  };

  disclosureVersion = {
    create: ({
      data,
    }: {
      data: Partial<FakeDisclosureVersionRow>;
    }): Promise<FakeDisclosureVersionRow> => {
      if (
        this.disclosureVersions.some(
          (d) =>
            d.purpose === data.purpose && d.locale === data.locale && d.version === data.version,
        )
      ) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: FakeDisclosureVersionRow = {
        id: randomUUID(),
        purpose: data.purpose as string,
        locale: data.locale as string,
        version: data.version as number,
        content: data.content as string,
        contentHash: data.contentHash as string,
        reviewStatus: (data.reviewStatus as string) ?? 'PENDING_COUNSEL_REVIEW',
        publishedAt: data.publishedAt ?? null,
        retiredAt: data.retiredAt ?? null,
        createdAt: now(),
      };
      this.disclosureVersions.push(row);
      return Promise.resolve(row);
    },
    findFirst: ({
      where,
      orderBy,
    }: {
      where: { purpose: string; locale: string; publishedAt?: { not: null }; retiredAt?: null };
      orderBy?: { version?: 'asc' | 'desc' };
    }): Promise<FakeDisclosureVersionRow | null> => {
      let rows = this.disclosureVersions.filter(
        (d) =>
          d.purpose === where.purpose &&
          d.locale === where.locale &&
          (!where.publishedAt || d.publishedAt !== null) &&
          (where.retiredAt === undefined || d.retiredAt === where.retiredAt),
      );
      const direction = orderBy?.version === 'asc' ? 1 : -1;
      rows = rows.sort((a, b) => direction * (a.version - b.version));
      return Promise.resolve(rows[0] ?? null);
    },
  };

  lead = {
    create: ({ data }: { data: Partial<FakeLeadRow> }): Promise<FakeLeadRow> => {
      const row: FakeLeadRow = {
        id: randomUUID(),
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        emailMatchToken: data.emailMatchToken ?? null,
        phoneMatchToken: data.phoneMatchToken ?? null,
        status: (data.status as string) ?? 'NEW',
        sourceWidgetId: data.sourceWidgetId as string,
        sourceOrganizationId: data.sourceOrganizationId as string,
        purchaseIntentTimeline: data.purchaseIntentTimeline ?? null,
        purchaseIntentState: data.purchaseIntentState ?? null,
        purchaseIntentZip: data.purchaseIntentZip ?? null,
        purchaseIntentPriceMin: data.purchaseIntentPriceMin ?? null,
        purchaseIntentPriceMax: data.purchaseIntentPriceMax ?? null,
        purchaseIntentBuyerStatus: data.purchaseIntentBuyerStatus ?? null,
        retentionUntil: data.retentionUntil ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      this.leads.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({ where }: { where: { id: string } }): Promise<FakeLeadRow | null> =>
      Promise.resolve(this.leads.find((l) => l.id === where.id) ?? null),
    findFirst: ({
      where,
    }: {
      where: {
        sourceOrganizationId?: string;
        id?: string | { in: string[] };
        OR?: Array<{ emailMatchToken?: string; phoneMatchToken?: string }>;
      };
    }): Promise<FakeLeadRow | null> => {
      const row = this.leads.find((l) => {
        if (
          where.sourceOrganizationId !== undefined &&
          l.sourceOrganizationId !== where.sourceOrganizationId
        )
          return false;
        if (where.OR && where.OR.length > 0) {
          const matchesOr = where.OR.some(
            (clause) =>
              (clause.emailMatchToken !== undefined &&
                l.emailMatchToken === clause.emailMatchToken) ||
              (clause.phoneMatchToken !== undefined &&
                l.phoneMatchToken === clause.phoneMatchToken),
          );
          if (!matchesOr) return false;
        }
        return true;
      });
      return Promise.resolve(row ?? null);
    },
    findMany: ({
      where,
      take,
      skip,
    }: {
      where: { id?: { in: string[] } };
      orderBy?: unknown;
      take?: number;
      skip?: number;
    }): Promise<FakeLeadRow[]> => {
      let rows = this.leads.filter((l) => !where.id || where.id.in.includes(l.id));
      rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const start = skip ?? 0;
      const end = take !== undefined ? start + take : undefined;
      return Promise.resolve(rows.slice(start, end));
    },
    count: ({ where }: { where: { id?: { in: string[] } } }): Promise<number> =>
      Promise.resolve(this.leads.filter((l) => !where.id || where.id.in.includes(l.id)).length),
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeLeadRow>;
    }): Promise<FakeLeadRow> => {
      const row = this.leads.find((l) => l.id === where.id);
      if (!row) throw new Error('lead not found');
      Object.assign(row, data, { updatedAt: now() });
      return Promise.resolve(row);
    },
  };

  leadRelationship = {
    create: ({
      data,
    }: {
      data: Partial<FakeLeadRelationshipRow>;
    }): Promise<FakeLeadRelationshipRow> => {
      const row: FakeLeadRelationshipRow = {
        id: randomUUID(),
        leadId: data.leadId as string,
        organizationId: data.organizationId as string,
        relationshipType: (data.relationshipType as string) ?? 'SOURCE_ORGANIZATION',
        createdAt: now(),
      };
      if (
        this.leadRelationships.some(
          (r) =>
            r.leadId === row.leadId &&
            r.organizationId === row.organizationId &&
            r.relationshipType === row.relationshipType,
        )
      ) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      this.leadRelationships.push(row);
      return Promise.resolve(row);
    },
    findFirst: ({
      where,
    }: {
      where: { leadId: string; organizationId: string; relationshipType: string };
    }): Promise<FakeLeadRelationshipRow | null> =>
      Promise.resolve(
        this.leadRelationships.find(
          (r) =>
            r.leadId === where.leadId &&
            r.organizationId === where.organizationId &&
            r.relationshipType === where.relationshipType,
        ) ?? null,
      ),
    findMany: ({
      where,
    }: {
      where: { organizationId: string };
    }): Promise<Array<{ leadId: string }>> =>
      Promise.resolve(
        this.leadRelationships
          .filter((r) => r.organizationId === where.organizationId)
          .map((r) => ({ leadId: r.leadId })),
      ),
  };

  consentRecord = {
    create: ({ data }: { data: Partial<FakeConsentRecordRow> }): Promise<FakeConsentRecordRow> => {
      const row: FakeConsentRecordRow = {
        id: randomUUID(),
        leadId: data.leadId as string,
        disclosureVersionId: data.disclosureVersionId as string,
        purpose: data.purpose as string,
        channel: data.channel as string,
        recipientScope: data.recipientScope ?? null,
        userAction: (data.userAction as string) ?? 'GRANTED',
        capturedAt: now(),
        sourceWidgetId: data.sourceWidgetId as string,
        correlationId: data.correlationId as string,
        evidenceMetadata: data.evidenceMetadata ?? null,
        revokedAt: null,
        revokedReason: null,
      };
      this.consentRecords.push(row);
      return Promise.resolve(row);
    },
    findFirst: ({
      where,
    }: {
      where: { leadId: string; purpose?: string; revokedAt: null };
    }): Promise<FakeConsentRecordRow | null> =>
      Promise.resolve(
        this.consentRecords.find(
          (c) =>
            c.leadId === where.leadId &&
            (where.purpose === undefined || c.purpose === where.purpose) &&
            c.revokedAt === where.revokedAt,
        ) ?? null,
      ),
    findMany: ({
      where,
    }: {
      where: { leadId: { in: string[] }; revokedAt: null };
    }): Promise<Array<{ leadId: string; purpose: string }>> =>
      Promise.resolve(
        this.consentRecords
          .filter((c) => where.leadId.in.includes(c.leadId) && c.revokedAt === where.revokedAt)
          .map((c) => ({ leadId: c.leadId, purpose: c.purpose })),
      ),
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeConsentRecordRow>;
    }): Promise<FakeConsentRecordRow> => {
      const row = this.consentRecords.find((c) => c.id === where.id);
      if (!row) throw new Error('consent record not found');
      Object.assign(row, data);
      return Promise.resolve(row);
    },
  };

  leadEvent = {
    create: ({ data }: { data: Partial<FakeLeadEventRow> }): Promise<FakeLeadEventRow> => {
      const row: FakeLeadEventRow = {
        id: randomUUID(),
        leadId: data.leadId as string,
        eventType: data.eventType as string,
        actorType: (data.actorType as string) ?? 'SYSTEM',
        correlationId: data.correlationId as string,
        metadata: data.metadata ?? null,
        occurredAt: now(),
      };
      this.leadEvents.push(row);
      return Promise.resolve(row);
    },
  };

  suppressionRecord = {
    create: ({
      data,
    }: {
      data: Partial<FakeSuppressionRecordRow>;
    }): Promise<FakeSuppressionRecordRow> => {
      const row: FakeSuppressionRecordRow = {
        id: randomUUID(),
        matchToken: data.matchToken as string,
        purpose: data.purpose as string,
        channel: data.channel as string,
        reason: (data.reason as string) ?? 'SEED_PLACEHOLDER',
        source: data.source as string,
        createdAt: now(),
      };
      this.suppressionRecords.push(row);
      return Promise.resolve(row);
    },
    findFirst: ({
      where,
    }: {
      where: { matchToken: string; purpose: string; channel: string };
    }): Promise<{ id: string } | null> => {
      const row = this.suppressionRecords.find(
        (s) =>
          s.matchToken === where.matchToken &&
          s.purpose === where.purpose &&
          s.channel === where.channel,
      );
      return Promise.resolve(row ? { id: row.id } : null);
    },
  };

  leadIdempotencyKey = {
    create: ({
      data,
    }: {
      data: Partial<FakeLeadIdempotencyKeyRow>;
    }): Promise<FakeLeadIdempotencyKeyRow> => {
      if (
        this.leadIdempotencyKeys.some(
          (k) => k.widgetId === data.widgetId && k.idempotencyKey === data.idempotencyKey,
        )
      ) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: FakeLeadIdempotencyKeyRow = {
        id: randomUUID(),
        widgetId: data.widgetId as string,
        idempotencyKey: data.idempotencyKey as string,
        requestHash: data.requestHash as string,
        leadId: data.leadId ?? null,
        responseSnapshot: data.responseSnapshot,
        createdAt: now(),
      };
      this.leadIdempotencyKeys.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
    }: {
      where: { widgetId_idempotencyKey: { widgetId: string; idempotencyKey: string } };
    }): Promise<FakeLeadIdempotencyKeyRow | null> => {
      const { widgetId, idempotencyKey } = where.widgetId_idempotencyKey;
      const row = this.leadIdempotencyKeys.find(
        (k) => k.widgetId === widgetId && k.idempotencyKey === idempotencyKey,
      );
      return Promise.resolve(row ?? null);
    },
  };

  // --- Phase 6 fakes (apps/api/src/delivery/*) ---

  lender = {
    create: ({ data }: { data: Partial<FakeLenderRow> }): Promise<FakeLenderRow> => {
      const id = data.id ?? randomUUID();
      if (this.lenders.some((l) => l.id === id || l.organizationId === data.organizationId)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: FakeLenderRow = {
        id,
        organizationId: data.organizationId as string,
        displayName: data.displayName as string,
        status: (data.status as string) ?? 'ACTIVE',
        integrationMode: (data.integrationMode as string) ?? 'MOCK',
        contractApprovedAt: data.contractApprovedAt ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      this.lenders.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
    }: {
      where: { id?: string; organizationId?: string };
    }): Promise<FakeLenderRow | null> =>
      Promise.resolve(
        this.lenders.find((l) =>
          where.id !== undefined ? l.id === where.id : l.organizationId === where.organizationId,
        ) ?? null,
      ),
  };

  routingPolicy = {
    create: ({ data }: { data: Partial<FakeRoutingPolicyRow> }): Promise<FakeRoutingPolicyRow> => {
      const id = data.id ?? randomUUID();
      if (this.routingPolicies.some((p) => p.id === id)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: FakeRoutingPolicyRow = {
        id,
        lenderId: data.lenderId as string,
        strategy: (data.strategy as string) ?? 'EXCLUSIVE',
        eligibilityConditions: data.eligibilityConditions,
        priority: data.priority ?? 0,
        status: (data.status as string) ?? 'ACTIVE',
        version: data.version ?? 1,
        activeFrom: data.activeFrom ?? null,
        activeUntil: data.activeUntil ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      this.routingPolicies.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({ where }: { where: { id: string } }): Promise<FakeRoutingPolicyRow | null> =>
      Promise.resolve(this.routingPolicies.find((p) => p.id === where.id) ?? null),
    findMany: ({
      where,
    }: {
      where: { status: string };
      include?: { lender: true };
      orderBy?: Array<{ priority?: 'asc' | 'desc' } | { createdAt?: 'asc' | 'desc' }>;
    }): Promise<Array<FakeRoutingPolicyRow & { lender: FakeLenderRow }>> => {
      let rows = this.routingPolicies.filter((p) => p.status === where.status);
      // Matches RoutingService's own orderBy: [{priority: 'desc'}, {createdAt: 'asc'}].
      rows = rows
        .slice()
        .sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());
      return Promise.resolve(
        rows.map((p) => ({ ...p, lender: this.lenders.find((l) => l.id === p.lenderId)! })),
      );
    },
  };

  routingAttempt = {
    create: ({
      data,
    }: {
      data: Partial<FakeRoutingAttemptRow>;
    }): Promise<FakeRoutingAttemptRow> => {
      const row: FakeRoutingAttemptRow = {
        id: randomUUID(),
        leadId: data.leadId as string,
        routingPolicyId: data.routingPolicyId ?? null,
        policyVersion: data.policyVersion ?? null,
        lenderId: data.lenderId ?? null,
        status: (data.status as string) ?? 'PENDING',
        failureReason: data.failureReason ?? null,
        idempotencyKey: data.idempotencyKey as string,
        correlationId: data.correlationId as string,
        createdAt: now(),
        completedAt: data.completedAt ?? null,
      };
      this.routingAttempts.push(row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeRoutingAttemptRow>;
    }): Promise<FakeRoutingAttemptRow> => {
      const row = this.routingAttempts.find((r) => r.id === where.id);
      if (!row) throw new Error('routing attempt not found');
      Object.assign(row, data);
      return Promise.resolve(row);
    },
  };

  leadDelivery = {
    create: ({ data }: { data: Partial<FakeLeadDeliveryRow> }): Promise<FakeLeadDeliveryRow> => {
      if (
        this.leadDeliveries.some(
          (d) =>
            d.routingAttemptId === data.routingAttemptId ||
            d.idempotencyKey === data.idempotencyKey,
        )
      ) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: FakeLeadDeliveryRow = {
        id: randomUUID(),
        leadId: data.leadId as string,
        lenderId: data.lenderId as string,
        routingAttemptId: data.routingAttemptId as string,
        status: (data.status as string) ?? 'PENDING',
        payloadVersion: data.payloadVersion as number,
        idempotencyKey: data.idempotencyKey as string,
        requestHash: data.requestHash as string,
        attemptedAt: now(),
        acknowledgedAt: data.acknowledgedAt ?? null,
        lenderAcknowledgedAt: data.lenderAcknowledgedAt ?? null,
        errorCode: data.errorCode ?? null,
        providerCorrelationId: data.providerCorrelationId ?? null,
        retryCount: data.retryCount ?? 0,
        createdAt: now(),
        updatedAt: now(),
      };
      this.leadDeliveries.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
    }: {
      where: { id?: string; idempotencyKey?: string };
    }): Promise<FakeLeadDeliveryRow | null> =>
      Promise.resolve(
        this.leadDeliveries.find((d) =>
          where.id !== undefined ? d.id === where.id : d.idempotencyKey === where.idempotencyKey,
        ) ?? null,
      ),
    findFirst: ({
      where,
    }: {
      where: { id: string; lenderId: string };
    }): Promise<(FakeLeadDeliveryRow & { lead: FakeLeadRow }) | null> => {
      const row = this.leadDeliveries.find(
        (d) => d.id === where.id && d.lenderId === where.lenderId,
      );
      if (!row) return Promise.resolve(null);
      const lead = this.leads.find((l) => l.id === row.leadId)!;
      return Promise.resolve({ ...row, lead });
    },
    findMany: ({
      where,
      take,
      skip,
    }: {
      where: { lenderId: string };
      orderBy?: unknown;
      take?: number;
      skip?: number;
      include?: unknown;
    }): Promise<Array<FakeLeadDeliveryRow & { lead: FakeLeadRow }>> => {
      const rows = this.leadDeliveries
        .filter((d) => d.lenderId === where.lenderId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const start = skip ?? 0;
      const end = take !== undefined ? start + take : undefined;
      return Promise.resolve(
        rows.slice(start, end).map((row) => ({
          ...row,
          lead: this.leads.find((l) => l.id === row.leadId)!,
        })),
      );
    },
    count: ({ where }: { where: { lenderId: string } }): Promise<number> =>
      Promise.resolve(this.leadDeliveries.filter((d) => d.lenderId === where.lenderId).length),
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeLeadDeliveryRow>;
    }): Promise<FakeLeadDeliveryRow> => {
      const row = this.leadDeliveries.find((d) => d.id === where.id);
      if (!row) throw new Error('lead delivery not found');
      Object.assign(row, data, { updatedAt: now() });
      return Promise.resolve(row);
    },
  };

  billingEntry = {
    create: ({ data }: { data: Partial<FakeBillingEntryRow> }): Promise<FakeBillingEntryRow> => {
      if (this.billingEntries.some((b) => b.leadDeliveryId === data.leadDeliveryId)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row: FakeBillingEntryRow = {
        id: randomUUID(),
        leadDeliveryId: data.leadDeliveryId as string,
        eventType: (data.eventType as string) ?? 'LEAD_DELIVERY_FEE',
        amountCents: data.amountCents as number,
        currency: (data.currency as string) ?? 'USD',
        status: (data.status as string) ?? 'POSTED',
        externalReference: data.externalReference ?? null,
        createdAt: now(),
      };
      this.billingEntries.push(row);
      return Promise.resolve(row);
    },
    findUnique: ({
      where,
    }: {
      where: { leadDeliveryId: string };
    }): Promise<FakeBillingEntryRow | null> =>
      Promise.resolve(
        this.billingEntries.find((b) => b.leadDeliveryId === where.leadDeliveryId) ?? null,
      ),
  };

  qualificationRecord = {
    create: ({
      data,
    }: {
      data: Partial<FakeQualificationRecordRow>;
    }): Promise<FakeQualificationRecordRow> => {
      const row: FakeQualificationRecordRow = {
        id: randomUUID(),
        leadId: data.leadId as string,
        type: data.type as string,
        provider: data.provider as string,
        status: data.status as string,
        requestedAt: now(),
        completedAt: data.completedAt ?? null,
        resultSummary: data.resultSummary ?? null,
        correlationId: data.correlationId as string,
      };
      this.qualificationRecords.push(row);
      return Promise.resolve(row);
    },
  };
}
