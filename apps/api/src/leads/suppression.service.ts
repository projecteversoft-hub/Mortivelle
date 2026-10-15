import { Injectable } from '@nestjs/common';
import type { ConsentChannel, ConsentPurpose } from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Suppression checks (docs/07 §8, docs/03 §2 "Restrict access"). Lookups are by keyed-HMAC
 * match token only -- never by raw contact value (same discipline as lead dedup, docs/03
 * §5). Exposed as a narrow boolean check; nothing here ever returns the underlying
 * suppression record (reason/source) to a public caller.
 */
@Injectable()
export class SuppressionService {
  constructor(private readonly prisma: PrismaService) {}

  async isSuppressed(
    matchToken: string,
    purpose: ConsentPurpose,
    channel: ConsentChannel,
  ): Promise<boolean> {
    const row = await this.prisma.suppressionRecord.findFirst({
      where: { matchToken, purpose, channel },
      select: { id: true },
    });
    return row !== null;
  }
}
