# 07 — Consent, Privacy and Compliance Controls

## 1. Purpose and legal-review boundary
This document specifies technical controls, not legal advice. The platform targets the US mortgage market. Qualified US counsel must review applicable federal and state requirements, disclosures, consent language, lead sale/routing practices, referral compensation, retention and licensing before production use.

## 2. Purpose-specific permissions
Keep separate records and user actions for distinct purposes, such as:
- Saving a scenario or creating an account.
- Sending requested email alerts.
- Sharing information with a named or clearly described mortgage professional/lender for the user's requested contact.
- Calling or texting, if those channels are later introduced and separately approved.

Do not bundle optional purposes or preselect marketing choices. A user declining optional communications must still be able to use the calculator.

## 3. Evidence fields
For each consent/permission event, record:
- Exact disclosure version ID and immutable content hash.
- Purpose and communication channel.
- Recipient scope or named recipient where applicable.
- User action and timestamp.
- Widget/source and request correlation ID.
- Relevant evidence metadata approved by counsel.
- Revocation/suppression state and time.

Do not rely solely on IP address, user agent or a third-party certificate as proof that all legal requirements were satisfied. Minimize evidence data and restrict access.

## 4. Disclosure lifecycle
- Version and review disclosure text.
- Do not overwrite old versions; retire them and preserve the version associated with each event.
- Only approved active versions can be presented.
- Changes to recipients, purposes or channels may require renewed permission; encode this as a reviewed policy, not a guess.
- Keep legal copy configurable by version, but require human approval before publication.

## 5. Consent enforcement
Before lead delivery or communication:
1. Identify the requested action.
2. Retrieve the recorded permission and exact disclosure version.
3. Check that its purpose/channel/recipient scope covers the action.
4. Check current revocation/suppression state.
5. Check recipient eligibility and platform policy.
6. Persist the decision and audit metadata.
7. Only then permit the action.

If any check is missing, ambiguous or fails, fail closed: do not send the lead.

## 6. Credit and income data
Disabled in MVP. Before any future implementation:
- Confirm permissible purpose and authorization requirements with bureau/provider and counsel.
- Verify contract, credential, security and retention obligations.
- Collect only necessary fields.
- Separate sensitive results from ordinary CRM access.
- Restrict access and logging.
- Define deletion and consumer request workflows.
- Test denial and failure cases.
Do not assume consumer authorization alone is sufficient for every credit transaction.

## 7. Mortgage referral and licensing
Before monetizing or routing leads:
- Review RESPA and applicable state laws.
- Review agent/lender contracts, compensation, exclusivity and referral structures.
- Determine whether any activity requires licensing or registration.
- Ensure UI language does not imply the platform is a lender or that a user is preapproved.
- Disable compensation features until legal review is documented.

## 8. Privacy rights and retention
- Define retention periods by data category and purpose.
- Support deletion/correction/access workflows where applicable.
- Maintain suppression records only to the extent necessary and lawful to honor preferences.
- Do not erase required legal/audit evidence without approved retention rules.
- Document processors, subprocessors and data sharing.
- Avoid selling or reusing data for a purpose not disclosed and permitted.

## 9. Acceptance criteria
- No lead delivery can occur without successful server-side permission checks.
- Revocation blocks subsequent actions covered by the revoked permission.
- Disclosure versions are immutable and retrievable.
- No credit/income provider is called in MVP.
- Optional permissions are not preselected.
- Tests cover missing consent, wrong recipient, wrong purpose, retired disclosure and revoked permission.
