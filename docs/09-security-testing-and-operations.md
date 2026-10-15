# 09 — Security, Testing and Operations

## 1. Security baseline
- Strict TypeScript and dependency lockfile.
- Input validation on all public and authenticated endpoints.
- Secure password hashing and session handling.
- Rate limits for login, reset, public widgets and lead intake.
- CORS and origin restrictions.
- TLS in production and encryption at rest.
- Secrets supplied through environment/secret manager, never committed.
- Least-privilege database and provider credentials.
- PII redaction in logs, traces, errors and analytics.
- Security headers and a restrictive content security policy where compatible with embeds.
- Dependency and container vulnerability scanning in CI where tooling is available.
- Backups and tested restore procedure before production.
- Audit logs for privileged and sensitive actions.

## 2. Threat scenarios to test
- Cross-tenant IDOR and list leakage.
- Forged tenant/organization IDs.
- Widget key abuse and origin spoofing.
- Credential stuffing and password reset enumeration.
- CSRF where cookie-based authentication is used.
- SQL injection, XSS, unsafe HTML/logo URLs and open redirects.
- Consent bypass and wrong-recipient delivery.
- Duplicate lead creation and duplicate billing under retries.
- Provider timeout, malformed response and replay.
- Excessive export and sensitive information in logs.
- Privilege escalation through role or organization changes.

## 3. Test strategy
- Unit: calculations, validators, domain transitions, consent policy, routing rules.
- API integration: authentication, DTO validation, persistence, errors and idempotency.
- Database: migrations, constraints, tenant-scoped queries and transaction behavior.
- Authorization: positive and negative cases for every role and organization.
- End-to-end: calculator journey, optional lead capture, agent widget setup, operator review and mock lender delivery.
- Contract: adapter interfaces, schema versions and mock provider behavior.
- Accessibility: keyboard navigation, labels, focus, contrast and error messaging.
- Security regression: consent bypass, cross-tenant access, export and logging tests.

## 4. Required checks per pull request
- Formatting/lint.
- Typecheck.
- Unit tests.
- API integration tests.
- Build.
- Relevant database migration checks.
- Playwright smoke tests for completed UI phases.
- Dependency scan if available in the repository's CI.
Do not report a check as passing if it was not run.

## 5. Observability
Use structured logs with request/correlation IDs. Metrics should include request latency/error rates, calculator errors, lead intake counts, consent-check denials, routing outcomes, delivery acknowledgment rates and retry counts. Avoid high-cardinality PII labels.

Health endpoints:
- Liveness: process is running.
- Readiness: required dependencies are available.
Do not expose detailed infrastructure state publicly.

## 6. Operational runbooks
Create concise runbooks for:
- Local setup and reset.
- Database migration and rollback strategy.
- Secret rotation.
- Failed lead delivery and reconciliation.
- Consent revocation/suppression.
- Data access/deletion request handling.
- Incident response and breach escalation.
- Backup restore validation.

## 7. Environments
- Local: synthetic data and mock adapters.
- CI: ephemeral test database and fake secrets.
- Staging: synthetic or properly de-identified data; provider integrations disabled by default.
- Production: only after human sign-off, legal review, security review, provider approval, monitoring and recovery readiness.
