import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface RecordAuditEventInput {
  /** Null for actions with no resolved user yet (e.g. a login attempt with an unknown email). */
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  outcome: AuditOutcome;
  correlationId: string;
  /** Safe metadata only — never raw PII, secrets, tokens, credit info or full bodies. */
  metadata?: Record<string, unknown>;
}

/**
 * Defense-in-depth guard against accidentally audit-logging a sensitive value (docs/02 §6).
 * Services must already pass only safe fields; this additionally strips anything whose key
 * looks sensitive so a future mistake degrades to a dropped field, not a leaked one.
 */
const SENSITIVE_KEY_PATTERN =
  /password|token|secret|ssn|social_security|credit|bank|email|phone|authorization|cookie/i;

function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
  logger: Logger,
): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      logger.warn(`Dropped audit metadata field with a sensitive-looking key: "${key}"`);
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    }
    // Objects/arrays are intentionally dropped: audit metadata must stay flat and small.
  }
  return safe as Prisma.InputJsonValue;
}

/**
 * Audit-event foundation (docs/02 §6, docs/03 §2). Other modules call `record(...)` for
 * high-risk actions (auth, membership listing, etc.). Writing an audit event must never be
 * allowed to break the primary request flow, so failures are caught and logged here rather
 * than thrown — this is defense-in-depth logging, the authorization check itself always
 * still runs and is enforced independently by guards.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          actorUserId: input.actorUserId ?? null,
          organizationId: input.organizationId ?? null,
          action: input.action,
          resourceType: input.resourceType ?? null,
          resourceId: input.resourceId ?? null,
          outcome: input.outcome,
          correlationId: input.correlationId,
          metadata: sanitizeMetadata(input.metadata, this.logger),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist audit event "${input.action}": ${
          error instanceof Error ? error.name : 'unknown'
        }`,
      );
    }
  }
}
