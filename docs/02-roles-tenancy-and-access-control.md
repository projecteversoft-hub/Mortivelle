# 02 — Roles, Tenancy and Access Control

## 1. Tenant model
A tenant is an organization boundary. Organization types initially include `PLATFORM`, `AGENT_ORG`, and `LENDER_ORG`. A person may belong to more than one organization through explicit memberships.

Tenant-owned records must carry an `organization_id` where appropriate. Leads may have a platform-level canonical record plus explicit source/relationship records; do not duplicate or expose a lead across tenants implicitly.

## 2. Roles
- `PLATFORM_ADMIN`: platform configuration and authorized operational access.
- `PLATFORM_SUPPORT`: limited support access; sensitive lead content hidden by default.
- `AGENT_ADMIN`: manage agent organization members, widget configuration and permitted reporting.
- `AGENT_MEMBER`: view permitted organization-level widgets and reports.
- `LENDER_ADMIN`: manage lender organization configuration and authorized users.
- `LENDER_MEMBER`: view only leads delivered to their lender organization and permitted delivery outcomes.
- `COMPLIANCE_REVIEWER`: review consent/audit/delivery evidence within assigned scope; no unrestricted export by default.
- `HOMEbuyer`: optional authenticated end-user role for saved scenarios; anonymous calculator use remains supported.

Roles are not substitutes for resource-level authorization. Every endpoint must check both role and resource scope.

## 3. Authorization rules
- Agent users see only records explicitly attributed to and made available to their organization.
- Lender users see only leads delivered to their lender organization and only fields allowed by contract and permission scope.
- Platform support cannot casually access raw PII. Sensitive access requires a justified support workflow and audit event.
- Platform admins must use least privilege; high-risk actions require re-authentication or stronger approval controls when introduced.
- Public widget configuration exposes only safe display settings and a non-secret public identifier.
- No public endpoint accepts an organization ID as sufficient proof of authorization.
- Cross-tenant access tests are mandatory for every tenant-owned endpoint.

## 4. Tenant isolation implementation
- Resolve authenticated user and active organization server-side.
- Use reusable service-layer guards/repositories that require a tenant context for tenant-owned operations.
- Add `organization_id` filters to every tenant-scoped query and mutation.
- Use Prisma middleware/extensions only as defense in depth; do not assume middleware alone proves isolation.
- Consider PostgreSQL row-level security in a later hardening phase; document session/connection-pool behavior before enabling it.
- Add tests for list, detail, update, delete, export, nested relations and IDOR attempts across tenants.

## 5. Authentication
- MVP: email/password with Argon2id password hashing, secure session/token design, short-lived access tokens and rotating refresh credentials in secure, HttpOnly cookies where applicable.
- Cookie settings: Secure in production, HttpOnly, appropriate SameSite policy, restricted path and domain.
- Add CSRF protections where cookie-authenticated state-changing requests require them.
- Rate-limit login, password reset and verification flows.
- Never reveal whether an email address is registered in public password-reset responses.
- Email verification and account recovery must be implemented before production use.
- Do not implement social login or external identity provider until separately approved.

## 6. Audit events
Record actor, organization context, action, resource type/ID, timestamp, outcome, request/correlation ID and safe metadata. Do not put raw PII, secrets, full request bodies or credit information into audit metadata.

High-risk events include role changes, widget domain changes, disclosure changes, consent access, lead export, lead delivery, routing configuration, billing adjustments and privileged support access.
