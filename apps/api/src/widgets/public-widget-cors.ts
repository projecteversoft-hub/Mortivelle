import { Logger } from '@nestjs/common';
import type {
  CorsOptions,
  CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';
import { isOriginAllowed, PUBLIC_KEY_PATTERN } from '@tech-realty-rentals/shared';
import type { AppConfig } from '../config/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Per-widget dynamic CORS for the two public, unauthenticated widget endpoints (docs/06 §3-4,
 * docs/11 §5 "origin handling" tests). These are embedded on third-party agent websites, so
 * they must accept cross-origin requests from whatever origins each *individual widget* has
 * configured -- a set the app's static, global `WEB_ORIGINS` allowlist (see app.factory.ts,
 * used for every other route) knows nothing about and must not be loosened to accommodate.
 *
 * Rather than a guard/middleware bolted on *after* Nest's own routing (too late: the `cors`
 * middleware Nest's `app.enableCors()` installs already fully handles -- and short-circuits --
 * every CORS preflight `OPTIONS` request before any guard or controller runs), this plugs
 * directly into `app.enableCors()` itself via a `CorsOptionsDelegate`: a per-request function
 * that computes CORS options from the raw Express `Request`, including for preflight. Every
 * other route keeps the exact static `WEB_ORIGINS` + credentials behavior app.factory.ts had
 * before Phase 4 -- this delegate falls through to that unchanged for any path it does not
 * explicitly recognize below.
 *
 * Deliberate asymmetry between the two routes, and why:
 *
 * - `GET /public/widgets/:publicKey/config` carries the public key in the URL *path*, which
 *   is available even on a preflight `OPTIONS` request (same path, no body). This route gets
 *   fully accurate per-widget origin reflection: the widget's own `allowedOrigins` (with the
 *   `http://localhost[:port]`/`http://localhost:*` local-dev exception, docs/06 §4) is looked
 *   up and, only on a match, that exact origin is reflected back with `credentials: false`
 *   (this endpoint uses no cookies). A non-matching or missing Origin gets no CORS header at
 *   all -- cross-origin browser JS cannot read the response, though same-origin and
 *   non-browser callers (curl, server-to-server) are unaffected, since CORS is purely a
 *   browser-enforced response-readability rule, never a server-side authorization check.
 *
 * - `POST /public/analytics/events` carries the widget's public key in the JSON *body*, which
 *   a CORS preflight request never includes (browsers send preflight `OPTIONS` with no body
 *   at all) -- so which widget's allowlist applies cannot be determined before the real
 *   request even arrives. This route therefore reflects *any* requesting origin, still with
 *   `credentials: false` (no cookies are read or set by this endpoint, so reflecting an
 *   arbitrary origin does not expose any authenticated/cross-site data -- an attacker's page
 *   could already fire this same cross-origin POST today via a plain `<form>` or a
 *   `no-cors` fetch without needing to read the response at all, so a strict CORS allowlist
 *   here would not meaningfully reduce abuse). The actual authorization-relevant check --
 *   comparing the request's `Origin`/`Referer` against the *named widget's own* allowlist --
 *   runs inside `AttributionService.recordEvent` against the real request body, every time,
 *   regardless of what the browser would have been allowed to read (docs/06 §4: "Origin...
 *   as a defense-in-depth signal, not... the only authorization control").
 */

const PUBLIC_WIDGET_CONFIG_PATH = /^\/api\/v1\/public\/widgets\/([^/]+)\/config$/;
const PUBLIC_ANALYTICS_EVENTS_PATH = '/api/v1/public/analytics/events';

const logger = new Logger('PublicWidgetCors');

export function buildCorsOptionsDelegate(
  config: AppConfig,
  prisma: PrismaService,
): CorsOptionsDelegate<Request> {
  const staticOptions: CorsOptions = { origin: [...config.WEB_ORIGINS], credentials: true };

  return (req, callback) => {
    const path = req.path;
    const configMatch = PUBLIC_WIDGET_CONFIG_PATH.exec(path);
    const publicKey = configMatch?.[1];
    if (publicKey) {
      resolveWidgetConfigCors(prisma, publicKey, req.header('origin') ?? null)
        .then((options) => callback(null, options))
        .catch((error: unknown) => {
          logger.error(
            `Failed to resolve CORS for widget config lookup: ${
              error instanceof Error ? error.name : 'unknown'
            }`,
          );
          callback(null, { origin: false, credentials: false });
        });
      return;
    }

    if (path === PUBLIC_ANALYTICS_EVENTS_PATH) {
      // See class/module doc above: the widget cannot be resolved from a bodyless preflight,
      // so this route reflects any origin without credentials and relies entirely on the
      // handler-level allowlist check against the real request body.
      callback(null, { origin: true, credentials: false });
      return;
    }

    callback(null, staticOptions);
  };
}

async function resolveWidgetConfigCors(
  prisma: PrismaService,
  publicKey: string,
  requestOrigin: string | null,
): Promise<CorsOptions> {
  if (!requestOrigin || !PUBLIC_KEY_PATTERN.test(publicKey)) {
    return { origin: false, credentials: false };
  }
  const widget = await prisma.widget.findUnique({
    where: { publicKey },
    select: { allowedOrigins: true },
  });
  if (!widget || !isOriginAllowed(requestOrigin, widget.allowedOrigins)) {
    return { origin: false, credentials: false };
  }
  return { origin: requestOrigin, credentials: false };
}
