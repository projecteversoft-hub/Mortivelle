# ADR-001 — Web/API topology and cookie strategy

**Status:** Proposed — pending approval at Gate 1 (no auth code exists yet; decision binds Phase 2).

## Context
docs/01 deploys the web frontend and API separately; docs/02 requires HttpOnly refresh cookies and CSRF protection. Cross-site cookies (different registrable domains) conflict with `SameSite=Lax/Strict` and weaken CSRF posture.

## Decision
- Serve web and API under the **same registrable domain** (e.g. `app.example.com` and `api.example.com`), so cookies are same-site.
- In local development the Vite dev server **proxies `/api` to the API**, so the browser sees a single origin.
- Embedded widgets run as an iframe of our own web origin; the agent's site is only the *parent frame*. Allowed agent origins are enforced primarily with `Content-Security-Policy: frame-ancestors`, with `Origin`/`Referer` as defense in depth (docs/06 §4). CORS stays limited to our own web origins.

## Alternatives considered
- Cross-site cookies with `SameSite=None; Secure` — rejected: larger CSRF surface, browser third-party-cookie restrictions.
- Bearer tokens in `localStorage` — rejected: XSS-exfiltratable.

## Consequences / risks
Requires DNS/domain planning before staging. Public widget endpoints are unauthenticated and use widget keys, not cookies.
