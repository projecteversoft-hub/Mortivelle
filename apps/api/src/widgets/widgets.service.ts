import { Injectable, NotFoundException } from '@nestjs/common';
import type { Widget as WidgetRow } from '@prisma/client';
import {
  CalculatorType,
  DEFAULT_WIDGET_THEME,
  type CreateWidgetRequest,
  type PaginatedResult,
  type PaginationQuery,
  type PublicWidgetConfigResponse,
  type ReportsSummaryResponse,
  type UpdateWidgetRequest,
  type WidgetResponse,
} from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TenantScopedService } from '../common/tenant-scoped.service';
import { generateWidgetPublicKey } from './widget-keys';
import { fromPrismaAttributionEventType } from './attribution-event-mapping';

export interface UpdateWidgetResult {
  widget: WidgetResponse;
  /** Which top-level fields actually changed, for precise audit-action naming. */
  changedFields: Array<'name' | 'theme' | 'allowedOrigins' | 'enabledCalculators' | 'status'>;
}

function toWidgetResponse(row: WidgetRow): WidgetResponse {
  return {
    id: row.id,
    organizationId: row.organizationId,
    publicKey: row.publicKey,
    name: row.name,
    theme: {
      primaryColor: row.themePrimaryColor,
      ...(row.themeLogoUrl ? { logoUrl: row.themeLogoUrl } : {}),
    },
    allowedOrigins: row.allowedOrigins,
    enabledCalculators: row.enabledCalculators as CalculatorType[],
    status: row.status,
    configVersion: row.configVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPublicConfigResponse(row: WidgetRow): PublicWidgetConfigResponse {
  return {
    name: row.name,
    theme: {
      primaryColor: row.themePrimaryColor,
      ...(row.themeLogoUrl ? { logoUrl: row.themeLogoUrl } : {}),
    },
    enabledCalculators: row.enabledCalculators as CalculatorType[],
    status: row.status,
    configVersion: row.configVersion,
  };
}

/**
 * Tenant-scoped widget configuration service (docs/02 §4, CLAUDE.md §4). Every
 * agent-authenticated read/write goes through `scopedWhere`/an explicit `organizationId`
 * filter, so a widget belonging to another organization can never be read or mutated even
 * by guessing/knowing its real UUID (docs/06 §8, docs/11 §5 mandatory IDOR suite).
 *
 * The public, unauthenticated lookups (`getPublicConfigByPublicKey`,
 * `getAllowedOriginsByPublicKey`) are intentionally NOT organization-scoped -- an anonymous
 * visitor identifies a widget only by its non-secret public key (docs/06 §4), never by an
 * organization ID.
 */
@Injectable()
export class WidgetsService extends TenantScopedService {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForOrganization(
    organizationId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<WidgetResponse>> {
    const where = this.scopedWhere(organizationId, {});
    const [rows, total] = await Promise.all([
      this.prisma.widget.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pagination.limit,
        skip: pagination.offset,
      }),
      this.prisma.widget.count({ where }),
    ]);
    return {
      items: rows.map(toWidgetResponse),
      total,
      limit: pagination.limit,
      offset: pagination.offset,
    };
  }

  async createForOrganization(
    organizationId: string,
    input: CreateWidgetRequest,
  ): Promise<WidgetResponse> {
    const theme = input.theme ?? DEFAULT_WIDGET_THEME;
    const row = await this.prisma.widget.create({
      data: {
        organizationId,
        publicKey: await this.generateUniquePublicKey(),
        name: input.name,
        themePrimaryColor: theme.primaryColor,
        themeLogoUrl: theme.logoUrl ?? null,
        allowedOrigins: input.allowedOrigins,
        enabledCalculators: input.enabledCalculators,
        configVersion: 1,
      },
    });
    return toWidgetResponse(row);
  }

  async updateForOrganization(
    organizationId: string,
    id: string,
    patch: UpdateWidgetRequest,
  ): Promise<UpdateWidgetResult> {
    const existing = await this.prisma.widget.findFirst({
      where: this.scopedWhere(organizationId, { id }),
    });
    // Same response (404) whether the widget never existed or belongs to another tenant --
    // never confirms or denies another tenant's widget ID (docs/02 §3-4, mirrors TenantGuard).
    if (!existing) {
      throw new NotFoundException();
    }

    const changedFields: UpdateWidgetResult['changedFields'] = [];
    if (patch.name !== undefined && patch.name !== existing.name) changedFields.push('name');
    if (patch.theme !== undefined) changedFields.push('theme');
    if (patch.allowedOrigins !== undefined) changedFields.push('allowedOrigins');
    if (patch.enabledCalculators !== undefined) changedFields.push('enabledCalculators');
    if (patch.status !== undefined && patch.status !== existing.status)
      changedFields.push('status');

    if (changedFields.length === 0) {
      // Nothing actually changed (e.g. re-submitting the same status); do not burn a config
      // version or write an audit event for a no-op.
      return { widget: toWidgetResponse(existing), changedFields: [] };
    }

    const row = await this.prisma.widget.update({
      where: { id: existing.id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.theme !== undefined
          ? {
              themePrimaryColor: patch.theme.primaryColor,
              themeLogoUrl: patch.theme.logoUrl ?? null,
            }
          : {}),
        ...(patch.allowedOrigins !== undefined ? { allowedOrigins: patch.allowedOrigins } : {}),
        ...(patch.enabledCalculators !== undefined
          ? { enabledCalculators: patch.enabledCalculators }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        configVersion: { increment: 1 },
      },
    });
    return { widget: toWidgetResponse(row), changedFields };
  }

  async getPublicConfigByPublicKey(publicKey: string): Promise<PublicWidgetConfigResponse> {
    const row = await this.prisma.widget.findUnique({ where: { publicKey } });
    // Generic 404 regardless of why the key doesn't resolve -- never confirms whether a
    // given key was ever valid (docs/06 §4).
    if (!row) throw new NotFoundException();
    return toPublicConfigResponse(row);
  }

  /** Lightweight lookup for the per-widget CORS delegate (apps/api/src/widgets/public-widget-cors.ts). */
  async getAllowedOriginsByPublicKey(publicKey: string): Promise<string[] | null> {
    const row = await this.prisma.widget.findUnique({
      where: { publicKey },
      select: { allowedOrigins: true },
    });
    return row?.allowedOrigins ?? null;
  }

  /** Lookup used by AttributionService to resolve+validate the widget named in an event body. */
  async findByPublicKeyForAttribution(
    publicKey: string,
  ): Promise<{ id: string; organizationId: string; allowedOrigins: string[] } | null> {
    const row = await this.prisma.widget.findUnique({
      where: { publicKey },
      select: { id: true, organizationId: true, allowedOrigins: true },
    });
    return row;
  }

  /** Lookup used by LeadsService to resolve+validate the widget named in a lead submission
   * (docs/04 §3, docs/06 §8 "Paused widgets stop new lead capture"). */
  async findByPublicKeyForLeadIntake(publicKey: string): Promise<{
    id: string;
    organizationId: string;
    status: WidgetRow['status'];
    allowedOrigins: string[];
  } | null> {
    const row = await this.prisma.widget.findUnique({
      where: { publicKey },
      select: { id: true, organizationId: true, status: true, allowedOrigins: true },
    });
    return row;
  }

  async reportsSummary(
    organizationId: string,
    windowDays: number,
  ): Promise<ReportsSummaryResponse> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const widgets = await this.prisma.widget.findMany({
      where: this.scopedWhere(organizationId, {}),
      select: { id: true, name: true },
    });
    const widgetNameById = new Map(widgets.map((w) => [w.id, w.name]));

    if (widgets.length === 0) {
      return { windowDays, totalEvents: 0, rows: [] };
    }

    const grouped = await this.prisma.attributionEvent.groupBy({
      by: ['widgetId', 'eventType'],
      where: this.scopedWhere(organizationId, { occurredAt: { gte: since } }),
      _count: { _all: true },
    });

    const rows = grouped
      .map((g) => ({
        widgetId: g.widgetId,
        widgetName: widgetNameById.get(g.widgetId) ?? 'Unknown widget',
        eventType: fromPrismaAttributionEventType(g.eventType),
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    const totalEvents = rows.reduce((sum, r) => sum + r.count, 0);
    return { windowDays, totalEvents, rows };
  }

  /** Public keys are generated client-side-random but checked for uniqueness server-side
   * before insert, so a (statistically negligible, but non-zero) collision retries rather
   * than ever surfacing a raw unique-constraint database error to the caller. */
  private async generateUniquePublicKey(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateWidgetPublicKey();
      const existing = await this.prisma.widget.findUnique({
        where: { publicKey: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    throw new Error('Failed to generate a unique widget public key after 5 attempts');
  }
}
