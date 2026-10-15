import type { Lead as LeadRow, ConsentRecord as ConsentRecordRow } from '@prisma/client';
import { type AgentLeadSummary, maskEmail, maskPhone } from '@tech-realty-rentals/shared';

/**
 * Maps a `Lead` row (plus its currently-active, non-revoked consent purposes) to the
 * PII-minimized shape returned by `GET /api/v1/agent/leads` (docs/02 §3, docs/06 §6,
 * CLAUDE.md §4 "Use private-by-default access for lead records"). Raw `contactEmail`/
 * `contactPhone` never leave this mapping function — the response always carries the masked
 * forms only.
 */
export function toAgentLeadSummary(
  lead: LeadRow,
  activeConsentRecords: Pick<ConsentRecordRow, 'purpose'>[],
): AgentLeadSummary {
  return {
    id: lead.id,
    status: lead.status,
    maskedEmail: lead.contactEmail ? maskEmail(lead.contactEmail) : null,
    maskedPhone: lead.contactPhone ? maskPhone(lead.contactPhone) : null,
    activePurposes: [...new Set(activeConsentRecords.map((c) => c.purpose))],
    purchaseIntentTimeline:
      (lead.purchaseIntentTimeline as AgentLeadSummary['purchaseIntentTimeline']) ?? null,
    purchaseIntentState: lead.purchaseIntentState ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}
