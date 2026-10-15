import { Module } from '@nestjs/common';
import { WidgetsModule } from '../widgets/widgets.module';
import { PublicLeadsController } from './public-leads.controller';
import { AgentLeadsController } from './agent-leads.controller';
import { LeadsService } from './leads.service';
import { DisclosuresService } from './disclosures.service';
import { SuppressionService } from './suppression.service';
import { ConsentService } from './consent.service';
import { LeadLifecycleService } from './lead-lifecycle.service';

/**
 * Phase 5 — consent, lead capture and lead CRM (docs/11 §6). Imports `WidgetsModule` to reuse
 * `WidgetsService`'s widget resolution (same cross-module reuse pattern as Phase 4 reusing
 * nothing from Phase 3 — this is the first phase that actually needs another feature
 * module's service), so widget lookup/validation is never duplicated.
 */
@Module({
  imports: [WidgetsModule],
  controllers: [PublicLeadsController, AgentLeadsController],
  providers: [
    LeadsService,
    DisclosuresService,
    SuppressionService,
    ConsentService,
    LeadLifecycleService,
  ],
  // LeadLifecycleService is additionally exported starting Phase 6 (docs/11 §7) so
  // QualificationService/RoutingService/DeliveryService can reuse the SAME lifecycle domain
  // service — never a second, parallel way to write Lead.status.
  exports: [LeadsService, ConsentService, DisclosuresService, LeadLifecycleService],
})
export class LeadsModule {}
