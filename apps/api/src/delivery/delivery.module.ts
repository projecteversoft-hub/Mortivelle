import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { LenderCatalogSeedService } from './lender-catalog-seed.service';
import { QualificationService } from './qualification.service';
import { RoutingService } from './routing.service';
import { DeliveryService } from './delivery.service';
import { BillingService } from './billing.service';
import { LEAD_DELIVERY_PROVIDER } from './providers/lead-delivery-provider';
import { MockLeadDeliveryProvider } from './providers/mock-lead-delivery.provider';
import { LenderDeliveriesController } from './lender-deliveries.controller';
import { OpsDeliveryController } from './ops-delivery.controller';

/**
 * Phase 6 — exclusive lender delivery, mock routing/delivery adapter and simulated billing
 * ledger (docs/11 §7). Imports `LeadsModule` to reuse `ConsentService`/`LeadLifecycleService`
 * (same cross-module reuse pattern `LeadsModule` itself used for `WidgetsService` in Phase 5)
 * — routing/delivery/qualification never duplicate consent-checking or status-transition
 * logic that already exists.
 *
 * `MockLeadDeliveryProvider` is bound to `LEAD_DELIVERY_PROVIDER` here — the ONE place in the
 * app that decides which concrete adapter implementation is wired in, same Symbol-token
 * pattern as `EMAIL_PROVIDER`/`LocalEmailProvider`. Real lender delivery remains disabled
 * unless separately authorized (CLAUDE.md, docs/11 Gate 6): there is no other
 * `LeadDeliveryProvider` implementation anywhere in this codebase to swap in.
 */
@Module({
  imports: [LeadsModule],
  controllers: [LenderDeliveriesController, OpsDeliveryController],
  providers: [
    LenderCatalogSeedService,
    QualificationService,
    RoutingService,
    DeliveryService,
    BillingService,
    { provide: LEAD_DELIVERY_PROVIDER, useClass: MockLeadDeliveryProvider },
  ],
  exports: [QualificationService, RoutingService, DeliveryService, BillingService],
})
export class DeliveryModule {}
