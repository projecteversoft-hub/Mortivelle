import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ErrorCode,
  isOriginAllowed,
  type AttributionEventType,
  type RecordAttributionEventResponse,
} from '@tech-realty-rentals/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/domain-exception';
import { WidgetsService } from './widgets.service';
import { toPrismaAttributionEventType } from './attribution-event-mapping';

export interface RecordAttributionEventInput {
  widgetPublicKey: string;
  eventType: AttributionEventType;
  campaign?: string;
  source?: string;
  landingPath?: string;
  /** The request's `Origin` header, or `Referer`'s origin as a fallback. Null if neither is
   * present (e.g. a non-browser caller) -- see class doc for how that case is handled. */
  originHeader: string | null;
}

/**
 * Public, unauthenticated attribution-event recording (docs/06 §5, docs/03 §2). No
 * fingerprinting: nothing here captures a device/browser signature or a persistent
 * cross-site identifier, and every event is anonymous (no lead/user linkage exists in
 * Phase 4 -- leads do not exist until Phase 5).
 */
@Injectable()
export class AttributionService {
  private readonly logger = new Logger(AttributionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly widgets: WidgetsService,
  ) {}

  async recordEvent(input: RecordAttributionEventInput): Promise<RecordAttributionEventResponse> {
    const widget = await this.widgets.findByPublicKeyForAttribution(input.widgetPublicKey);
    // Same generic 404 as the public config endpoint -- never confirms whether a key is real.
    if (!widget) throw new NotFoundException();

    /**
     * Origin/Referer is validated as a defense-in-depth *signal*, not the sole authorization
     * control (docs/06 §4): a request that supplies an Origin not on the named widget's own
     * allowlist is rejected and logged (safe metadata only -- no PII, no raw header value in
     * the audit/application log beyond the widget/org IDs already known); a request with no
     * Origin/Referer at all (a non-browser caller, or a browser omitting it) is allowed
     * through, since the header's mere absence proves nothing either way.
     */
    if (input.originHeader && !isOriginAllowed(input.originHeader, widget.allowedOrigins)) {
      this.logger.warn(
        `Rejected attribution event for widget ${widget.id}: origin not on allowlist`,
      );
      throw new DomainException(ErrorCode.OriginNotAllowed, HttpStatus.FORBIDDEN);
    }

    await this.prisma.attributionEvent.create({
      data: {
        widgetId: widget.id,
        organizationId: widget.organizationId,
        eventType: toPrismaAttributionEventType(input.eventType),
        campaign: input.campaign ?? null,
        source: input.source ?? null,
        landingPath: input.landingPath ?? null,
        // occurredAt defaults to CURRENT_TIMESTAMP at the database -- never trust a client
        // timestamp (docs/06 §5); the request schema does not even accept one.
      },
    });

    return { recorded: true };
  }
}
