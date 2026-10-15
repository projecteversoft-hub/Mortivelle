# 10 — UI and Acceptance Criteria

## 1. Public homebuyer experience
- Visitor can use affordability, monthly cost and rent-versus-buy calculators without login.
- All assumptions/defaults are visible and editable where applicable.
- Results include estimate disclaimers and breakdowns.
- Validation errors are clear and accessible.
- User can choose a next step without being forced to submit contact information.
- Lead form separates purposes and presents approved disclosure versions.
- User can abandon the form without losing the displayed calculator result.

## 2. Agent experience
- Agent admin can create, preview, edit, pause and configure a widget.
- Agent can set and validate allowed origins.
- Agent sees aggregated analytics scoped to their organization.
- Agent cannot see another organization's leads or configuration.
- Widget public configuration contains no secrets.
- Changes are auditable and have a configuration version.

## 3. Platform operations
- Authorized operator can review organizations, leads, consent evidence and delivery outcomes within role scope.
- Sensitive fields are masked by default where not required.
- Every sensitive access/export/configuration change creates an audit event.
- Failed or ambiguous deliveries are visible for reconciliation.
- Operator cannot bypass consent checks by manually changing a status.

## 4. Lender portal
MVP may provide a minimal internal/mock view only. Real lender accounts and delivery are disabled until approved onboarding is complete.
- Lender can see only deliveries to its own organization.
- Lender acknowledgment is idempotent and auditable.
- No broad search across all platform leads.

## 5. Visual and accessibility requirements
- Responsive layout for mobile, tablet and desktop.
- Consistent design tokens and component patterns.
- Keyboard access, visible focus and semantic labels.
- Error/success status is conveyed by text and not color alone.
- No inaccessible modal traps or hidden consent choices.
- No third-party session replay on sensitive form pages unless separately reviewed and configured.

## 6. Phase-level acceptance criteria
### Phase 1 — Foundation
- Fresh clone setup documented.
- App starts locally with synthetic config.
- Database migrations run on a clean database.
- Authentication and tenant tests pass.
### Phase 2 — Calculators
- All calculators pass formula/boundary tests.
- Results are visible without lead capture.
### Phase 3 — Agent widgets
- Tenant-scoped configuration and origin validation work.
- Widget renders responsively and attributes events correctly.
### Phase 4 — Consent and leads
- Consent versions immutable; permissions purpose-specific.
- Revocation and suppression are enforced.
- Tenant isolation and duplicate submission tests pass.
### Phase 5 — Exclusive delivery
- Mock lender receives only eligible payloads.
- Delivery is idempotent and observable.
- Simulated billing links to an eligible billable event.
### Phase 6 — Operational hardening
- Runbooks, monitoring, backup/restore plan and security checks are complete.

## 7. Global definition of done
A feature is complete only when UI behavior, API behavior, authorization, tests, documentation and failure states are all addressed. Visual implementation alone is not completion.
