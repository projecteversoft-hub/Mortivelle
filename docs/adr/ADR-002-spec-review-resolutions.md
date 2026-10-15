# ADR-002 — Resolutions from the Phase 0 documentation review

**Status:** Accepted at Gate 0 (user approved the recommended defaults).

| # | Conflict / gap | Resolution |
|---|---|---|
| 1 | Phase numbering differs between docs/10 and docs/11 | docs/11 is authoritative (7 phases); auth/tenancy is Phase 2. |
| 2 | "Monthly payment" vs "property true-cost" | Three calculators: affordability, rent-vs-buy, property-cost (includes monthly payment). |
| 3 | HttpOnly cookies with separately deployed web/API | See ADR-001. |
| 4 | Origin allowlist for iframe embeds | `frame-ancestors` is the primary control; CORS limited to own web origins. |
| 5 | Canonical lead vs tenant visibility | Decide attribution rule (first-capture attribution vs per-agent relationship records) **before Phase 5**; default proposal: separate `LeadRelationship` per capturing agent, no cross-agent exposure. |
| 6 | HOMEBUYER role vs org-bound memberships | HOMEBUYER users are org-less; they hold no `Membership`. Role enum excludes it until saved scenarios are specified. Enum spelled `HOMEBUYER` in docs. |

Open items carried forward (not blocking Phase 1): retention periods, PII encryption/HMAC key management, idempotency-key TTL, billable-event definition, lead status transition table, missing endpoints (consent revocation, disclosure management, routing/lender CRUD, saved scenarios), money-arithmetic library choice (before Phase 3), in-process rate limiter without Redis (before Phase 3).
