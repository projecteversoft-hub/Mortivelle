import { Injectable } from '@nestjs/common';
import type { LeadStatus } from '@tech-realty-rentals/shared';
import { assertLeadTransitionAllowed } from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The ONLY path by which a `Lead.status` is ever written (docs/03 §3 "Status transitions are
 * validated in domain services, not left to arbitrary client input"; docs/08 §1). Every
 * transition is checked against `assertLeadTransitionAllowed`
 * (packages/shared/src/leads.ts) before the write, which rejects any attempt to reach a
 * Phase 6+ status (`ELIGIBLE`/`ROUTING`/`DELIVERED`/`ACCEPTED`/`REJECTED`) outright.
 */
@Injectable()
export class LeadLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async transition(
    leadId: string,
    from: LeadStatus,
    to: LeadStatus,
    correlationId: string,
  ): Promise<void> {
    assertLeadTransitionAllowed(from, to);
    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id: leadId }, data: { status: to } }),
      this.prisma.leadEvent.create({
        data: {
          leadId,
          eventType: 'STATUS_CHANGED',
          correlationId,
          metadata: { from, to },
        },
      }),
    ]);
  }
}
