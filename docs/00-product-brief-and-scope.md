# 00 — Product Brief and Scope

## 1. Product vision
Tech Realty Rentals is a multi-tenant platform that helps homebuyers understand estimated homeownership costs and helps real estate agents engage visitors through branded calculators. With appropriate permission and business controls, the platform can capture and manage mortgage-interest leads and deliver eligible leads to contracted lender partners.

## 2. Users and customers
- Homebuyer/visitor: uses calculators and optionally requests saved results, rate alerts, or lender contact.
- Real estate agent/team: embeds branded tools and reviews permitted lead and traffic summaries.
- Platform operator: manages organizations, configurations, support, consent evidence, routing policies and operations.
- Lender buyer: receives leads only after contractual onboarding and eligibility configuration.
- Compliance/operations reviewer: reviews audit events, consent evidence, disputes and delivery records.

## 3. MVP outcomes
1. Provide useful affordability and ownership-cost calculators without requiring contact details.
2. Support agent-branded embedded widgets and source attribution.
3. Capture optional leads with clear, versioned disclosures and recorded user actions.
4. Manage leads through a traceable lifecycle.
5. Support manually configured, exclusive lead delivery to one approved test/mock lender, then contracted real lenders only after separate approval.
6. Report funnel and delivery metrics without exposing unnecessary PII.
7. Maintain tenant boundaries, auditable access and safe defaults.

## 4. MVP in scope
- Authentication and role-based access.
- Organizations, memberships and tenant isolation.
- Home affordability and monthly payment calculator.
- Rent-versus-buy calculator using explicitly disclosed assumptions.
- Property true-cost calculator with user-entered or clearly sourced estimates.
- Agent widget configuration, theme and attribution.
- Lead capture and deduplication controls.
- Consent/disclosure versioning, evidence and revocation/suppression state.
- Lead CRM and status history.
- Manual exclusive routing rules and mock lender adapter.
- Delivery attempt/acknowledgment tracking, idempotency, basic billing ledger.
- Operational dashboard and privacy-conscious analytics.
- Local development and automated tests.

## 5. Explicitly out of scope for MVP
- Credit bureau pulls or soft-pull prequalification.
- Income, asset or employment verification.
- Automated underwriting, loan recommendations, loan offers or rate guarantees.
- Ping/post auction bidding.
- Loan origination or acting as a lender/broker.
- Real-time rate feeds unless a provider and data-use rights are approved.
- SMS or automated calling campaigns.
- Sale of leads without validated contractual and legal review.
- AI scoring of borrowers.
- Mobile native apps.
- Microservices, Kubernetes, Redis/BullMQ dependency, and multi-region active-active deployment.

## 6. Business assumptions to validate
- Agents will embed the widget and direct meaningful traffic to it.
- Visitors find the calculator useful enough to return or opt in.
- At least one lender will accept the proposed lead fields and pricing.
- Consent scope can be made clear and operationally enforced.
- The fully loaded cost per accepted lead supports positive contribution margin.

These are hypotheses, not established facts. Track them during a pilot.

## 7. Product principles
- Value before data collection.
- Optional lead capture; no forced gating of core calculator results.
- Clear distinction between estimates and lender-approved terms.
- Explicit recipient and purpose boundaries for personal data.
- Privacy and security by design.
- Tenant isolation at every API boundary.
- Human-configured rules before automated marketplace optimization.
- Measurable outcomes and auditable decisions.

## 8. MVP success measures
- Calculator completion and error rates.
- Widget installation and active agent rate.
- Opt-in rate by placement and disclosure version.
- Duplicate and invalid lead rates.
- Percentage of leads eligible for delivery.
- Delivery acknowledgment and rejection rates.
- Lead dispute/refund rate.
- Agent and lender retention.
- Contribution margin per captured and accepted lead, once real commercial data is available.

Do not hard-code target values before pilot baselines exist.
