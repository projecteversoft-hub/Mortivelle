import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ConsentPurpose,
  DISCLOSURE_LOCALE,
  DISCLOSURE_VERSION,
  ErrorCode,
  SYNTHETIC_DISCLOSURE_TEXT,
  sha256Hex,
} from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/domain-exception';
import { HttpStatus } from '@nestjs/common';

export interface ActiveDisclosureVersion {
  id: string;
  purpose: ConsentPurpose;
  locale: string;
  version: number;
  content: string;
  contentHash: string;
}

/**
 * Disclosure versioning (docs/07 §3-4, docs/11 §6). There is no documented authoring/
 * approval API in Phase 5's task list, so this service seeds a small, FIXED, SYNTHETIC
 * placeholder set on boot (`onModuleInit`) -- one published version per purpose -- instead of
 * a separate seed script, so a fresh dev/test database is always immediately usable without
 * an extra manual step. The seed is idempotent (guarded by the `[purpose, locale, version]`
 * unique constraint) and safe to run every time the app starts, including under concurrent
 * instances (a unique-constraint race is treated as "already seeded by someone else").
 *
 * LEGAL NOTICE (CLAUDE.md §4, docs/07 §1): `SYNTHETIC_DISCLOSURE_TEXT` (packages/shared/src/
 * leads.ts) is placeholder copy only -- NOT legal advice, NOT reviewed or approved by
 * qualified US counsel. `reviewStatus` is recorded as `PENDING_COUNSEL_REVIEW` for every
 * seeded row and is informational only in Phase 5 (no hard gate reads it yet) -- see the
 * Phase 5 final report's residual risks.
 *
 * `getActiveVersion` is the ONLY path the rest of the API uses to resolve "the current
 * disclosure for purpose X" -- a client can never name a version; the server always resolves
 * it itself (docs/04 §3, docs/07 §4).
 */
@Injectable()
export class DisclosuresService implements OnModuleInit {
  private readonly logger = new Logger(DisclosuresService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    for (const purpose of Object.values(ConsentPurpose)) {
      await this.ensureSeeded(purpose);
    }
  }

  private async ensureSeeded(purpose: ConsentPurpose): Promise<void> {
    const content = SYNTHETIC_DISCLOSURE_TEXT[purpose];
    const contentHash = await sha256Hex(content);
    try {
      await this.prisma.disclosureVersion.create({
        data: {
          purpose,
          locale: DISCLOSURE_LOCALE,
          version: DISCLOSURE_VERSION,
          content,
          contentHash,
          publishedAt: new Date(),
        },
      });
      this.logger.log(`Seeded synthetic placeholder disclosure version for purpose ${purpose}`);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Already seeded (this boot or a concurrent instance) -- not an error.
        return;
      }
      throw error;
    }
  }

  /** Resolves the currently active (published, not retired) disclosure version for a purpose.
   * Throws a safe, fixed error if none exists -- this should only happen if the seed above
   * somehow never ran. Never accepts a client-supplied version identifier (docs/04 §3). */
  async getActiveVersion(purpose: ConsentPurpose): Promise<ActiveDisclosureVersion> {
    const row = await this.prisma.disclosureVersion.findFirst({
      where: { purpose, locale: DISCLOSURE_LOCALE, publishedAt: { not: null }, retiredAt: null },
      orderBy: { version: 'desc' },
    });
    if (!row) {
      this.logger.error(`No active disclosure version found for purpose ${purpose}`);
      throw new DomainException(ErrorCode.ServiceUnavailable, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      id: row.id,
      purpose: row.purpose,
      locale: row.locale,
      version: row.version,
      content: row.content,
      contentHash: row.contentHash,
    };
  }
}
