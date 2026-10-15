# 06 — Agent White-Label and Attribution

## 1. Purpose
Allow an agent organization to embed a branded calculator on its own website while keeping configuration, traffic attribution and lead access tenant-scoped.

## 2. Widget configuration
MVP configuration fields:
- Display name and widget ID.
- Agent organization ID (server-managed).
- Theme tokens/logo URL where approved.
- Allowed origin list.
- Enabled calculator types.
- Optional CTA placements.
- Active/paused status.
- Disclosure configuration reference, not arbitrary client-supplied legal text.
- Configuration version and timestamps.

Do not expose private API keys or internal tenant identifiers as authorization credentials in embed code.

## 3. Embed approach
Provide a responsive iframe-based embed first to isolate CSS and reduce integration complexity. Use a short script only to size the iframe and pass a public widget key. Do not accept sensitive lead data through URL parameters or `postMessage` without strict origin validation and schema validation.

## 4. Origin validation
- Maintain an allowlist of normalized HTTPS origins for production.
- Validate `Origin`/`Referer` as a defense-in-depth signal, not as the only authorization control.
- Restrict CORS to configured origins where feasible.
- Public widget keys identify configuration but are not secrets.
- Rate-limit public endpoints and monitor abuse.
- Define local-development exceptions separately from production rules.

## 5. Attribution
Capture minimal source context: widget, agent organization, campaign/source labels when available, landing path without sensitive query parameters, and timestamp. Do not use invasive fingerprinting. Respect applicable consent and privacy choices for analytics.

## 6. Agent dashboard
- Create/edit/pause widgets.
- Preview branding and enabled calculators.
- Manage allowed origins.
- Review aggregated traffic and lead funnel.
- View only leads explicitly authorized for the agent organization.
- Export only with a documented permission and audit trail; disable bulk PII export by default.

## 7. Commercial configuration
MVP may store non-executable agreement metadata: agreement status, effective dates, routing preference and approved commercial plan. Revenue-share payments and referral compensation must remain disabled until reviewed and approved for the applicable jurisdictions and agreements.

## 8. Acceptance criteria
- Widget cannot be configured or read by another agent tenant.
- Origin allowlist changes are audited.
- Public widget endpoint returns only safe configuration.
- Widget remains usable on mobile and does not require login for calculator use.
- Attribution is consistent across direct platform and embedded use.
- Paused widgets stop new lead capture or show a clear fallback state.
