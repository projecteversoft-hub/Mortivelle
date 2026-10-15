import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  submitLeadRequestSchema,
  type SubmitLeadRequest,
  type SubmitLeadResponse,
} from '@tech-realty-rentals/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LeadsService } from './leads.service';

/**
 * Public, unauthenticated lead capture (docs/04 §2-3, docs/08 §2). No `AuthGuard`/
 * `TenantGuard` — same public/rate-limited pattern as `PublicWidgetsController`/
 * `PublicAnalyticsController`, with its own named throttler bucket ("leads", registered in
 * ../rate-limit/rate-limit.module.ts).
 *
 * Always returns the same neutral `{ received: true }` shape on success (docs/08 §2) —
 * nothing here ever reveals whether the contact matched an existing lead, whether a purpose
 * was suppressed, or any other per-record detail.
 */
@Controller('public/leads')
@SkipThrottle({ auth: true, calculators: true, 'widget-config': true, analytics: true })
export class PublicLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  async submit(
    @Body(new ZodValidationPipe(submitLeadRequestSchema)) body: SubmitLeadRequest,
    @Req() req: Request,
  ): Promise<SubmitLeadResponse> {
    return this.leads.submit({
      body,
      correlationId: req.requestId ?? 'unknown',
      originHeader: req.header('origin') ?? req.header('referer') ?? null,
    });
  }
}
