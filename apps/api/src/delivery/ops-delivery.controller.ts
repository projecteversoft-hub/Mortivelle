import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  leadIdParamSchema,
  deliveryIdParamSchema,
  qualifyLeadResponseSchema,
  reconcileDeliveryRequestSchema,
  reconcileDeliveryResponseSchema,
  Role,
  routeLeadRequestSchema,
  routeLeadResponseSchema,
  type QualifyLeadResponse,
  type ReconcileDeliveryRequest,
  type ReconcileDeliveryResponse,
  type RouteLeadRequest,
  type RouteLeadResponse,
} from '@tech-realty-rentals/shared';
import { AuthGuard } from '../tenancy/auth.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RolesGuard } from '../tenancy/roles.guard';
import { Roles } from '../tenancy/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { QualificationService } from './qualification.service';
import { RoutingService } from './routing.service';
import { DeliveryService } from './delivery.service';

/**
 * Minimal internal operator trigger surface (docs/04 §2 "ops" group; see the long comment in
 * packages/shared/src/delivery.ts above these three endpoints' schemas for why this exists).
 * `PLATFORM_ADMIN`-only — never exposed to agent/lender roles. Every action is high-risk
 * (docs/02 §6: "lead delivery", "routing configuration") and audited inside the called
 * service (`QualificationService`/`RoutingService`/`DeliveryService`), not duplicated here.
 *
 * This is explicitly NOT the lender-facing surface (that is `LenderDeliveriesController`) and
 * explicitly NOT a routing-policy authoring UI (none exists in Phase 6 — synthetic seed only,
 * see `LenderCatalogSeedService`).
 */
@Controller('ops')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class OpsDeliveryController {
  constructor(
    private readonly qualification: QualificationService,
    private readonly routing: RoutingService,
    private readonly delivery: DeliveryService,
  ) {}

  @Post('leads/:id/qualify')
  @Roles(Role.PlatformAdmin)
  async qualify(
    @Param('id', new ZodValidationPipe(leadIdParamSchema)) leadId: string,
    @Req() req: Request,
  ): Promise<QualifyLeadResponse> {
    const result = await this.qualification.qualify(leadId, req.requestId ?? 'unknown');
    return qualifyLeadResponseSchema.parse(result);
  }

  @Post('leads/:id/route')
  @Roles(Role.PlatformAdmin)
  async route(
    @Param('id', new ZodValidationPipe(leadIdParamSchema)) leadId: string,
    @Body(new ZodValidationPipe(routeLeadRequestSchema)) body: RouteLeadRequest,
    @Req() req: Request,
  ): Promise<RouteLeadResponse> {
    const result = await this.routing.routeEligibleLead(leadId, req.requestId ?? 'unknown', {
      simulateOutcome: body.simulateOutcome,
    });
    return routeLeadResponseSchema.parse(result);
  }

  @Post('deliveries/:id/reconcile')
  @Roles(Role.PlatformAdmin)
  async reconcile(
    @Param('id', new ZodValidationPipe(deliveryIdParamSchema)) deliveryId: string,
    @Body(new ZodValidationPipe(reconcileDeliveryRequestSchema)) body: ReconcileDeliveryRequest,
    @Req() req: Request,
  ): Promise<ReconcileDeliveryResponse> {
    const result = await this.delivery.reconcile(
      deliveryId,
      body.resolution,
      req.requestId ?? 'unknown',
    );
    return reconcileDeliveryResponseSchema.parse(result);
  }
}
