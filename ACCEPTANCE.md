<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Accept a Purse installation

The primary journey: Request a purchase, approve its exact budgeted revision, send and chase the PO, receive the delivery, match the invoice, hand off payment and reconcile the books.

## Progress

| Tier | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Core | 17 | 74 | 38 | 129 |
| Agent surface | 0 | 0 | 13 | 13 |
| Later | 0 | 0 | 0 | 0 |
| Full target | 17 | 74 | 51 | 142 |

Judged from the code and tests at commit `66831028dc17110139ed4a4b0d12b32f47c8777d` (21 October 2026). Field proof register: 7 rows; 0 passed, 0 failed, 7 not run.

## Core

### Purchasing core (existing guarantees)

#### PUR-001 — Business setup and scoped capabilities

Core · published · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-ROLE-001

**Requirement.** One business retains locations, cost centers, projects, currencies and native-session requester, approver, buyer and receiver capabilities. Setup preserves identity and data. The full role model is ACCESS-001's.

**Acceptance.**
1. Sign in as genuine members, configure the business and capabilities, re-run setup and restart; each member keeps exactly the configured capabilities and no data is lost .

**Evidence.** `src/purse/admin.ts`; `src/purse/types.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: Configured receiver capabilities survive a native state read. No complete asserting-line trace is recorded for point 1: All configured capabilities and data after setup rerun, All configured capabilities and data after restart.

#### PUR-002 — Supplier register with blocking

Core · published · **partial**

**Requirement.** Suppliers retain contacts, documents, agreements and preferred/blocked reasons. Blocked suppliers cannot enter native purchasing. Self-service onboarding, tax and bank details are SUPPLIER-001 to SUPPLIER-003's.

**Acceptance.**
1. Create, prefer and block suppliers through the API; submission, approval, conversion and issue to a blocked supplier fail with the recorded reason .

**Evidence.** `src/purse/admin.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: Supplier creation, preference and blocking produce audit history. No complete asserting-line trace is recorded for point 1: Blocked submission returns the recorded reason, Blocked approval returns the recorded reason, Blocked conversion returns the recorded reason, Blocked issuance returns the recorded reason.

#### PUR-003 — Approved catalog prices

Core · published · **partial** · Cites BASE-INPUT-003

**Requirement.** Approved catalog reference prices copy into request revisions; subsequent catalog changes do not change approved terms.

**Acceptance.**
1. Request a catalog item, change its price after approval and see the approved revision and PO keep the original price .

**Evidence.** `src/purse/admin.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: The copied request unit price remains the original value after catalogue edit. No complete asserting-line trace is recorded for point 1: Approved revision retains that price, The resulting PO retains that price.

#### PUR-004 — Durable exact request revisions

Core · published · **partial** · Cites BASE-INPUT-003

**Requirement.** Durable drafts retain decimal quantities, project/category/need date, real attachment bytes and immutable revision history. Invalid values are refused.

**Acceptance.**
1. Create and amend a request with attachments, download the original bytes and read every revision; invalid quantities and dates are refused without writes .

**Evidence.** `src/purse/requests.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: Original attachment bytes download unchanged; Invalid quantities are refused. No complete asserting-line trace is recorded for point 1: Every retained revision is read and compared, Invalid dates are refused without writes.

#### PUR-005 — Quotation comparison

Core · published · **done** · Cites BASE-MAIL-001

**Requirement.** Supplied quotations compare price, freight, tax, delivery, conditions and evidence, with missing fields visible and currencies separate. Supplier-submitted responses are SOURCE-002's.

**Acceptance.**
1. Record quotes in two currencies with a missing freight value; the comparison never merges currencies and shows the missing field .

**Evidence.** `src/purse/requests.ts`; `tests/purse.test.mjs`
**Gap.** None.

#### PUR-006 — Exact-revision policy and concurrent budgets

Core · published · **done**

**Requirement.** amount/category/project policy binds the exact request revision. Self approval fails. Conbudget reservations cannot overspend. Multi-step chains are APPROVAL-001's.

**Acceptance.**
1. Approve the exact revision under policy, attempt self approval and race two reservations against one budget; only one fits .

**Evidence.** `src/purse/requests.ts`; `src/purse/approval.ts`; `tests/purse.test.mjs`
**Gap.** None.

#### PUR-007 — Decisions and scoped delegation

Core · published · **partial** · Cites BASE-ROLE-001

**Requirement.** Approve/reject/return decisions retain reason, actor, time, revision and delegation. Scoped delegation expires. Resubmission preserves history.

**Acceptance.**
1. Return, resubmit and approve under an expiring delegation; after expiry the delegate is refused and the history keeps every decision .

**Evidence.** `src/purse/admin.ts`; `src/purse/requests.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: Return reason is retained; Resubmission makes revision two. No complete asserting-line trace is recorded for point 1: An eligible delegated approval is retained, Elapsed expiry refuses the delegate, The entire decision history is read back.

#### PUR-008 — Approved lines become numbered POs once

Core · published · **partial**

**Requirement.** Approved lines allocate once to numbered POs with source links and downloadable documents, including conconversion.

**Acceptance.**
1. Convert the same approved lines concurrently; one PO receives them and its document downloads .

**Evidence.** `src/purse/orders.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: Concurrent conversion returns one success and one conflict; The downloaded document contains its purchased item. No complete asserting-line trace is recorded for point 1: Exactly one allocation record exists after the race.

#### PUR-009 — Issuance and amendments under renewed authority

Core · published · **partial** · Cites BASE-INPUT-001, BASE-MAIL-001

**Requirement.** Document generation and authorized issuance are distinct. Revisions and POs retain approved supplier identity and terms across supplier-directory edits. Supplier/quantity/cost amendments retain issued history, invalidate stale authority, reserve changes and require renewed approval before an amendment is issued. Sending to the supplier is PO-001's.

**Acceptance.**
1. Issue a PO, edit the supplier directory, amend supplier and cost; the old issuance remains, the amendment needs fresh approval and reserves its change .

**Evidence.** `src/purse/orders.ts`; `src/purse/requests.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: Old issuance remains marked amended with its issuance time. No complete asserting-line trace is recorded for point 1: Supplier-directory edit cannot rewrite the frozen supplier, Supplier and cost amendment requires renewed approval, The amendment reservation amount is read back.

#### PUR-010 — Receiving, returns and commitments

Core · published · **partial** · Cites BASE-ROLE-001

**Requirement.** Partial receipts, service milestones, rejection, return and cancellation retain reasons. Events explain outstanding quantities and commitments. Physical returns exceeding replenishment authority remain recorded with an explicit hold for review, without overspending. Overreceipt, repeat return and wrong roles fail.

**Acceptance.**
1. Receive partially, reject, return beyond authority and cancel; outstanding quantities and commitments reconcile and invalid receipts are refused .

**Evidence.** `src/purse/receiving.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: Partial receiving leaves the expected outstanding quantity; Cancellation releases the commitment; Overreceipt is refused. No complete asserting-line trace is recorded for point 1: Rejection is retained with its reason, Beyond-authority return preserves the explicit review hold, All outstanding and commitment terms reconcile through the full sequence.

#### PUR-011 — Invoice evidence, discrepancies and accounting CSV

Core · published · **partial**

**Requirement.** Supplier ID plus invoice reference identifies invoice evidence once across POs. Identical re-entry is idempotent; conflicting evidence is refused for review. Allocations expose price/quantity/receipt discrepancies and export accounting CSV once without posting or payment. Live posting is SYNC-001 to SYNC-004's and payment is AP-001's.

**Acceptance.**
1. Enter an invoice twice identically and once conflicting, allocate across POs and download the CSV; discrepancies show and the conflict is refused .

**Evidence.** `src/purse/invoices.ts`; `src/purse/orders.ts`; `src/purse/documents.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: Identical invoice re-entry returns the original identity; Conflicting invoice re-entry is refused; CSV contains the invoice once with its original amount. No complete asserting-line trace is recorded for point 1: One invoice allocation across several POs is asserted.

#### PUR-012 — Commitments, overdue and renewals visible; complete restore

Core · published · **partial** · Cites BASE-DATA-001

**Requirement.** Commitments remain currency-separated, overdue receiving and renewals stay visible, and complete `.rer` archive restore preserves domain links, decisions, files and import history.

**Acceptance.**
1. Export a populated installation, restore into an empty one and compare records and files; corrupt or nonempty restores write nothing .

**Evidence.** `src/ui/overview.tsx`; `tests/browser-archive.mjs`
**Gap.** Asserted: Every retained domain record is compared after restore; Corrupt semantic restore leaves every portable row unchanged. No complete asserting-line trace is recorded for point 1: Original file bytes are compared after restore, Nonempty destination restore leaves all rows unchanged.

#### PUR-013 — Reviewed CSV move-in

Core · published · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-INPUT-001, BASE-INPUT-003, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** The documented first CSV move-in kit uses Base import-kit D1, native-session SQL guards, exact source keys/bytes/mapping decisions (except SUPPLIER-003's redacted TIN/bank cells with original digest and column custody), no-write preview, reviewed commit, resume, idempotence and conflict-preserving undo. Imported status never grants authority. Real incumbent exports are IMPORT-001 and IMPORT-002's.

**Acceptance.**
1. Preview, change input, commit, resume and undo a fixture CSV; changed input needs a new review and undo preserves edited targets .

**Evidence.** `src/purse/imports.ts`; `src/purse/import-mapping.ts`; `src/purse/import-custody.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: Preview writes no import job; Changed input requires a new review; Commit retains exact original CSV bytes. No complete asserting-line trace is recorded for point 1: An unfinished batch actually resumes to completion.

#### PUR-014 — Governed human preparation and proposed actions

Core · published · **done** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Five human preparation workflows (intake, RFQ, renewal, exception, negotiation) retain editable downloadable drafts, missing fields, source references and input versions. ProposedActions recheck authority at execution. The agents that do this work are AGENT-001 to AGENT-011's, governed by AGENT-010.

**Acceptance.**
1. Prepare, edit and download each workflow's draft, then execute a proposed action with stale input and with the wrong role; both are refused .

**Evidence.** `src/purse/agents.ts`; `src/purse/api.ts`; `tests/purse.test.mjs`
**Gap.** None.

#### PUR-015 — Owner-run source and command path

Core · published · **partial** · Cites BASE-DATA-005, BASE-INSTALL-001, BASE-OPS-002

**Requirement.** Purse ships MIT source, the native TanStack Start/Hono/Cloudflare edition, bundled fonts, the Purse theme and development personas through the shared RER command path.

**Acceptance.**
1. Run the RER command path from a fresh clone and the browser journey .

**Evidence.** `package.json`; `tests/runtime.mjs`; `tests/browser.mjs`; `tests/run-site.mjs`
**Gap.** The carried tests prove bounded native behavior. No complete asserting-line trace is recorded for point 1: Every named RER verb is exercised from a fresh clone on the same installation.

#### PUR-016 — Exact money and quantities with an append-only ledger

Core · published · **partial** · Cites BASE-AUDIT-001

**Requirement.** Quantities are thousandths; money is integer minor units, each line rounds half-up once. Commitment reservations/releases/amendments append to an auditable ledger. Invalid/nonfinite values fail.

**Acceptance.**
1. Enter decimal quantities and currency text, round lines and amend; the commitment ledger is append-only and invalid values leave state unchanged .

**Evidence.** `src/purse/money.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: Decimal quantity rounds half-up to thirteen minor units; Currency text produces exact freight, tax and line totals; Invalid currency representations leave all domain rows unchanged. No complete asserting-line trace is recorded for point 1: Every original ledger row remains unchanged after amendment.

#### PUR-017 — Current-session authorization on every door

Core · published · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-ROLE-001

**Requirement.** Purchasing commands bind the actual request, PO and invoice, including the approved revision and computed total.

**Acceptance.**
1. Call every command and download signed out, with the wrong role, forged revision, revoked session and another record's scope; each is refused without mutation .

**Evidence.** `src/purse/store.ts`; `src/purse/documents.ts`; `tests/purse.test.mjs`
**Gap.** Asserted: Signed-out state read is refused; Forged actor and role cannot create a supplier; Cross-record attachment read is refused. No complete asserting-line trace is recorded for point 1: Every command and every download is checked for every named refusal and no mutation.

### Roles, access and entities

#### ACCESS-001 — Procurement roles and buyer limits

Core · target · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-AUDIT-001, BASE-DATA-001, BASE-ROLE-001 · Rules D-1, D-2, D-3

**Requirement.** Beyond PUR-001's capabilities, a business assigns owner, admin, requester, approver, buyer, receiver, AP clerk, finance viewer and read-only auditor roles, scoped by department, location, project and entity. Requesters see only their own purchases and their department's where granted; AP sees invoices and supplier tax and bank fields only through SECURITY-001's masking; auditors read everything and change nothing. Admins can define custom roles from the same permission set. A buyer grant carries PO-012's price variance limit (dollars, percentage or both, and a quantity variance) per buyer or per buyer role and entity, zero allowed. Every grant, revocation and limit change is audited. Native implementation uses independent permission-and-scope grants; all dimensions and every line project must fit one complete grant, including the custom role restriction. Requester grants preserve own-purchase reads unless an explicit department-read grant adds department purchases; that read never grants editing another requester’s draft. Native owner authority alone assigns or revokes membership and raises buyer limits. Access administrators may set all price and quantity limits to zero on one existing conversion grant only when its entire effective scope is contained by one complete administrative grant; other grants, identity and active status are retained. Role-wide zero limits require unrestricted administrative authority; only the native owner sets other limit values. Administrators define custom roles without native owner, reveal or assignment authority. Entity scope currently names the main business; ACCESS-003 supplies additional entities and inherits these checks. Role defaults and person overrides use dollar and/or percentage price caps (when both are configured, both apply and the lower governs) plus the quantity limit; decreases remain permitted, the whole edit fits a single grant, and issuance rechecks authority, limit and budget. Frozen approval revisions stay unchanged; a PO retains attributed before/after conversion evidence and restores only with its exact source and audit proof. PO-012 inherits the remaining edit kinds, channels and authority changes; this native price/quantity conversion door does not close it.

**Acceptance.**
1. Sign in as each role at 1440 and 390 pixels and through the API; each sees and does exactly its scope, a department-scoped approver cannot act outside it, an auditor's write is refused and the audit shows each grant.
2. Define a custom "Receiving lead" role with only the receive and view-PO permissions for one location and assign it: its holder records a receipt on that location's PO, while their approval attempt, invoice read and receipt on another location's PO are refused through the web and the API.
3. Set a buyer role's price variance limit to $50 or 10% and one buyer's to zero: each buyer's conversion edits are allowed or refused by their own limit through the web and the API, and the audit log shows each limit change.

**Evidence.** `tests/access.test.mjs`; `tests/browser-access.mjs`; `tests/browser-access-flows.mjs`; `tests/po-documents.test.mjs`; `tests/browser-access-flows.mjs`; `tests/payables.test.mjs`; `tests/browser-access-sources.mjs`; `tests/access.test.mjs`; `tests/browser-access.mjs`; `tests/access.test.mjs`; `tests/browser-access.mjs`; `tests/rfq.test.mjs`; `tests/agreement-savings.test.mjs`; `tests/rfq.test.mjs`; `tests/browser-access-sources.mjs`; `tests/email-intake.test.mjs`; `tests/browser-access-sources.mjs`; `tests/access.test.mjs`; `tests/supplier-duplicates.test.mjs`; `tests/browser-access.mjs`; `tests/search.test.mjs`
**Gap.** Asserted: Each declared content role sees the permitted request and excludes the other scope; Each role’s permitted and forbidden PO document reads are checked; Department approver cannot decide outside scope. No complete asserting-line trace is recorded for point 1: The web role matrix at both widths covers every promised right; point 2: Its permitted receipt is read back after creation; point 3: Every promised role and person conversion outcome is asserted on the web and API.

#### ACCESS-004 — Scoped procurement reports and cash access

Core · target · **partial** · From ACCESS-001 · Cites BASE-AUDIT-001, BASE-ROLE-001 · Rules D-1, D-2, D-3

**Requirement.** Before shipping this capability, its AP and finance roles must replace AP-003’s temporary owner/buyer access with scoped term entry, cash-planning approval and cash-view reads. Acceptance must assert this AP-003 integration through the capability’s public door. Its read-only auditor role must read, filter and export AUDIT-001 history inside its granted scope and must never mutate it. Acceptance must assert this obligation through its public door and AUDIT-001 read/export. Before shipping, REPORT-001 must enforce the new role and department/entity scopes on filters, choices, totals, source drill-through and direct HTTP reads. Acceptance must assert permitted records and refusal or absence of out-of-scope records through the public report door and web.

**Acceptance.**
1. Before shipping, REPORT-001 must enforce the new role and department/entity scopes on filters, choices, totals, source drill-through and direct HTTP reads.
2. Acceptance must assert permitted records and refusal or absence of out-of-scope records through the public report door and web.
3. Before shipping its AP/finance roles, grant REPORT-003 performance access under those roles and assert unauthorized-role refusal through the report API and web.

**Evidence.** `tests/access.test.mjs`; `tests/browser-access.mjs`; `tests/browser-access-flows.mjs`; `tests/po-documents.test.mjs`; `tests/browser-access-flows.mjs`; `tests/payables.test.mjs`; `tests/browser-access-sources.mjs`; `tests/access.test.mjs`; `tests/browser-access.mjs`; `tests/access.test.mjs`; `tests/browser-access.mjs`; `tests/rfq.test.mjs`; `tests/agreement-savings.test.mjs`; `tests/rfq.test.mjs`; `tests/browser-access-sources.mjs`; `tests/email-intake.test.mjs`; `tests/browser-access-sources.mjs`; `tests/access.test.mjs`; `tests/supplier-duplicates.test.mjs`; `tests/browser-access.mjs`; `tests/search.test.mjs`
**Gap.** Asserted: Department report rows and choices are confined to Facilities; The forbidden department has no rows; Permitted sources appear and forbidden source identities are absent. No complete asserting-line trace is recorded for point 1: Every requested figure equals its permitted source sum, Entity-scope report results are independently asserted; point 2: The full report web projection is compared at both widths.

#### ACCESS-005 — Scoped procurement sources and protected fields

Core · target · **partial** · From ACCESS-001 · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-AUDIT-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001, BASE-SECRET-001, BASE-SIGNIN-001 · Rules D-1, D-2, D-3

**Requirement.** The scoped receiver sees only an aggregate receipt-matching status on its PO; invoice records, references, amounts and files still require invoice-read permission. Shared supplier/catalogue mutation and unassigned email administration require unrestricted corresponding grants; source reads and purchase changes follow the actual linked request/PO scope. Existing unscoped supplier presence masks remain, while scoped supplier reads require a related permitted purchase; a buyer grant never lends its suffix privilege to another grant. Protected reveal and legacy evidence re-entry remain current-native-owner only under SECURITY-001. ACCESS-002 inherits permission/scope rechecks, native session fencing and audited grants for IdP/SCIM changes; every future source, payment, entity and transport door under SOURCE-001, INVOICE-002/003, AP-003, REPORT-001/003, INTAKE-004, API-001 and ERASURE-001 inherits the same actual-record scope.

**Acceptance.**
1. Before shipping AP roles, apply INVOICE-003 source capture, scoped reasoned risk review and unresolved-flag refusal to their invoice/payment approval doors; acceptance must assert correct-role access and wrong-role refusal.
2. Before shipping new invoice roles, kinds or reading doors, preserve INVOICE-002 private originals, source-bound human confirmation, safe remit retention and INVOICE-003 holds; acceptance must assert these rules through that capability’s public door.
3. Before shipping new procurement roles/scopes, apply SOURCE-001 scope to RFQ configuration, invitations/reissue, response histories, awards and private originals; acceptance must assert allowed and out-of-scope cases.
4. Before shipping new roles, keys or intake forms, preserve INTAKE-004 current requester/admin authority, private email-source reads, reasoned held-mail assignment, explicit draft completion and durable replay/mail outcomes; acceptance must assert these obligations through the new public door.
5. Before shipping, AP/finance/custom-role reveal grants inherit SECURITY-001; auditors see masked values only, with scoped reads/refusals asserted before shipping.
6. A role granted SECURITY-001 reveal may receive legacy invoice-evidence re-entry under the same grant; auditors never.

**Evidence.** `tests/access.test.mjs`; `tests/browser-access.mjs`; `tests/browser-access-flows.mjs`; `tests/po-documents.test.mjs`; `tests/browser-access-flows.mjs`; `tests/payables.test.mjs`; `tests/browser-access-sources.mjs`; `tests/access.test.mjs`; `tests/browser-access.mjs`; `tests/access.test.mjs`; `tests/browser-access.mjs`; `tests/rfq.test.mjs`; `tests/agreement-savings.test.mjs`; `tests/rfq.test.mjs`; `tests/browser-access-sources.mjs`; `tests/email-intake.test.mjs`; `tests/browser-access-sources.mjs`; `tests/access.test.mjs`; `tests/supplier-duplicates.test.mjs`; `tests/browser-access.mjs`; `tests/search.test.mjs`
**Gap.** Asserted: A read-only RFQ role has no reissue control; Auditor projection remains masked. No complete asserting-line trace is recorded for point 1: AP source-risk and approval outcomes are all asserted under the new role; point 2: Every private original, confirmation, remit-retention and hold outcome is asserted under the new role; point 3: All named RFQ configuration, invitation, history, award and original branches are asserted for every new scope; point 4: Reasoned held-mail assignment and completion retain all named new-role source boundaries; point 5: AP and finance reveal grants are demonstrated independently; point 6: The permitted legacy-evidence re-entry grant is demonstrated, Auditor legacy re-entry is refused.

#### ACCESS-002 — Single sign-on and provisioning

Core · target · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-MAIL-001, BASE-ROLE-001, BASE-SECRET-001, BASE-SIGNIN-001 · Register R-4

**Requirement.** Owners connect SAML 2.0 or OIDC sign-in with Okta, Microsoft Entra ID, Google Workspace, JumpCloud or [Auth](https://github.com/just-every/run-auth), and SCIM 2.0 provisioning creates, updates and deactivates members with their department and manager. Deactivation ends sessions and transfers open approvals to the manager or a named delegate, so no request stalls on a departed approver. Native OIDC connections use Base’s pinned issuer/endpoints, signed tokens, PKCE, nonce and native admission setting; deployment credentials stay private. Native owners explicitly enable provider sign-in, and disabling it ends provider sessions.  SCIM authority is an owner-issued, show-once hashed bearer in an installation-only excluded table. A freshly reauthenticated native owner explicitly consents to issuer-pinned identity provisioning and department-to-permission templates; all configured scope dimensions apply, unmapped departments grant nothing, provider roles never grant native ownership, and existing native emails are never merged. Provisioning identifies users by issuer plus external ID, and an OIDC sign-in to that provisioned account must match both rather than joining by email; department and manager updates retain their history. Deactivation settles account status/version, all sessions and outstanding identity tokens, mapped grants and exact request-revision approval handoffs in one transaction. Deactivation is never refused for want of a recipient: status, sessions, identity tokens and mapped grants settle in that transaction; each open approval moves to the eligible manager, then the owner-named delegate, then the native owner; a step whose only candidate is its requester waits, audited, in the owner's Needs reassignment queue and is never decidable by the departed person. Only a conauthority or state change refuses the whole change, before writes. A freshly reauthenticated native owner may link an existing member to an issuer and external ID; it activates on that member's next OIDC sign-in matching both; link and unlink are audited and atomic. A request cannot newly submit to a deactivated SCIM approver. Native authority and buyer issuance recheck the recipient and transfer; domain and audit history restore without SCIM configuration, bearer, native account bindings or sessions. Future ACCESS-003 entity provisioning, APPROVAL-001/002 approval steps/delegation, API-001 transport, SECURITY-001 credential lifecycle and ERASURE-001 identity retention inherit these authority, scope and source-history obligations. Identity and handoff semantics follow ct’s 22 October ruling D.

**Acceptance.**
1. Sign in through a test IdP, provision and deprovision a user by SCIM, and see their sessions end and pending approvals move to the delegate with an audit record.

**Evidence.** `tests/identity.test.mjs`; `tests/scim.test.mjs`; `tests/scim.test.mjs`; `tests/browser-identity.mjs`; `tests/browser-scim.mjs`
**Gap.** SAML 2.0; Okta, Entra ID, Google Workspace and JumpCloud sandbox journeys. ct 22 October ruling D adopted. Native HTTP/typecheck/first-party and both-width identity, link/unlink and owner queue journeys pass.

#### ACCESS-003 — Multiple entities and subsidiaries

Core · target · **missing** · Cites BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** One installation holds several US legal entities (or a US parent with foreign subsidiaries), each with its own EIN, ship-to and bill-to addresses, currency, chart of accounts mapping, numbering and accounting connection. Approvers see one cross-entity queue filtered by entity, and a PO cannot be charged to an entity's budget it does not belong to. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.

**Acceptance.**
1. Configure two entities with different accounting connections, raise and approve requests in each from one queue, and see POs numbered and synced to the right ledger; a cross-entity charge is refused.
2. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them.
3. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.
4. Before shipping, SECURITY-001 protected storage, reads and reveal inherit per-entity scope, with permitted and cross-entity cases asserted before shipping.

**Evidence.** None.
**Gap.** Multiple legal entities, per-entity numbering and ledger connections not built

### Intake

#### INTAKE-001 — Guided intake forms and supplier proposals

Core · target · **partial** · Cites BASE-INPUT-001, BASE-INPUT-003 · Rules D-2

**Requirement.** Admins build intake forms per purchase type (goods, software and subscriptions, professional services, contractors, equipment) with conditional questions, required attachments (specifications, quotes, security questionnaires), default coding (with a default CODING-001 split template where a cost is shared), the CODING-002 custom header and line fields that purchase type requires, and a requested need date. When the supplier a requester needs is not in the register, the form lets them propose one on the request (SUPPLIER-008) rather than leaving Purse, and the draft and submission carry the pending supplier. The form previews the applicable policy and approvers before submission.

**Acceptance.**
1. Configure a software form with a conditional security question, fill it as a requester on a phone, see the predicted approval route before submission and submit; the request revision carries every answer and file.
2. On a goods form, type a caterer that is not in the register: the form offers SUPPLIER-008's proposal fields, the draft saves with the pending supplier, and the predicted route shows the new-supplier step.
3. Current unrestricted intake administrators publish versioned category forms with explicit consent.
4. Conditional answers, required files, default coding, exact-cent split templates and custom header/line values are validated on submission and frozen on the revision.
5. Route preview exercises current native validation and names the current policy/approver without reserving authority; submission checks again.
6. Pending supplier proposals require explicit consent, persist on the draft and request, and show the new-supplier review step; purchase approval never makes that supplier eligible to convert or issue.
7. Only current authorized supplier administration can resolve eligibility.

**Evidence.** `tests/purse.test.mjs`; `tests/browser-guided-intake.mjs`; `tests/browser-intake.mjs`; `tests/purse.test.mjs`; `tests/browser-request-again.mjs`; `tests/browser-intake.mjs`
**Gap.** Asserted: Conditional question hides and reveals the security answer; The approval preview names the applicable route; The frozen revision retains its answer, custom field, exact-cent allocations and file. No complete asserting-line trace is recorded for point 2: Pending supplier identity and status are independently read back from the saved draft; point 3: Publish requires unrestricted administrator rights and exact versioned consent; point 4: Every conditional, required-file, coding and custom-value invalid case is refused at submission; point 5: Preview creates no budget reservation, Submission independently rechecks changed policy authority; point 6: Pending proposal’s status and review step persist after submission, Purchase approval alone cannot make the pending supplier purchasable; point 7: Only permitted supplier administrators resolve eligibility.

#### INTAKE-009 — Private unfinished request drafts

Core · target · **partial** · From INTAKE-001 · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-INPUT-003 · Rules D-2

**Requirement.** Requester-owned unfinished drafts retain the answers and files while the requester is away, without submitting a purchase.

**Acceptance.**
1. Half-fill another request with an attachment, close the tab and sign in from a second device: the draft is there with its answers and file, and nothing was submitted.
2. Requester-owned unfinished drafts autosave without creating requests or approval authority; their private files and answers survive a fresh native sign-in.

**Evidence.** `tests/purse.test.mjs`; `tests/browser-guided-intake.mjs`; `tests/browser-intake.mjs`; `tests/purse.test.mjs`; `tests/browser-request-again.mjs`; `tests/browser-intake.mjs`
**Gap.** Asserted: Fresh sign-in retains the saved answer and exact file bytes; No purchase request exists for the unfinished draft. No complete asserting-line trace is recorded for point 2: Automatic save is independently demonstrated before an explicit Save action.

#### INTAKE-010 — Request again from a previous purchase

Core · target · **partial** · From INTAKE-001 · Cites BASE-INPUT-003, BASE-MAIL-001 · Rules D-2

**Requirement.** A requester can copy any past request or PO they can see into a new draft ("request again"): lines, supplier, coding, CODING-001 splits and CODING-002 field values copy, catalog lines take the catalog price with any change from the original shown (PUR-003), and attachments copy only if the requester ticks them; approvals, quotes, receipts and invoices never copy, the draft is a new request routed afresh under APPROVAL-001, and a catalog item outside the requester's access (CATALOG-001), a blocked supplier (PUR-002) or an inactive coding or field value is flagged and left out until replaced.

**Acceptance.**
1. Copy last month's approved request for three catalog items, one of whose prices has since risen and one of which is no longer in the requester's catalog access: the new draft holds the other two lines with their coding and split, shows the price change, flags the third item and carries no approval, and submitting it routes afresh.
2. Current native request-again review copies currently supported line coding into a new requester-owned draft; current catalog prices are server-selected, with per-unit before/after changes shown.
3. Unavailable catalog lines and inactive projects are omitted; unavailable supplier, currency, location or cost centre values require replacement.
4. Only explicitly selected files attached to the chosen source record copy, byte-for-byte, under new attachment IDs.
5. Source email-intake linkage, integration authority, approvals, quotes, receipts, invoices and commitments never copy.
6. A changed source or copy eligibility requires a fresh review.
7. Copy review retains eligible splits and custom values, flags obsolete values and recalculates allocations against current catalog prices.

**Evidence.** `tests/purse.test.mjs`; `tests/browser-guided-intake.mjs`; `tests/browser-intake.mjs`; `tests/purse.test.mjs`; `tests/browser-request-again.mjs`; `tests/browser-intake.mjs`
**Gap.** Asserted: Two eligible lines remain after the restricted item is excluded; Current price before/after values are returned; Inactive project omission is asserted. No complete asserting-line trace is recorded for point 5: Every other listed lineage and authority field is absent; point 6: Every source-change eligibility branch forces a new review; point 7: Split/custom-value obsolete-value and price rescaling outcomes are all read back.

#### INTAKE-002 — Slack intake, approvals and updates

Core · target · **missing** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-MAIL-001

**Requirement.** A Purse Slack app lets employees start a request with a shortcut or message, attach files, and follow its status in a thread; approvers approve, reject or return the exact revision from an interactive message after sign-in binding; requesters receive PO, acknowledgment, delivery and chase updates. Slack actions use the same server-side authority as the web.

**Acceptance.**
1. Install the app in a test workspace, raise a request from Slack, approve it from the approval message, amend it and see the stale message refuse to approve; status updates arrive in the thread.
2. Before shipping Slack, carry RECEIVE-001 receiver prompts and sign-in-bound partial/full receipt replies with the same current assignment and stale-position refusal; acceptance must assert both.

**Evidence.** None.
**Gap.** Slack app, Slack approvals and thread updates not built

#### INTAKE-003 — Microsoft Teams intake, approvals and updates

Core · target · **missing** · Cites BASE-ACCESS-002, BASE-ACCESS-004

**Requirement.** The same journey as INTAKE-002 through a Teams app (Bot Framework with Adaptive Cards), installable by a Teams admin, with approval cards bound to the exact revision.

**Acceptance.**
1. Sideload the Teams app in a test tenant, raise and approve a request from Teams cards, and see a stale card refused and updates delivered to the chat.
2. Before shipping Teams, carry RECEIVE-001 receiver prompts and sign-in-bound partial/full receipt replies with the same current assignment and stale-position refusal; acceptance must assert both.

**Evidence.** None.
**Gap.** Teams app and Adaptive Card approvals not built

#### INTAKE-004 — Email intake

Core · target · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** Each business has a request address; an employee forwards a supplier quote or describes a need by email and receives a link to a prefilled draft with the attachments retained. Mail from unknown senders is held, never turned into a request. The owner records the address and configures the signed Resend receiving webhook and private provider credentials; recording an address does not verify or configure a mailbox. The supported door verifies the exact webhook bytes and freshness, hydrates the signed provider email ID through Base's real receiving adapter, and privately retains the exact provider JSON and decoded attachments in R2. The provider-reported sender label never claims verified employee authorship. The subject prefills the draft title, original body/HTML remain source evidence, and the assigned requester completes supplier, coding, lines and terms before explicitly creating one ordinary request draft; submission and approval remain separate native actions. Known senders require native requester capability (the owner can request); unknown, inactive and non-requester senders are held for the owner's reasoned assignment to an active requester, with no implied grant. Until ACCESS-001 supplies admin, the owner performs administration. Only the owner and assigned requester read the intake and its exact download-only originals, including after completion; only its assigned requester edits/completes it. Source content is data, never instructions. Provider email identity durably de-duplicates ingestion, and draft-link mail claims before sending with honest adapter outcomes; uncertain claims are visible to the owner and never silently repeated. Bounds are three attachments of 10 MB (10,000,000 bytes) each, 30 MB decoded total, 500 kB combined body and 2 MB provider JSON, refused without truncation. Complete archives retain source bytes, source/request lineage, receipt ledger, holds, corrections, assignments and mail outcomes; archived principals grant no native session. ACCESS-001, API-001 and INTAKE-001 inherit current-role source privacy, explicit completion and replay rules before adding roles, keys or form capabilities; ERASURE-001 inherits the new personal source fields and originals.

**Acceptance.**
1. Send a quote PDF from a member's address to the request address and from an unknown address; the member gets a prefilled draft link and the unknown mail is held.
2. Through native HTTP and the web at 1440 and 390, inspect exact private source downloads, keep unknown mail inaccessible to another requester, assign with a reason, correct the draft, complete required purchasing fields into one request draft and submit separately.
3. Wrong-role, inactive, signed-out and stale or repeated actions are refused; invalid/stale webhook signatures do not fetch or write, a repeated provider message creates no second intake/send, and planted source instructions grant no authority.
4. Complete export/restore preserves exact originals and receipt/lineage/mail evidence.

**Evidence.** `src/purse/email-intake.ts`; `src/purse/email-intake-api.ts`; `src/ui/email-intake.tsx`; `tests/email-intake.test.mjs`; `tests/browser-email-intake.mjs`; `scripts/installer/restore-email-intake.mjs`
**Gap.** Asserted: Known member email retains a prefilled draft and its subject/body; Draft-link mail names that intake and its requester; Unknown sender mail is held. No complete asserting-line trace is recorded for point 2: The recorded assignment reason is read back; point 3: Invalid and stale signatures make no retained source write.

#### INTAKE-005 — Cross-team review orchestration

Core · target · **missing**

**Requirement.** A purchase type can require reviews by IT security, legal, privacy or finance in parallel or sequence before approval, with each reviewer's questions, files and decision on the request. Reviews can open and track tickets in Jira, ServiceNow or [Linen](https://github.com/just-every/run-linen), pull a supplier's risk result from OneTrust, and hand contract review to [Locket](https://github.com/just-every/run-locket).

**Acceptance.**
1. Submit a new-software request that triggers security, privacy, IT and legal reviews; complete security in Purse, IT through a linked Jira ticket and a linked ServiceNow incident (Jira and ServiceNow developer instances), and a second IT request through a linked [Linen](https://github.com/just-every/run-linen) ticket on a local Linen installation; pull a OneTrust vendor risk result from its sandbox onto the privacy review; hand legal review to a local [Locket](https://github.com/just-every/run-locket) installation and see its decision return.
2. Approval waits until every review is decided, and closing each linked ticket records its decision on the request.

**Evidence.** None.
**Gap.** Cross-team reviews and Jira, ServiceNow, Linen, OneTrust and Locket links not built

#### INTAKE-006 — Travel pre-approval requests

Core · target · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Travel is a request type alongside goods, services and subscriptions, as in Procurify: an employee (or an assistant for them) requests pre-approval for a trip with the traveler, purpose, origin and destinations, departure and return dates, and estimated costs by category (airfare, lodging, ground transport, meals and incidentals defaulting to the GSA per diem rate for the destination, registration fees, other), with optional attachments such as a conference agenda. The request routes through APPROVAL-001 chains (for example the manager, then finance above a threshold, then a travel or risk reviewer for international trips) and reserves the estimate against the budget (BUDGET-001) like any request. Approval gives the traveler an approval reference to book with; booking itself happens in the business's travel tool (Navan, TravelPerk, SAP Concur Travel) or on a card funded under CARD-001. Actual trip spend returns from [Coaster](https://github.com/just-every/run-coaster) (or an Expensify, Navan, Ramp or Brex expense export) by that reference and moves the reservation to actual; the unspent reservation releases when the trip's expense report closes, or a configured number of days after the return date. A change of dates or a higher estimate is an amendment that re-routes under PUR-009. Native travel door records the traveler, itinerary, categorized estimates and official FY2025–2027 GSA CONUS M&IE provenance, exact city and county matching and explicitly selected standard rates; unknown destinations require an explicit estimate, never an invented default. Native manager and threshold steps reserve at submit and a new travel revision releases the prior reservation before fresh approval. A manually uploaded original from Coaster’s native claim-detail HTTP door retains its exact bytes and approval reference. Active travelers read their own approved destinations, dates, categorized estimate caps, approval reference, revision and status for assistant-created trips. This booking grant exposes no budget, policy, approvals or originals. The creator and assigned approvers may amend the trip; a traveler without that authority cannot edit it. An owner-configured international reviewer adds an independent final step. Timed release is OFF until the native owner consents to a versioned business rule naming days after return, a timezone and the consequence of late actual spend. It applies to every approved revision with an exact-revision per-trip override. Rule changes pause unreleased trips; explicit renewed consent re-arms inherited policies, while trip overrides require their own renewed consent. Native owner changes and any business timezone change pause releases. With no business timezone, a consent that omits the zone returns 409. Real Cron releases once, and a later expense report records actual without a second reservation release. The native owner or a member with request-scoped `request.read` and `payable.approve` may confirm a reviewed source and explicitly close the trip. Coaster reports require independent native approval. Expensify, Navan, Ramp and Brex configurable CSV exports retain their exact original bytes, an explicitly reviewed column mapping and final-report metadata, including approval independent of the traveler. These manual source declarations are labelled as not independently provider-verified. Every row must carry the exact traveler email, currency and approval reference, and totals must reconcile within the estimate. A repeated exact report cannot repeat actual or release, and a conflicting report is refused. Normalized report reads follow the request’s existing read grant; the retained original is native-owner-only; import does not fetch a URL or perform an outbound action. INTAKE-002/003, API-001 and IMPORT-001 inherit these revision/reference/source/settlement obligations when they add travel doors; reviewed ERASURE-001 consent withdraws affected travel originals and scrubs traveler and assistant identity while retaining anonymous financial facts and hashes; archives retain the explicit withdrawn and unverified state without restoring originals or authority. Travel boundary (ct 23 Oct 2026). The adopted owner source and final consent, owner-only originals, request-scoped normalized reads, default-OFF exact-revision/owner/timezone release consent with the late-actual acknowledgment, and the absence of payment authority are approved as the interim floor. The active traveler reads their own approved destinations, dates, categorized estimate caps, reference and status. They never read budget, policy, approvals or originals. It names its timezone, and the owner must choose one when the business has none. A business-level release rule (days, timezone, late-actual consequence) consented once by the owner replaces per-trip consent, with a per-trip override. Rule or owner changes pause unreleased trips. AP and finance roles under ACCESS-001 confirm reports. Expensify, Navan, Ramp and Brex exports join Coaster.

**Acceptance.**
1. Submit a three-day trip to Austin with a $2,400 estimate under a chain that adds finance above $2,000; meals default to the GSA per diem for Austin, the manager and finance approve, and the department budget reserves $2,400.
2. Raise the estimate to $2,700 and see it re-route and reserve $2,700 once approved; then return a $2,150 expense report referencing the request from a local Coaster installation and see $2,150 move to actual and $550 released, with the report linked on the request.

**Evidence.** `tests/travel.test.mjs`; `tests/travel-exports-flow.mjs`; `tests/travel-flow.mjs`; `tests/travel-release-flow.mjs`; `tests/travel-browser.mjs`; `tests/travel-routing.test.mjs`
**Gap.** The five ct rider changes are implemented: traveler approved booking terms with private financial internals, explicit timezone, versioned business release rule and trip override, scoped finance confirmation, and four configurable expense exports. Automatic fetch by reference remains BLOCKED on Coaster API-001: its public machine door omits the exact frozen report revision and independent approval decisions required by the adopted source boundary; there is no reference lookup. Coaster must expose authorized final-report evidence before this Gap can close. Manual imports never fetch a URL, book or pay.

#### INTAKE-007 — Integration purchase-request tokens

Core · target · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** The native owner creates a token scoped only to creating purchase-request drafts and binds it to one active native requester. Linen ASSET-005 and Pier STOCK-001 inherit this create-only boundary by name; the wider API-001 remains separate. Tokens contain 32 random bytes, are displayed once, and only SHA-256 digests are stored. The owner can rotate or revoke a token immediately; old/revoked tokens cannot create or replay requests. Create-only integration bearers and preparation records grant no workspace read, token administration, submission, approval, issuance, receiving or payment scope. Agent equivalents declare their access, security, commitment or money classes and follow company policy. Token use rechecks the bound native identity and requester capability; inactive or no-longer-requester identities are refused. The owner cannot silently change the binding: create a new token for a different requester. POST /api/purse/integration/requests requires a bearer in the Authorization header, an Idempotency-Key and the ordinary complete purchasing fields. It creates one native draft under the bound requester, recording the token label and requester on every draft, preserving source integration identity and applying normal supplier, catalog, coding, amount and line validation. Client identity, approval and totals confer no authority. As with INTAKE-004, a human reviews and explicitly submits before normal policy approval; creating a draft makes no decision, reservation, PO or send. The same token integration and Idempotency-Key with identical UTF-8 JSON bytes return the original creation response, including after rotation or later human edits; a changed body returns 409 without another draft, and conretries create once. Keys contain 1–200 visible ASCII characters; the body limit is 1,600,000 bytes with no truncation. Tokens and replay-response authority never enter portable archives; complete restore preserves purchasing lineage and AUDIT-001 create/rotate/revoke/use/refusal evidence but requires fresh owner-issued tokens. Every refused use is audited with outcome/reason, door and the recognized integration label/requester when available; invalid or rotated secrets are anonymous, never retained. Secrets and digests never appear in ordinary state, token lists, audit read/export, agent context or URLs.

**Acceptance.**
1. Through the native purchase-request-token door, assert native owner issuance, requester binding, bearer-only scope, forged authority refusal, simultaneous same/changed-body idempotency, ordinary human submission/approval, role/native deactivation, rotation/revocation, audit and complete archive restore without credentials.
2. Through Settings, exercise issuance, rotation and revocation and the requester’s draft and submission at 1440 and 390 pixels.

**Evidence.** `src/purse/integration-tokens.ts`; `src/purse/integration-requests.ts`; `src/purse/integration-audit.ts`; `src/ui/integration-tokens.tsx`; `tests/integration-tokens.test.mjs`; `tests/browser-integration-tokens.mjs`; `migrations/core/0026_integration_tokens.sql`; `scripts/installer/portability.mjs`; `API.md`
**Gap.** Asserted: The created draft uses its bound requester rather than forged identity; The bearer creates only a draft and no PO, decision, commitment or mail; Concurrent identical calls return the same creation result once. No complete asserting-line trace is recorded for point 1: Native owner issues the token with the bound requester, Native identity deactivation refuses the bearer; point 2: Settings issuance, rotation and revocation and requester submission are asserted in the browser.

#### INTAKE-008 — Read-only PO-data integration tokens

Core · target · **done** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-AUDIT-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** The native owner creates a token for one named integration and explicitly maps the suppliers whose records it may read. It permits read-only purchase-order headers, lines, status and amounts, bills and payment status for those supplier-mapped records only. AP-001/AP-002 payment-status return is not built: the response states payment status unknown, never infers paid from recorded invoices or cash planning. It exposes no attachments, originals, comments, request records, approval records, payment details or credential data. The token contains 32 random bytes, is shown once and stored only as a SHA-256 digest. It expires after seven days by default and at most 30 days, can be revoked immediately, is rate-limited, and every successful or refused read is audited with the recognized token ID and outcome (unknown secrets remain anonymous). Rotation retains the exact supplier mapping and original expiry; changing either requires new issuance. INTAKE-007 remains create-draft-only and cannot read; the PO-data token cannot create requests or perform any mutation. Locket AGENT-001 inherits this read boundary.

**Acceptance.**
1. Locket reads a PO and its bill status with the token; a read outside scope or after revocation is refused and logged; create-draft tokens still cannot read.

**Evidence.** `tests/integration-tokens.test.mjs`; `tests/browser-integration-tokens.mjs`
**Gap.** None.

### Mobile

#### MOBILE-001 — Responsive web requesting, approval and receiving

Core · target · **done** · Register R-1, R-2

**Requirement.** Requesting, approval status, approval and receiving work in the browser at phone width with readable records and no horizontal scroll.

**Acceptance.**
1. Run the fresh-install browser journey at 390 pixels: request, approve and record a partial receipt .

**Evidence.** `src/ui/requests.tsx`; `src/ui/orders.tsx`; `tests/browser-journey.mjs`; `tests/browser.mjs`
**Gap.** None.

#### MOBILE-002 — Native iOS and Android apps

Core · target · **missing** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-MAIL-001 · Register R-3

**Requirement.** Native apps sign in with the business's identity provider, raise a request (including from a catalog or by photographing a supplier quote, which SOURCE-002 reads into draft lines), push approval, acknowledgment and delivery notifications through APNs and FCM, approve the exact revision, photograph a packing slip or scan a barcode to receive (an item's UPC or GTIN matched to the PO line's supplier part number or catalog item), and queue receipts offline until they reconnect with conflict checks.

**Acceptance.**
1. On test devices, raise a request by photographing a sample quote and confirm its extracted lines, approve it from a push notification, receive offline with a slip photo, reconnect and see the receipt applied once; a revoked session is refused.
2. Scan a sample item's UPC barcode on an open PO: the matching line is selected for receipt, a barcode matching no line on the PO is refused with that reason, and the scanned receipt records the code.
3. Before shipping native push, carry RECEIVE-001 receipt prompts and partial/full replies with current-session and current-assignment checks; acceptance must assert both.

**Evidence.** None.
**Gap.** Native iOS and Android apps, push, barcode and offline receiving not built

### Suppliers

#### SUPPLIER-001 — Self-service supplier onboarding

Core · target · **missing** · Cites BASE-INPUT-001, BASE-MAIL-001

**Requirement.** A buyer invites a supplier by email, or the invite starts from a SUPPLIER-008 new-supplier proposal (sent by the buyer, or automatically where the business turns on auto-invite), to a no-account onboarding link where the supplier enters legal name, DBA, entity type, address, contacts, remit-to, W-9 (TIN, federal tax classification, backup-withholding certification and e-signature), certificate of insurance, diversity certificates and payment terms. The submission is reviewed and activated by the buyer or, where the business configures one, through SUPPLIER-008's vendor approval chain, with SUPPLIER-002, SUPPLIER-003 and SUPPLIER-007 checks still in force; the supplier can return through a fresh link to update details, which then go back to review. The supplier-link door must preserve SUPPLIER-004’s private single-use document refresh, buyer review, reminder cycles and required-document PO holds.

**Acceptance.**
1. Refresh an expiring document through the supplier link under SUPPLIER-004 and retain its private history and current hold until buyer review.
2. Invite a supplier, complete onboarding from the link on a phone with a W-9 and COI, review and activate; the supplier becomes purchasable and its documents download.
3. With a vendor approval chain configured, the same submission waits for the chain and the buyer alone cannot activate it.
4. Before shipping, Supplier-link TIN/bank/routing input inherits SECURITY-001 encryption and must never echo values back; assert this through the supplier link before shipping.

**Evidence.** None.
**Gap.** Supplier onboarding link, W-9 and COI capture not built

#### SUPPLIER-002 — Bank-detail change controls

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-MAIL-001

**Requirement.** Supplier bank and remit details are entered only by the supplier through SUPPLIER-001's link or by AP with evidence, then verified by a call-back to a previously known contact and an independent second approver before use. Account ownership is checked through a bank-verification provider (Plaid Auth with Plaid Identity Match, or the payment provider's own account verification): the account holder name returned by the provider is compared with the supplier's verified legal name and DBA, and a mismatch, an unverifiable account or a provider error blocks activation of the new details until AP resolves it with evidence, keeping the provider, result, score and time on the supplier. Any change emails the previous contact, places pending payments to that supplier on hold and is audited; a change requested by email alone is never applied.

**Acceptance.**
1. Change a supplier's bank details through the link, see payments hold, the old contact notified and activation refused until a second approver records the call-back; an emailed change request cannot alter the details.
2. Replay a provider-sandbox result whose account holder does not match the supplier's legal name: activation stays blocked even after the call-back and second approval, the result is recorded on the supplier, and a matching result then lets the second approver activate.
3. Before shipping verified bank details, provide INVOICE-003 the verified supplier baseline and provenance, flag changed remit details and refuse payment approval until AP review; risk review must never manufacture verification.
4. Acceptance must assert a changed-bank invoice through the invoice and payment doors.
5. Before shipping, Activation of SECURITY-001 stored bank details requires the call-back, independent approval, provider verification and payment holds here; storage or reveal alone never activates them.

**Evidence.** None.
**Gap.** Bank-detail entry, call-back, second approver, Plaid verification and payment hold not built

#### SUPPLIER-003 — Duplicate supplier detection

Core · target · **done** · Cites BASE-INPUT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-SECRET-001

**Requirement.** New and imported suppliers are checked against existing ones by TIN, normalized legal name and DBA, email domain, address, phone and bank account; possible duplicates are shown before creation and can be merged, keeping both histories. Matching is deterministic: legal names and DBA remove punctuation, spacing and accents and ignore case; email domains ignore case; addresses use the same text normalization; US phones ignore formatting and an initial country code 1. TINs and routing/account pairs use keyed HMAC-SHA-256 with a private, portable business matching key. Native matching-only companion inputs are never stored in full; their fingerprints are excluded from ordinary state, documents and duplicate-review responses, and are never called tax validation, bank verification or certification. CSV TIN and bank columns are accepted and converted to matching fingerprints. The stored original redacts those cell values, preserving every other byte, and custody retains an accompanying JSON artifact with the original-file digest, retained-file digest and redacted-column list: the file digests stay in owner-bound import custody and are excluded from ordinary supplier state. This is PUR-013's one named exception to exact original-byte retention. Native creation with possible matches requires a explicit review and a reason for keeping a separate supplier; import's exact preview and reviewed commit show existing and same-batch matches. A merge requires a buyer review and reason, and is refused while either supplier is blocked or pending screening. It keeps both supplier rows and their existing histories: the source is a nonpurchasable alias; immutable approved/issued identities and every PO/invoice link remain unchanged, and the surviving register joins both histories. Source drafts and approvals require a normal supplier amendment and renewed authority; issued receiving and invoice evidence continue against their original POs, and an existing issued PO can close/reopen under the surviving supplier's holds and ordinary PO-010 authority. Invoice-reference duplicate checks span the merged family. Today's native and CSV doors conform; SUPPLIER-001/002, SECURITY-001, IMPORT-001/002, SYNC-001/002/003/004/006/007/008 and API-001 inherit matching, merge/custody and sensitive-storage obligations before adding full sensitive storage, provider pulls or another creation door.

**Acceptance.**
1. Create a supplier differing only by punctuation and one sharing a TIN with an existing record; both are flagged, and a merge keeps every PO and invoice link.

**Evidence.** `src/purse/supplier-matching.ts`; `src/purse/supplier-identity.ts`; `src/purse/supplier-csv-custody.ts`; `src/purse/supplier-merge.ts`; `tests/supplier-duplicates.test.mjs`; `tests/browser-supplier-duplicates.mjs`
**Gap.** None.

#### SUPPLIER-004 — Document expiry, compliance refresh and renewal reminders

Core · target · **partial** · Cites BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Insurance certificates, W-9s, licenses, security reviews and agreements carry expiry dates; Purse emails the supplier and owner before expiry on a buyer-configured schedule, requests refreshed documents through the standalone supplier-link refresh branch, and can block new POs to a supplier whose required document has lapsed. A buyer records the private original, required flag, expiry, reminder day offsets and optional compliance-cycle days. Dates are inclusive calendar dates in America/New_York; a lapse starts on the following day, and a compliance cycle runs from the last substantive buyer review (schedule-only edits do not restart it). Hourly cron processes the most recently due expiry offset or due cycle once per document version; missed earlier offsets are not sent in a burst. An uncertain or rejected attempt is retained without automatic resending; a buyer can explicitly request a fresh link. Links use 32 random bytes, retain only SHA-256 hashes, expire after seven days, bind one supplier/document/version, and allow one private file upload only, with no existing-file or register access. Compliance bytes are buyer/owner-only from the moment of upload; ordinary supplier attachments keep their existing scope. A supplier upload stays pending until a buyer reviews its evidence and expiry, so upload alone cannot clear a lapse. Metadata, original files and prior reviews remain in history and portable archives; active bearer links never travel in archives. Required-document holds cover the entire surviving supplier family after SUPPLIER-003 merges and refuse native conversion and issuance while existing issued receiving and invoice evidence remain usable; screening and manual blocks remain independent. This is complete for document-refresh branch and native new-PO doors. SUPPLIER-001 inherits this refresh branch before full onboarding ships; PO-001, PO-005, PO-008, PUNCHOUT-001, IMPORT-003 and API-001 inherit the same required-document hold before adding another PO creation/transmission door.

**Acceptance.**
1. Advance the clock past a COI's reminder and expiry dates; the supplier and owner are emailed, the refreshed COI clears the warning after buyer review, and a lapsed supplier's new PO is held.
2. Upload through the supplier link while signed out; it can upload once, cannot read previous evidence, and leaves the lapse in place until review.
3. A requester cannot download private compliance files or request a refresh link; merging a supplier with a required lapse cannot bypass the hold.

**Evidence.** `src/purse/supplier-documents.ts`; `src/purse/supplier-reminders.ts`; `src/purse/supplier-refresh.ts`; `tests/supplier-documents.test.mjs`; `tests/browser-supplier-documents.mjs`
**Gap.** Asserted: Supplier reminder is sent to its contact; Owner reminder is sent to the owner; Buyer review clears the lapse. No complete asserting-line trace is recorded for point 2: A link holder’s direct request for earlier file bytes is refused.

#### SUPPLIER-005 — Supplier performance and issues

Core · target · **done** · Cites BASE-MAIL-001

**Requirement.** Each supplier shows on-time delivery against promised dates, quality rejections and returns, invoice accuracy (match exceptions per invoice), acknowledgment speed, spend and open issues, with issue records (late, damaged, wrong item, billing) linked to POs and resolved with reasons.

**Acceptance.**
1. Record late and rejected deliveries and an invoice mismatch for a supplier; its scorecard reflects each and every figure drills to the records behind it.

**Evidence.** `tests/supplier-performance.test.mjs`; `tests/browser-supplier-performance.mjs`
**Gap.** None.

#### SUPPLIER-006 — 1099 readiness

Core · target · **missing**

**Requirement.** Suppliers carry 1099 eligibility from their W-9, a default 1099-NEC or 1099-MISC box, and backup-withholding status; payments recorded through AP-001 and AP-002 total by calendar year per box and export to the ledger ([Pantry](https://github.com/just-every/run-pantry), QuickBooks Online, QuickBooks Desktop, Xero, NetSuite, Sage Intacct or Business Central, each vendor's 1099 eligibility and box set in that ledger's own 1099 fields through SYNC-001 to SYNC-008) or a filing partner such as Track1099 or TaxBandits. Purse does not file returns.

**Acceptance.**
1. Pay 1099 and non-1099 suppliers across a year end; the year's 1099 report totals only eligible payments by box and the export matches the payment records.
2. Sync the 1099 suppliers to a QuickBooks Online sandbox company, a QuickBooks Desktop sample company, a Xero demo company, a NetSuite sandbox, a Sage Intacct sandbox company, a Business Central sandbox and a local Pantry installation: each vendor carries its 1099 eligibility and box in that ledger, and the non-1099 supplier carries none.

**Evidence.** None.
**Gap.** 1099 eligibility, box totals and export to each ledger's 1099 fields not built

#### SUPPLIER-007 — Restricted-party screening

Core · target · **done**

**Requirement.** New suppliers and changes of name or address are screened against the US Treasury OFAC SDN list (through the public list or a screening provider); possible matches block activation for compliance review, and the screening result and source date are kept.

**Acceptance.**
1. Onboard a supplier whose name matches a test SDN entry; activation is blocked pending review and the result records the list version.

**Evidence.** `tests/supplier-screening.test.mjs`; `tests/browser-supplier-screening.mjs`
**Gap.** None.

#### SUPPLIER-008 — New-supplier requests and vendor approval

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-MAIL-001

**Requirement.** A requester or buyer who needs a supplier that is not in the register proposes one on the request line, as Procurify's "OTHER" vendor and "Request new vendor" do, or from the Suppliers page without a request: name, contact email, optional website, phone and TIN, and the reason this supplier is needed. Before the proposal is saved, SUPPLIER-003's duplicate check runs on the name, email domain, website and TIN and offers any existing match, which the requester can pick instead; a matching blocked supplier (PUR-002) is shown as blocked and cannot be proposed again. A proposed supplier is a pending supplier record whose status is one of proposed, invited, onboarding, in vendor approval, active or rejected, and it is never purchasable until active. The request carries the pending supplier, is submitted and routed under APPROVAL-001 with new-supplier status true, can be approved while the supplier is pending, and BUDGET-001 reserves its amount on approval as for any request. The proposal starts SUPPLIER-001's onboarding invite to the contact email, sent by the buyer or automatically where the business turns on auto-invite. Activation then passes through a vendor approval chain that the admin configures separately from purchase chains, using APPROVAL-001's step types (sequential and parallel, "all of" and "any one of", with conditions on entity, category, supplier risk and 1099 status) with APPROVAL-002's reminders, escalation and out-of-office and APPROVAL-003's channels; SUPPLIER-002's bank verification, SUPPLIER-003's duplicate check and SUPPLIER-007's screening must also clear, and the person who proposed or submitted the vendor can never decide its vendor approval step. Until the supplier is active, converting lines to a PO (PUR-008), issuing, sending or transmitting a PO (PO-001, PO-008, PUNCHOUT-001) and paying it (AP-001, AP-002) are refused through the web, the API, Slack, Teams and the native apps with the reason "supplier pending vendor approval". When the supplier activates, the approved request converts (automatically under PO-008, or by the buyer) without a second purchase approval; if activation changed a term the request carried (currency, payment terms, a supplier-quoted price or the supplier's legal entity), the change becomes a PUR-009 amendment re-routed under APPROVAL-001. The requester sees the supplier's onboarding and vendor approval status, and who holds it and since when, on the request, and NOTIFY-001 tells them when it activates or is rejected. A rejected vendor returns the request to the requester with the approver's reason and releases its reservation, and the requester can pick another supplier and resubmit. Every proposal, invite, decision and bypass is in AUDIT-001.

**Acceptance.**
1. A requester raises a $900 catering request naming an unknown caterer with an email address and a reason: the request routes with the new-supplier step and is approved, and the department budget shows $900 reserved.
2. The caterer receives the onboarding link and completes it, and the request shows the vendor approval chain (controller, then AP lead) and who holds it.
3. Until the AP lead approves, converting and issuing the PO are refused through the web and through the API with the pending-vendor reason.
4. After the AP lead activates the caterer, the PO is created and sent exactly once (one email in the test inbox), and the request carries no second purchase approval.
5. The buyer who submitted a vendor is refused when deciding that vendor's step.
6. A proposed supplier whose TIN matches an existing supplier is offered that supplier; picking it leaves the request with the existing supplier and no new-supplier step.
7. A vendor rejected by the controller returns its request to the requester with the reason, and the $900 reservation is released.

**Evidence.** None.
**Gap.** Requests accept only a register supplier (src/purse/requests.ts); new-supplier proposals, pending supplier status, the vendor approval chain and holding POs until activation not built

#### SUPPLIER-009 — Vendor routing from import and ledger sources

Core · target · **missing** · From SUPPLIER-008 · Cites BASE-AUDIT-001, BASE-MAIL-001

**Requirement.** Suppliers created by CSV import, ledger pull (SYNC-001 to SYNC-008) or API-001 go through the same chain unless the admin turns on a bypass for that source, as Procurify's vendor approval settings allow, and each bypassed creation is recorded in AUDIT-001. IMPORT-001 imports Procurify's vendor approval routing and its pending vendor requests.

**Acceptance.**
1. A vendor pulled from a QuickBooks Online sandbox enters the chain with the ledger-pull bypass off, and is active at once with it on, with the bypass recorded in the audit log.
2. A Procurify fixture with vendor approval routing and two pending vendor requests imports them as Purse's vendor approval chain and two pending suppliers linked to their requests.

**Evidence.** None.
**Gap.** Requests accept only a register supplier (src/purse/requests.ts); new-supplier proposals, pending supplier status, the vendor approval chain and holding POs until activation not built

### Sourcing and catalogs

#### SOURCE-001 — RFQ invitations and supplier responses

Core · target · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** A buyer sends a request for quotation to nominated suppliers with scope, quantities, response deadline and questions; suppliers respond through a no-account link with line prices, freight, tax, lead time, validity and files; reminders go before the deadline; responses land in PUR-005's comparison and the buyer awards one, with the award reason kept. The owner/buyer configures the exact native draft revision and nominated contact snapshots; supplier-link possession permits only reading those requirements/questions and appending that supplier’s response, never business reads, approval or request mutation. Links contain 32 random bytes, keep only SHA-256, expire exactly at the response deadline (at most 30 days), and buyer reissue revokes the old link atomically. Supplier replies may be revised strictly before the deadline; each version and exact original file remains immutable, and the latest response per supplier counts in comparison. Buyer/owner alone reads response history and originals. RFQs accept 100 requested lines, 50 nominees and 30 questions, with explicit refusal. Responses keep exact requested item/quantity/unit/SKU and supplied decimal prices; nothing is inferred. Every currency remains separate. Times require an explicit offset/UTC through the API, are chosen in the buyer browser’s labelled zone and stored as UTC instants; supplier deadlines show the installation zone. A reminder is after configuration and at least one hour before the deadline. The first hourly tick at or after it claims one reminder for each invited nonrespondent, only before the deadline; at/after the deadline the schedule records nonresponse and durably closes link authority. Every invitation, explicit reissue and reminder claims its attempt before the real mail adapter call; uncertain attempts never silently repeat. The supplier page uses strict-origin referrers (no path/query/token), exact same-origin POST and cross-site refusal. A buyer’s reasoned award rechecks the exact source request and latest selected response; its baseline is the actual first recorded RFQ offer in the awarded currency, ordered by the serialized offer sequence. Awarding that first offer is allowed with zero savings. Real supplier and response identities stay on the source quotations; the selected supplier, prices and terms create a new ordinary request draft needing fresh approval. Later responses cannot rewrite a retained award or approved revision. Approved awards feed REPORT-003 negotiated savings, and received cash-planning-approved invoice evidence feeds its honestly labelled realized savings, with original response/quote, award and invoice drill-through. Unawarded or unapproved offers count as neither. All configuration, invitation/reissue, mail outcomes, responses and awards enter AUDIT-001. Portable archives preserve requirements, all offers/files, history and award/source links while excluding bearer authority. ACCESS-001 and API-001 inherit scoped RFQ commands/reads; AGENT-002 inherits these invitation, response-version, source/privacy, first-offer and explicit-award obligations before its agent execution ships; ERASURE-001 inherits the new personal fields before erasure ships. Supplier original files are private R2 objects, up to three files of 10 MB (10,000,000 bytes) each; response metadata retains their exact size and SHA-256.

**Acceptance.**
1. Through authenticated HTTP and the web at 1440 and 390, invite three suppliers, receive two supplier-link responses with files and one revised offer, upload three 10 MB originals in one response and download each byte-for-byte, refuse a file over 10 MB and a fourth file without a response write, attempt a malformed offer without a write, compare current/historical versions and currencies, and award with the reason retained in a new exact draft.
2. The public form can correct and resubmit; reissue immediately makes the old link unavailable.
3. Through the actual scheduled door, send one before-deadline reminder with a mail-provider fake at the transport edge, record the third supplier’s missed deadline, and refuse expired GET, POST and reissue; repeated ticks and an uncertain invitation do not repeat a claimed send.
4. Assert wrong-role/signed-out refusals on config/award/send/reissue/originals, private response state, cross-site/source-line refusal and owner audit read/export.
5. Award $10,000 to $9,000, freshly approve, receive and invoice 60%: assert $1,000 negotiated and $600 realized only after cash-planning approval, drilling to both real source offers/files, award and invoice; unapproved/unawarded or mixed-currency offers never invent savings, and awarding the baseline itself fabricates no second offer.
6. A complete archive restore preserves valid response originals, all versions, mail outcomes and award links with no restored bearer keys.

**Evidence.** `src/purse/rfq.ts`; `src/purse/rfq-public.ts`; `src/purse/rfq-originals.ts`; `src/purse/rfq-mail.ts`; `src/ui/rfq.tsx`; `tests/rfq.test.mjs`; `tests/browser-rfq.mjs`; `scripts/installer/restore-rfq.mjs`
**Gap.** Asserted: Two suppliers and a revised offer reach the comparison; All three ten-megabyte originals download byte for byte; Oversize originals refuse without response or object writes. No complete asserting-line trace is recorded for point 1: Three supplier invitations are retained, Malformed offer refusal leaves response and storage counts unchanged, The entered award reason is read back.

#### SOURCE-002 — Quote document processing

Core · target · **partial** · Cites BASE-DATA-001, BASE-INPUT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** An attached supplier quote PDF or email becomes proposed item, quantity, unit price, unit, currency, freight, tax, lead time and validity fields, with per-field confidence and source page/quotation. The native reader handles labelled tables, item blocks and inline quantity/price text in PDFs, plain text and plain/HTML MIME email; it never guesses unseen values. Scans, images and other layouts use the source-bound external-reader prepare door: the person explicitly downloads the original through the existing private scoped download, chooses and runs a reader, and returns its structured proposal with exact attachment SHA-256/revision, request revision, quoted source text/page, confidence and declared model/provider/run reference. Purse never sends source bytes to a reader automatically, stores no provider key and labels the result "externally prepared reading; model/provider declared, not verified". The immutable original proposal, original bytes and every correction remain linked. This is a data proposal under PUR-014, not purchasing authority; preparation never submits, approves, issues or sends an order. Only the requester on their own editable native draft, or a buyer on a visible editable draft (including the owner's existing buyer authority), may prepare, correct or confirm; submitted/approved revisions never change. A missing field remains blank with zero confidence. Native confidence is a fixed source-match score, not a calibrated probability; external confidence is the reader's unverified declaration and a correction identifies its human actor. Confirmation requires every item, explicit freight/tax amounts (including zero), currency matching the request, lead time and validity, plus a reason and a exact source/review/request version. It alone creates a new editable request revision: mapped lines keep their category/project, part number, destination and coding, unmatched lines remain, and new lines require coding. The confirmed header tax replaces prior line tax allocations in proportion to revised line values, using the existing largest-remainder cent allocation. Lead-time/validity evidence and corrections survive later amendments and portable restore. Native reading refuses unreadable documents, unsupported charsets/transfers/layouts, PDFs beyond 50 pages, extracted text beyond 500,000 characters, more than 100 items or a field beyond 2,000 characters; it never truncates or invents blank item rows. The external proposal accepts 1–100 items with fields up to 2,000 characters.

**Acceptance.**
1. Through native HTTP and the web at 1440 and 390 pixels, attach a real text PDF, extract every commercial field with source/confidence, correct a quantity, and prove no revision changes until explicit confirmation.
2. Assert plain/MIME/HTML email, missing fields, original-byte retention, unchanged old revisions, stale/replayed/source-digest and wrong-role/signed-out refusals.
3. Read the real raster quotation in with image-only supplier text as an external vision reader, embed it as an image-only PDF, obtain the live source-bound instructions, upload the quoted reading through the public door, retain its declared provenance, correct a field and confirm a new draft; assert exact original downloads, immutable proposal/correction history and portable digest validation.

**Evidence.** `src/purse/quote-reading.ts`; `src/purse/quote-reading-source.ts`; `src/purse/quote-reading-proposal.ts`; `src/ui/quote-reading.tsx`; `tests/quote-reading.test.mjs`; `tests/browser-quote-reading.mjs`; `scripts/installer/restore-quote-reading.mjs`
**Gap.** Asserted: Text PDF description, quantity, unit and unit price are read; Freight, tax, lead time and validity are read; Confidence and page/line evidence are asserted for the listed read fields. No complete asserting-line trace is recorded for point 1: Currency is independently asserted, Unit confidence and its source page are independently asserted; point 2: Every wrong-role and signed-out reading door is refused.

#### CATALOG-001 — Catalog items, bundles and access

Core · target · **done** · Cites BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Admins and buyers maintain catalog items (supplier, part number, unit, price with validity dates, default coding, required attachments) and bundles (a named set of items and quantities, such as a new-hire laptop kit, requested as one choice and expanded into request lines). Each item and bundle can be limited to departments, locations, entities or roles; requesters see and can request only what they are granted, and the server refuses a request line for an item outside the requester's access. Until ACCESS-001 supplies a separate admin role, the owner acts as admin. The owner assigns catalog departments, locations and entity labels to members; purchasing roles come from membership. Access is OR within each nonempty dimension and AND across dimensions; an empty list is unrestricted and a missing member scope does not match a restricted list. Owners can request every item; buyers can inspect and maintain every item, but their own requests and buyer amendments for another requester enforce that requester's grants. A bundle requires access to itself and every component, without omitting restricted lines. Mixed-supplier or mixed-currency bundles expand atomically into one ordinary draft per supplier and currency, with the configured quantities and prices. Price validity dates are inclusive calendar dates in America/New_York, checked on draft creation and submission; approved price snapshots remain immutable. Category and project default onto lines, location and cost center onto the request; required attachment filenames must each be uploaded to that request before submission. This obligation is complete for catalog, coding and authenticated web/API doors; ACCESS-001/ACCESS-003, CODING-001/CODING-002, INTAKE-001/002/003, MOBILE-002, PUNCHOUT-001/002 and API-001 inherit it before adding a role, entity, coding kind, catalog provider or requesting door.

**Acceptance.**
1. Create an item limited to the Denver location and a bundle of three items for Engineering; a Denver requester sees the item and a Chicago requester does not, an Engineering requester adds the bundle and gets three priced lines, and a direct API request for the restricted item from Chicago is refused.

**Evidence.** `src/purse/catalogue.ts`; `src/purse/catalogue-access.ts`; `src/purse/catalogue-requests.ts`; `tests/catalogue.test.mjs`; `tests/browser-catalogue.mjs`
**Gap.** None.

#### PUNCHOUT-001 — Amazon Business PunchOut

Core · target · **missing** · Cites BASE-INPUT-003, BASE-MAIL-001

**Requirement.** Requesters punch out from Purse into the business's Amazon Business account (cXML PunchOut), build a cart under its buying policies and return it as request lines with Amazon item IDs and prices; after approval Purse transmits the PO by cXML OrderRequest, and Amazon order confirmations, shipments and invoices flow back to the PO, receipts and invoice matching. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.

**Acceptance.**
1. Against Amazon Business's PunchOut test environment, punch out, return a cart, approve, transmit the PO and receive the confirmation and invoice onto the same PO.
2. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them.
3. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.

**Evidence.** None.
**Gap.** Amazon Business cXML PunchOut and OrderRequest not built

#### PUNCHOUT-002 — Other PunchOut and hosted catalogs

Core · target · **missing** · Cites BASE-INPUT-003, BASE-MAIL-001

**Requirement.** The same cXML and OCI PunchOut path connects Staples Business Advantage, Grainger, CDW, Office Depot, Uline and Fisher Scientific, and suppliers' hosted catalogs can be loaded from CSV with price validity dates. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.

**Acceptance.**
1. Connect a cXML test catalog and an OCI one, return carts from each and transmit approved POs; a catalog CSV with expired prices is refused.
2. Each named supplier (Staples Business Advantage, Grainger, CDW, Office Depot, Uline and Fisher Scientific) then passes the same journey against its own PunchOut test catalog or test account: punch out, return a cart, transmit the approved PO and receive its order confirmation onto the PO.
3. The clause is done only when all six pass.
4. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them.
5. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.

**Evidence.** None.
**Gap.** Other cXML/OCI PunchOut catalogs and catalog CSV validity not built

#### STOCK-001 — Stockroom consumables

Core · target · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-MAIL-001, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** Office, cleaning and site consumables carry stockroom counts and reorder points; a count below its reorder point creates a draft request to the preferred supplier or PunchOut item for the owner to submit. Businesses that run warehouse inventory use [Pier](https://github.com/just-every/run-pier). A Pier operator sends replenishment needs through Purse's documented, authenticated purchase-request API door using a native session and the same-origin check; it creates a draft request only, never a PO. Scoped connector keys for unattended Pier calls belong to API-001 and remain required there. API-001 separately proves unattended access with a scoped connector key.

**Acceptance.**
1. Record a count below a reorder point; a draft request appears with the preferred item and quantity, and nothing is submitted until a person does.
2. Send a Pier replenishment need through the authenticated request door: the draft retains the preferred catalog item and quantity under the current requester, no PO is created and nothing is submitted; signed-out and cross-origin calls are refused.

**Evidence.** `src/purse/stockroom.ts`; `src/ui/stockroom.tsx`; `tests/stockroom.test.mjs`; `tests/browser-stockroom.mjs`; `API.md`
**Gap.** Asserted: Low count creates a new draft; The draft has the preferred catalogue item; The replenishment quantity is seven and a half. No complete asserting-line trace is recorded for point 2: Pier’s returned catalogue item and quantity are read back, Pier creates no PO, Signed-out and cross-origin Pier calls are independently asserted.

### Coding, allocations and custom fields

#### CODING-001 — Split allocations across codings

Core · target · **missing** · Cites BASE-AUDIT-001

**Requirement.** Any request line, PO line, receipt-matched bill line or non-PO bill line can be allocated across several codings, as Procurify's "Allocate to Account Code(s)" does. Each allocation is a full coding: GL account, department, location, class, project, entity (ACCESS-003) and the line's CODING-002 field values. A line is split by percentage, by amount, by quantity or equally, and the allocations must sum exactly to the line's amount (and, for a quantity split, its quantity); a split that does not is refused with the difference shown and nothing is written or reserved. Amounts are integer minor units under PUR-016: each allocation rounds half-up, and the remainder cent goes to the first allocation, so the allocations always total the line exactly. A request line's split carries to its PO line and from the PO line to its receipt-matched bill line; AP can re-split a bill line, or split one whose PO line had none, with the before and after kept in the audit (AUDIT-001). Admins save named split templates (for example "Copier lease: Denver 50 / Chicago 30 / Austin 20") and can default a supplier, catalog item or purchase type to one. Each allocation is its own coding everywhere downstream: BUDGET-001 reserves, commits and records actual against each allocation's budget; APPROVAL-001 rules that depend on a coded dimension (department, location, project, GL account, entity or a CODING-002 field) are evaluated for each allocation, so each allocated department's approver is asked where the rule calls for one, and an amount threshold applies to the allocated amount or the whole line as the rule is configured; each allocation posts as its own bill or PO line (or the ledger's distribution line) with its coding on every connection (SYNC-001 to SYNC-008), the bill staying one bill; REPORT-001, REPORT-002, REPORT-004 and AP-003 report each allocation under its own coding. A split changed by an approver edit (APPROVAL-004) or a PUR-009 amendment moves each affected allocation's reservation atomically under PUR-006's concurrency guarantee. A split across entities is refused unless intercompany posting between them is configured. Procurify split items arrive with their allocations (IMPORT-001). Before shipping this capability, every allocation must carry its own AP-003 cash coding without duplicating the bill or PO liability in weekly totals. Acceptance must assert this AP-003 integration through the capability’s public door. Its split allocation changes must record before/after codings and amounts in AUDIT-001. Acceptance must assert this obligation through its public door and AUDIT-001 read/export. Before shipping, REPORT-001 must group, filter and drill each split allocation under its own full coding, with currency totals equal to the unsplit purchase. Acceptance must assert the exact allocation figures and source rows through the public report door and web.

**Acceptance.**
1. Split a $3,000 non-PO utility bill 50/30/20 by percentage across the Denver, Chicago and Austin location budgets and approve it: the three budgets' actual figures move by exactly $1,500, $900 and $600, and REPORT-001 shows each amount under its location.
2. Sync the bill to a QuickBooks Online sandbox company and a Sage Intacct sandbox company: each ledger holds one bill with three lines coded to the three locations, and the SYNC-005 tie-out shows zero differences.
3. Split a $1,000 PO line equally across Engineering, Sales and Marketing under a chain whose department approver rule applies: the allocations are $333.34, $333.33 and $333.33, totaling exactly $1,000, each department's approver is asked, and each department's budget reserves its share.
4. Submit a 50/30/15 percentage split, and an amount split totaling $990 on the same $1,000 line: both are refused with the difference shown, through the web and the API, and no budget moves.
5. Before shipping, REPORT-001 must group, filter and drill each split allocation under its own full coding, with currency totals equal to the unsplit purchase.
6. Acceptance must assert the exact allocation figures and source rows through the public report door and web.

**Evidence.** None.
**Gap.** Split allocations by percentage, amount, quantity or equally, per-allocation budgets, routing and ledger lines, and split templates not built

#### CODING-002 — Custom header and line fields

Core · target · **missing** · Cites BASE-INPUT-001, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Admins define custom fields, as Procurify's custom fields do: header fields hold one value per request and PO (such as "Event"), and line fields hold one value per request line, catalog item, PO line and bill line (such as "Grant / Fund"). A field is text, number, date, yes/no, or a list whose values come from a Purse-maintained list or from a dimension pulled from the connected ledger and refreshed under SYNC-005 (a NetSuite custom segment or custom list, a Sage Intacct user-defined dimension, a Business Central dimension, a Xero tracking category, or a QuickBooks Online or Desktop class or location). Per purchase type (INTAKE-001) and entity, a field is required, optional or hidden, with an optional default per catalog item, supplier or department. The server validates every value: a submission missing a required field, or with a list value that is inactive or not in the list, is refused naming the field. Values travel with the record: a request's header and line values copy onto its PO and PO lines (PUR-008) and onto the receipt-matched bill lines (MATCH-001), they are entered on non-PO bill lines (INVOICE-004), and where a line is split under CODING-001 each allocation keeps its own line values. Changing a value after approval is an approver edit (APPROVAL-004) or a PUR-009 amendment, and admins choose whether each field is material. Custom fields can be APPROVAL-001 conditions and BUDGET-001 budget dimensions, and can filter and group REPORT-001, REPORT-002 (including its CSV, XLSX and OData output) and REPORT-004; API-001 reads and writes them. Each field maps, per connection, to the ledger's own place for it: NetSuite custom segments, transaction body fields (header) or transaction column fields (line); Sage Intacct user-defined dimensions or custom fields; Business Central dimensions; Xero tracking categories (at most two, as Xero allows); QuickBooks Online class or location; and QuickBooks Desktop class or custom field. A value with no mapping in a connected ledger, or one inactive there, holds the record in SYNC-005's error queue with the field and value named, and the record never posts without it. Procurify custom field definitions and values arrive with their types, list values and per-record values, including on adopted open POs (IMPORT-001, IMPORT-003). Before shipping, REPORT-001 must filter, group and drill header/line custom fields and GL account values with separate currencies and exact source rows. Acceptance must assert these dimensions through the public report door and web.

**Acceptance.**
1. Pull a "Grant" user-defined dimension from a Sage Intacct sandbox company, define a required "Grant" line field listed from it and a required "Event" header field, then raise, approve, issue, receive and bill a request with both: the PO and bill lines carry the values and the Intacct sandbox bill line carries the Grant dimension value.
2. Map the same field to a custom segment in a NetSuite sandbox and sync a second bill: the vendor bill line carries the segment value.
3. Submit a request without a Grant value: it is refused naming the field, through the web and the API.
4. Group REPORT-001 spend by Grant and see the bill's amount under its grant, drilling to the bill; add an APPROVAL-001 condition sending one grant to the grants manager and see it route there.
5. Deactivate a grant value in Intacct and push a bill using it: the bill lands in the SYNC-005 error queue naming the field and value.
6. Import a Procurify fixture with custom field definitions and values on an open PO: the adopted PO carries the values.
7. Before shipping, REPORT-001 must filter, group and drill current header/line custom fields and GL account values with separate currencies and exact source rows.
8. Acceptance must assert these dimensions through the public report door and web.

**Evidence.** None.
**Gap.** Custom header and line fields, ledger-dimension lists, carry-through to PO and bill lines, and ledger mappings not built

### Approvals and budgets

#### APPROVAL-001 — Multi-step conditional approval chains

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-MAIL-001, BASE-SIGNIN-001

**Requirement.** Chains combine sequential and parallel steps chosen by amount, department, location, project, category, GL account, entity, CODING-002 custom field values, supplier risk, new-supplier status (true while the request's supplier is a SUPPLIER-008 pending supplier) and the requester's manager hierarchy (from ACCESS-002 or the member record; a manager change re-routes steps not yet decided to the new manager); rules on a coded dimension are evaluated for each CODING-001 allocation of a split line. Sequential steps open one after another; parallel steps open together, and the chain moves on only when every one of them is decided. Each step is either "all of" (every named approver or reviewer must approve, in any order) or "any one of" a named group or pool, as Procurify's approval pools are: an "any one of" step reaches every member at once on every channel, and the first member to approve, reject or return decides it. When a pool step is decided, Purse withdraws it from the other members' queues, updates their Slack and Teams messages to show who decided and when, and refuses their email links, Slack and Teams actions and native-app actions with that reason (APPROVAL-003); the step records the deciding member. Condecisions on one step are serialized, so exactly one decides it and the others are refused. A pool member who is the requester is skipped and the step still needs another member to decide; if no other active member remains, it escalates as APPROVAL-002 says. Reminders, escalation and out-of-office apply to the pool as a whole (APPROVAL-002). The request shows which rule chose each step and why, and an amendment re-evaluates the chain against the new revision. Every sequential, parallel and pool decision, including the deciding pool member and the policy/route in force, must enter AUDIT-001 before this capability ships. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. Configure a chain that adds finance above $10,000 and IT for software; submit requests either side of each condition, see the route and reason before and after submission, and see an amendment re-route.
2. Make the finance step "any one of" a three-person finance pool: a $12,000 request reaches all three at once, the second member approves from Slack and the step is decided with that member recorded; the other two members' email approve link and Slack approve button are then refused, showing who decided, and the step has left their queues.
3. Two members approving one pool step at the same moment through the API: one decides and the other is refused.
4. A request raised by a pool member reaches only the other two members.
5. An "all of" parallel step naming IT and security stays open after IT approves and moves on only when security also approves.
6. A chain whose first step is "the requester's manager" sends a request to the manager SCIM-provisioned for that requester (ACCESS-002); a SCIM update that changes the requester's manager while the step is pending moves it to the new manager with the reason recorded, and the previous manager's links are refused.
7. A request naming a SUPPLIER-008 pending supplier gains the new-supplier step, and the same request with a register supplier does not.

**Evidence.** `tests/purse.test.mjs`; `tests/approval-chain-flow.mjs`; `tests/scim.test.mjs`; `tests/browser-intake.mjs`; `tests/browser-approval-pools.mjs`
**Gap.** Additional-step location, project, category, GL account, entity, custom-field, supplier-risk and new-supplier conditions; per-allocation rules and amount basis; manager hierarchy and manager-change re-route; scheduled pool escalation and out-of-office; email, Slack, Teams and native-app messages, actions and withdrawal qualification. A live Slack test workspace is not held. Current native conditions use whole-request amount, department and explicit purchase type, with the first line category as the legacy type fallback.

#### APPROVAL-002 — Approval reminders, escalation and out-of-office

Core · target · **missing** · Cites BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Pending approvers are reminded by email, Slack, Teams or push on the business's schedule in their time zone; after configured inaction the step escalates to the approver's manager or a named backup. An approver (or an admin for them) sets an out-of-office window with a start, an end in their time zone and a delegate who is an active approver with the same scope; during the window new steps and steps already pending route to the delegate with the reason "out of office" recorded on the step, and when the window ends steps not yet decided return to the approver. The delegate can never approve their own request; such a step goes to the approver's manager. On an "any one of" pool step (APPROVAL-001), reminders go to every member not away, escalation fires when no member has decided by the configured time, and a member's out-of-office leaves the step with the rest of the pool without adding their delegate; only when every member is away does the step go to their delegates. Requesters see who holds their request and since when, and the requester (or the buyer) can send the holder a one-off nudge with an optional message, at most once per step every 24 hours; the nudge goes through NOTIFY-001's channels, is recorded on the step and does not reset the escalation clock.

**Acceptance.**
1. Send a nudge with a message to a pending approver; it reaches their Slack with the message and is recorded on the step, a second nudge within 24 hours is refused with the time the next one is allowed, and the escalation still fires at its original time.
2. Leave a step pending past its reminder and escalation times; the approver is reminded, the backup receives the step, and the requester's view shows the holder and age.
3. Set an approver's out-of-office window for tomorrow, submit a request inside the window and see the step go to the delegate with the reason shown to the requester; leave it undecided past the window's end and see it return to the approver; submit a request raised by the delegate inside the window and see that step go to the manager.
4. Set one member of a three-person pool out of office and submit a request: the pool step reaches the other two members and no delegate; leave it undecided past its reminder and escalation times and see both members reminded and the step escalate once to the pool's backup.

**Evidence.** None.
**Gap.** Reminders, escalation, out-of-office routing, nudges and pool-wide reminders and escalation not built (scoped delegation is PUR-007)

#### APPROVAL-003 — Approve from any channel

Core · target · **partial** · Cites BASE-MAIL-001

**Requirement.** Approvers approve, reject or return from email links, Slack, Teams, the native app or the web, always against the exact revision and authority; a message for a superseded revision, or for a pool step another member has already decided (APPROVAL-001), cannot act, and the Slack, Teams and native-app message is updated to say why.

**Acceptance.**
1. Approve one request from an email link and one from Slack, amend a third after its email was sent and see that email's approval refused.

**Evidence.** `src/ui/requests.tsx`; `tests/browser-journey.mjs`
**Gap.** Email, Slack, Teams and native approval, and refusal of decided pool steps' messages, absent

#### APPROVAL-004 — Approver edits on a pending request

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-MAIL-001, BASE-ROLE-001, BASE-SIGNIN-001

**Requirement.** An approver holding a pending step can correct a request's header and coding without returning it, as Procurify's header editing allows: GL account, department, location, class, project, entity (ACCESS-003), need date, ship-to, the supplier (to another active, purchasable supplier) and notes to the supplier, on the header or per line. Admins choose per purchase type which fields approvers may edit and which are material (by default GL account, department, project, entity and supplier). Quantities, prices and lines are never approver edits; changing them is a return or a PUR-009 amendment, apart from the buyer's PO-012 edits at conversion within their variance limit. After approval, the requester or an approver may still change the need date as a non-material edit under PO-012, with no re-approval. An edit creates a new exact revision attributed to the approver, with the before-and-after values shown to the requester and every earlier approver, and the chain is re-evaluated against it (APPROVAL-001): if only non-material fields changed and the route is unchanged, earlier approvals carry forward with the difference recorded; a material change re-asks each earlier approver whose rule depended on the changed field, and any step the change adds (such as another department's approver) is inserted. Budget reservations move from the old budget to the new one atomically under PUR-006's concurrency guarantee. The editing approver then decides the new revision; an approver who is also the requester can neither edit nor approve it. Its approver edits must record the before/after values, actor, exact revision, carried or renewed approvals and policy context in AUDIT-001. Acceptance must assert this obligation through its public door and AUDIT-001 read/export. Native ordered policies reserve at submission and support configured header and line coding, active supplier corrections, class/date carry, material department/project renewal, independent allocation-budget owners, delegation and per-step SCIM handoff, and audited policy controls. Existing single-approver policies retain their timing. ct 22 Oct ruling: only edited-field before/after values reach the requester and every earlier approver across a lost read grant, including a changed department; private prior revisions and whole-policy snapshots stay withheld in state, command responses, value snapshots and audit. read grants do not widen. A material change still renews affected decisions. Different suppliers on individual lines remain refused until supplier-group PO conversion exists; ACCESS-003 supplies entity editing. Native approved need-date corrections retain approval and exact frozen document history; an explicit buyer sends the exact change and the supplier acknowledges that revision without gaining other record access. APPROVAL-001 retains parallel/pool/channel/manager-hierarchy obligations.

**Acceptance.**
1. As the second approver on a pending $4,000 request, change its class and need date: a new revision shows the difference to the requester, the first approval carries forward, and the step stays with the editing approver, who approves it.
2. On another request, change the department to one with a different budget owner: the reservation moves from the old department's budget to the new one once, the new budget owner's step is added and the first approver is asked again.
3. An approver's attempt to change a quantity through the API is refused.

**Evidence.** `tests/purse.test.mjs`; `tests/access.test.mjs`; `tests/browser-intake.mjs`; `tests/browser-approver-edits.mjs`; `tests/order-send.test.mjs`; `tests/browser-order-send.mjs`
**Gap.** Header/line coding, consistent active suppliers, configurable material controls, carry/renew/reservation moves, delegation/SCIM, ruled field-only earlier-approver visibility and explicit exact-revision supplier change send/ack implemented. Different per-line supplier groups and ACCESS-003 entity/accounting qualification remain; distinct authorized ledger sandbox companies/connections are not held

#### COMMENT-001 — Internal comments and @mentions

Core · target · **missing** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Anyone who can see a request, travel request (INTAKE-006), PO, invoice, MATCH-002 exception, supplier or agreement can add an internal comment, with attachments under PUR-004's file limits and @mentions of members chosen from a picker. Comments are a separate internal thread: they never go to the supplier and never appear on PO-001's or SUPPLIER-001's links, on PO documents (PO-009) or in PO-002's supplier thread, and agents treat them as data, never instructions (AGENT-010). Commenting never changes a record's state: a pending approval step stays with the same approver at the same queue position and age, and only PUR-007's return decision sends a request back. A mention notifies the person through NOTIFY-001's channels (email, Slack, Teams, push and the in-app list, with recent comments and mentions on their dashboard); a reply from that Slack or Teams thread or email posts back onto the record as a comment by the replying member, through the sign-in binding of INTAKE-002 and INTAKE-003. A mention never widens access: a member mentioned on a record outside their ACCESS-001 scope gets a notification saying who mentioned them and that they lack access, with no record title, amount or comment text, and the commenter is told that the member cannot see the record. Authors can edit or delete their own comments, with every version kept in the audit log; comments travel in AUDIT-001 exports and PUR-012's archives, and ERASURE-001 anonymizes their authors while keeping the business record. Its comments, edits and deletions must retain every version and actor in AUDIT-001 exports. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. As an approver, comment on a pending request and @mention the requester: the requester is notified in Slack, replies in the Slack thread, the reply appears on the request, and the step is still pending with the same approver and unchanged age.
2. Comment on an issued PO with an attachment: the supplier's test inbox receives nothing, and the supplier link and PO PDF show no comment.
3. Mention a member outside the request's department scope: they are notified without the request's content, and their API read of the request is refused.
4. Export the audit log and an archive, restore the archive into an empty installation, and see the comments and their edit history.

**Evidence.** None.
**Gap.** Internal comments, @mentions, mention notifications and scope-safe mentions not built

#### BUDGET-001 — Budgets and live budget position

Core · target · **partial** · Cites BASE-ROLE-001

**Requirement.** Budgets are set per department, location, project, GL account, CODING-002 custom field (such as a grant) or combination, by month, quarter or fiscal year (any US fiscal year start), in USD. Each budget shows amount, reserved by pending requests, committed by issued POs, adopted open POs (IMPORT-003) and funded card purchases (CARD-001), actual from matched and synced bills and from settled card transactions (CARD-002), with a PO-011 deposit counted as actual once when its invoice is approved and never again through the final bill's deposit credit, and available; a line split under CODING-001 reserves, commits and records actual against each allocation's budget by its share; requesters and approvers see the position at the moment they ask or decide. A buyer's PO-012 edit at conversion moves the reservation to the edited amount and commits that amount atomically when the PO is issued, per allocation for a split line; an edit that takes a budget over follows the over-budget configuration. Over-budget requests are blocked or routed to a budget-owner step by configuration. Before shipping, REPORT-001 must show period budget versus reserved, committed, actual and available for every supported budget/allocation, without deducting the same purchase twice, with exact source drill-through. Acceptance must assert these figures through the public report door and web. Native dated department/project/location/GL and native-form custom-field policy budgets select inclusive request need dates within an explicit period of at most one fiscal year. The position retains received-but-unbilled commitments, moves recorded invoice evidence to actual once, and includes imported deposit/net-credit and approved travel-expense evidence without a payment or matched/synced-bill claim. Each supported allocation inherits header/line location and GL or uses its explicit overrides, and reserves, commits and records actual against its own dated policy; its own over-budget configuration applies. Native buyer edits settle the changed amount once and independent budget-owner steps are required for each overage. ct 22 Oct ruling: a requester or approver with access to that budget sees complete amount, reserved, committed, actual and available; purchases outside read grants appear only as summed “Other purchases you cannot see,” without identifiers, details or drill-through. A viewer without a budget grant sees nothing; no partial sum is labelled complete. Request review and REPORT-001 use those same positions with permitted source links. Native form selectors bind form identity and header/line scope, and combined budgets retain recorded historical identities; ambiguous mappings refuse. Cross-period dispositions, fully matched/synced bills and native deposits, and CARD-001/002 funded/settled provider evidence remain gaps.

**Acceptance.**
1. Set a quarterly department budget, raise, issue and bill purchases against it and see reserved, committed, actual and available move at each step; approve a card-paid request and replay its settled transaction and see committed move to actual with no bill; an over-budget request routes to the budget owner.
2. Issue a $1,000 PO line split 60/40 across two department budgets and bill it: each budget's committed figure moves by $600 and $400, then to actual by the same amounts, and the over-budget check applies to each department's share.
3. Approve a $1,000 request, let a buyer convert it at $1,065 within their PO-012 limit and issue it: reserved falls by $1,000 and committed rises by $1,065 in one step, and available falls by the $65 difference.
4. Before shipping, REPORT-001 must show period budget versus reserved, committed, actual and available for every supported budget/allocation, without deducting the same purchase twice, with exact source drill-through.
5. Acceptance must assert these figures through the public report door and web.

**Evidence.** `tests/spend-report.test.mjs`; `tests/po-documents.test.mjs`; `tests/browser-intake.mjs`; `tests/browser-approver-edits.mjs`; `tests/browser-budget-dimensions.mjs`; `tests/travel.test.mjs`
**Gap.** Dated department/project/location/GL/native-form custom-field combinations, complete ruled budget figures with anonymous hidden-purchase sums, $1,000 to $1,065 and 60/40 reserve/commit/recorded actual, per-share owner routing and exact REPORT-001 sources implemented. Cross-period disposition, fully matched/synced bills/native deposits and CARD-001/002 provider-funded/settled evidence remain; Ramp/Brex partner issuing qualification and authorized ledger connections are not held

#### BUDGET-002 — Budget import and ownership

Core · target · **missing**

**Requirement.** Budgets import from CSV, a spreadsheet or [Easel](https://github.com/just-every/run-easel) and from the accounting system's budgets where available, with named budget owners who receive threshold alerts at configured percentages. Ledger budgets are pulled from QuickBooks Online (Budgets), Xero (Budgets), NetSuite (budgets) and Sage Intacct (GL budgets) when connected, mapped to Purse's department, location, project and GL dimensions for review.

**Acceptance.**
1. Import a budget file, assign owners, and cross 80% of a budget; the owner is alerted once and the import is previewed before it writes.
2. Import an Easel budget export from a local [Easel](https://github.com/just-every/run-easel) installation and pull a budget from each of a QuickBooks Online sandbox company, a Xero demo company, a NetSuite sandbox and a Sage Intacct sandbox company; each is previewed with its dimension mapping and writes only after review, and a re-pull of an unchanged budget writes nothing.

**Evidence.** None.
**Gap.** Budget import, owners, threshold alerts and Easel, QuickBooks Online, Xero, NetSuite and Sage Intacct budget pulls not built

### Purchase orders and supplier communication

#### PO-001 — POs sent to suppliers and acknowledged

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Issuing a PO emails it to the supplier's order contact as a PDF with PO-009's content from the business's own sending identity (RER mail relay or the buyer's Postmark account), with a no-account link where the supplier accepts, accepts with changes (dates, quantities, prices), or rejects, and gives a promised delivery date. Acknowledgment status and promised dates show on the PO for the buyer and requester; supplier-proposed changes become a PUR-009 amendment for approval, never a silent edit. Bounces and unopened orders are visible. POs adopted from a previous system (IMPORT-003) are never sent unless a person issues an amendment or explicitly re-sends one. A PO is never issued or sent to a supplier that is not active (SUPPLIER-008). Real supplier acknowledgments and changed promised dates feed PO-003 eligibility before this sending door ships; an acknowledgment stops acknowledgment-only chasing, while overdue delivery still follows its promise. Its PO sends, outcomes and acknowledgment-status changes must enter AUDIT-001 with the exact issued revision and actor. Acceptance must assert this obligation through its public door and AUDIT-001 read/export. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF. PO-001 send boundary (ct 23 Oct 2026). Initial sending inherits PO-004's floor: explicit consent to the exact issued revision and named contact; a link of at most seven days that reads only the document and originals; a stated, unverified name; one claimed native mail attempt with an honest outcome and no automatic retry; explicit human re-send under PO-issuance scope. Issue-and-send may be one explicit buyer action. The link records accept, reject with a reason and the promised delivery date directly on the PO, labelled supplier-stated and unverified, and feeding PO-003. Proposed quantity, price, term, item or line-date changes are retained immutably as proposals. A buyer with scope adopts one into a PUR-009 amendment draft that needs fresh approval, or declines it with a reason. Nothing edits the issued PO. IMPORT-003 adopted POs are sent only by an explicit buyer re-send. PO-008 automatic sending is permitted only under an owner-consented standing rule (purchase type, supplier/amount manual-review thresholds, contact on file). Rule or owner changes pause it. The interim sender is the owner/admin-configured RER native sender. The buyer's Postmark account inherits SECURITY-001 before shipping.

**Acceptance.**
1. Issue a PO to a test inbox, acknowledge it with a changed date from the link and see the date on the PO, then propose a price change and see an amendment created for approval; a bounced address shows as undelivered.
2. Issuing a PO to a supplier still in vendor approval is refused and sends nothing.
3. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them.
4. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.

**Evidence.** `tests/order-send.test.mjs`; `tests/browser-order-send.mjs`
**Gap.** Real own-sender test inbox receipt, bounce/undelivered and unopened tracking, RER relay/Postmark qualification and automatic issue-time sending remain unproved. Held Resend credential is rejected. ct 23 Oct approved interim floor: explicit exact-revision buyer/contact consent, bounded document/original link, unverified stated identity, no automatic retry or silent commercial edit; buyer adoption creates a fresh approval revision. PO-004/008 inherit this sending boundary.  ct 23 Oct ruling: explicit human re-send/link reissue, adopted-PO re-send, reasoned buyer decline, change-link full response set and buyer Postmark sender remain unbuilt; real own-sender inbox, bounce and unopened proof NOT RUN. Automatic sending under an owner-consented PO-008 standing rule remains a required target, not prohibited by the interim explicit-send door.

#### PO-002 — Supplier messaging on the PO

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001

**Requirement.** Each PO has a message thread with the supplier: buyer messages go by email, supplier replies to that email thread back onto the PO with attachments, and the requester sees the thread. Messages are retained with the PO and travel in archives. Every live supplier reply must appear in PO-003’s requester-visible follow-up history before this thread ships, alongside its recorded chase outcomes. Its supplier-thread sends and outcomes must enter AUDIT-001 with the PO and acting member. Acceptance must assert this obligation through its public door and AUDIT-001 read/export. Reply routing binds the exact PO revision, recipient and content consent, expires after thirty days and is revocable. Provider-signed, hydrated replies are admitted only for the nominated address, retain private source custody and an unverified-sender label, and never regain routing authority through replay or restore. Expired routing needs explicit renewal. The adopted boundary is RL-101.

**Acceptance.**
1. Send a question from a PO, reply from the supplier inbox with an attachment, and see the reply and file on the PO for the buyer and requester.

**Evidence.** `tests/order-thread.test.mjs`; `tests/browser-order-thread.mjs`
**Gap.** Exact bounded native messaging is implemented; real inbox/attachment receipt and broader supplier reply qualification remain unproved. RL-101 resolves the policy boundary.

#### PO-003 — Overdue acknowledgment and delivery chasing

Core · target · **done** · Cites BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Unacknowledged POs and deliveries past their promised or need date are chased automatically by email on a buyer-configured cadence, escalated to the buyer after a configured number of chases, and visible to the requester with each chase and reply. Buyers enable a versioned schedule per issued native PO, choose a cadence in elapsed 24-hour days, an attempt limit and an active buyer (or the configuring native owner) for escalation. New York calendar dates are inclusive: delivery is overdue on the next day. Without a recorded acknowledgment, the first acknowledgment chase is due after one cadence from issuance; an overdue delivery is eligible immediately. Later attempts wait at least one cadence. Each saved schedule starts a new limit; prior versions and every event remain in history. The limit counts scheduled attempts, including rejected, unavailable or uncertain mail outcomes, and triggers one escalation after the final attempt. Each deterministic attempt is recorded before its external effect; an interrupted attempt stays unknown and is never silently repeated. Provider acceptance is not called mailbox delivery and development mail is labelled suppressed. Chases use the immutable approved PO order-contact snapshot, while surviving-supplier blocking, screening and required-document holds suspend them. Imported/adopted POs, superseded amendments, closed POs and POs with no outstanding balance are never chased. Shared PO-010 line eligibility excludes closed quantities; closing all outstanding quantities stops an active chase. Requesters see only their scoped POs' chase/outcome history and every existing buyer-recorded supplier reply, acknowledgment and promise source; recording issuance alone never manufactures an acknowledgment. This is complete for issued-PO and recorded-communication capabilities; PO-001 must feed real supplier acknowledgments/promised dates into this eligibility and PO-002 must include live replies in this requester-visible follow-up before those doors ship.

**Acceptance.**
1. Advance the clock past a PO's promised date; the supplier receives chases at the configured cadence, the buyer is alerted once after the limit and the requester's view shows each chase and recorded reply.
2. Change the directory contact after issuance: chases still use the approved PO contact.
3. Close an actively chased PO under PO-010 and advance the clock: neither another chase nor escalation is sent.
4. A blocked or document-lapsed surviving supplier is not chased, and adopted history cannot be enabled for chasing.

**Evidence.** `src/purse/order-chasing.ts`; `tests/order-chasing.test.mjs`; `tests/browser-order-chasing.mjs`
**Gap.** None.

#### PO-004 — Change orders and cancellations sent

Core · target · **partial** · Cites BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Approved amendments and cancellations are sent to the supplier as numbered change orders and re-acknowledged through PO-001's link; the PO shows the acknowledged revision. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF. Native change sending uses an explicitly consented scoped buyer action for the exact approved numbered revision and named contact, a maximum seven-day link limited to its frozen document/originals and an unverified stated-name acknowledgment, one claimed mail-adapter attempt and honest outcome labels. Default ADOPTED pending ct for the supplier-link and native-mail boundary; no automatic initial-PO sending or mailbox-delivery claim. PO-001 and future cXML/entity/deposit sending inherit the frozen-content, current-authority, source-erasure and bearer-lifecycle obligations before shipping. PO-004 send boundary (ct 23 Oct 2026). The adopted boundary is approved as the floor: Explicit buyer consent to the exact approved numbered revision or approved cancellation, and to the named contact, under PO-issuance scope. A supplier link that lasts at most seven days, reads only the frozen document and originals, and accepts only an exact-origin POST. Acknowledgment by a stated name, labelled unverified, that changes nothing commercial. One claimed native mail attempt with an honest outcome. Nothing retries automatically. A buyer with scope may explicitly re-send after an uncertain, failed, bounced or unavailable outcome, or after the link expires unacknowledged. The re-send needs a reason, fresh consent, and optionally a corrected contact. It revokes the old link and sends the same frozen PDF and content hash as a new claim-once attempt. Every attempt keeps its outcome. An approved cancellation of an already-sent order version is its own numbered send. When PO-001's reply link ships, change-order links carry its full reply set. Provider bounce and delivery events update the attempt. An acknowledgment is never presented as a signature or contract acceptance. The RL-102 floor retains exact buyer/contact consent, a bounded document-only link, an unverified acknowledgment and a claim-once native send attempt. Explicit resend and link reissue, cancellation, later replies and delivery remain in scope.

**Acceptance.**
1. Approve a quantity amendment on an issued PO; the supplier receives change order 1, acknowledges it and the PO shows the acknowledged revision.
2. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them.
3. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.

**Evidence.** `tests/order-send.test.mjs`; `tests/browser-order-send.mjs`
**Gap.** Explicit native change sending is implemented; actual mailbox delivery, explicit resend/link reissue, cancellation and later reply/delivery behavior remain unproved. RL-102 resolves the policy boundary.

#### PO-005 — Blanket purchase orders and releases

Core · target · **done**

**Requirement.** Remaining balances count as commitments. Native blanket invoice draw-down uses the approved request/PO total as its integer-minor-unit cap, including recorded freight and tax, and an inclusive calendar validity period in the installation timezone. Issuance outside that period requires amendment and renewed approval. Each unique invoice evidence record consumes the cap once across issued amendments, including held evidence; an amendment replaces the cap without adding prior faces. Invoice dates outside the approved period and totals above the remaining cap create reviewable risk flags; unresolved flags refuse cash-planning approval. Receipts do not release an invoice draw-down twice. Remaining cap authority stays committed, with source-linked invoice actuals in REPORT-001; AP-003 retains its approved-bill and remaining-liability distinction. The HTML/PDF freezes the approved cap and validity with PO-009 content and numbered amendment differences. Native releases earmark the same cap without a second commitment, require a issued revision and retain their own invoice balance.

**Acceptance.**
1. Create a $24,000 annual blanket PO, invoice against it three times and see the balance fall and an over-cap invoice flagged.
2. Before shipping blanket, recurring or new service order kinds, INVOICE-003 must compute the correct current PO/release cap and previously billed balance without summing superseded faces; acceptance must assert an over-cap invoice flag and unresolved-flag payment refusal.
3. Additional PO-005 proof: current amended validity accepts both inclusive endpoints, flags the preceding day, and exact invoice replays consume the balance once (tests/blanket-orders.test.mjs).

**Evidence.** `tests/blanket-orders.test.mjs`; `tests/blanket-orders.test.mjs`; `tests/browser-blanket.mjs`; `tests/browser-blanket-kinds.mjs`; `tests/browser-po-kinds.mjs`
**Gap.** None.

#### PO-013 — Service receiving by value

Core · target · **done** · From PO-005

**Requirement.** Service POs receive by amount, by named milestone with its value, or by cumulative percentage complete; MATCH-001 compares invoices with the received value.

**Acceptance.**
1. Receive 40% complete on a $10,000 service PO: a $6,000 invoice goes to MATCH-002 exceptions as exceeding the received value and a $4,000 invoice matches.

**Evidence.** `tests/blanket-orders.test.mjs`; `tests/blanket-orders.test.mjs`; `tests/browser-blanket.mjs`; `tests/browser-blanket-kinds.mjs`; `tests/browser-po-kinds.mjs`
**Gap.** None.

#### PO-014 — Recurring order generation and renewal checks

Core · target · **partial** · From PO-005 · Cites BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Before each recurring order is generated, the renewal check compares it with the series' linked agreement (CONTRACT-001) and its budget: if the order would fall after the agreement's end date or inside its notice period, exceed the agreement value or the remaining budget, or the supplier is blocked or lapsed (SUPPLIER-004), the series pauses and the PO owner is asked to continue, amend under PUR-009 or end it, with the reason shown; otherwise the order is generated. A native owner configures an exact issued-template monthly series with its linked agreement, dates and bounded order count; the designated non-self approver explicitly authorizes that series. Each scheduled generation rechecks native owner/approver versions, policy/grants, template, agreement, supplier and budget, then atomically records a distinct order, decision provenance and commitment. A failed renewal pauses visibly for the owner’s reasoned continue, amendment or end disposition. No supplier send is implied by generation. APPROVAL-001/002, PO-001/004/008, MATCH-001/002 and API-001 inherit these source, renewal and current-cap obligations before adding their doors.

**Acceptance.**
1. A recurring PO generates its next order on schedule.
2. Link a monthly recurring PO to an agreement ending in six weeks: the next order is generated, the one after the end date is not, the series pauses and the owner is asked with the agreement end date as the reason.

**Evidence.** `tests/blanket-orders.test.mjs`; `tests/blanket-orders.test.mjs`; `tests/browser-blanket.mjs`; `tests/browser-blanket-kinds.mjs`; `tests/browser-po-kinds.mjs`
**Gap.** Asserted: Concurrent real Cron ticks generate one order and reservation; The order before the six-week end is generated; The order after agreement end is not generated. No complete asserting-line trace is recorded for point 2: The owner receives the request to decide how the series continues.

#### PO-006 — Shipment tracking

Core · target · **missing** · Cites BASE-MAIL-001

**Requirement.** Supplier acknowledgments, advance ship notices and PunchOut confirmations carry carrier and tracking numbers (UPS, FedEx, USPS, DHL); Purse shows tracking status on the PO and tells the receiver when a delivery is out for delivery or delivered.

**Acceptance.**
1. Add a tracking number through the acknowledgment link and replay carrier status events; the PO and receiver show delivered and the receiver is prompted.
2. Before shipping delivered tracking, trigger RECEIVE-001 receipt prompts when a current PO is marked delivered and assert the receiver prompt and closed-balance suppression through its public door.

**Evidence.** None.
**Gap.** Carrier tracking and delivery prompts not built

#### PO-007 — US sales and use tax on purchases

Core · target · **partial** · Cites BASE-INPUT-003, BASE-MAIL-001

**Requirement.** Requests and POs carry sales tax by line, the business's resale or exemption certificates can be attached and sent with POs, and untaxed purchases of taxable items in a state where the business owes use tax are flagged for use-tax accrual in the ledger export. Tax rates can come from the supplier's invoice or Avalara AvaTax, which Purse asks for the line's ship-to address and tax code, recording the returned rate and jurisdictions on the line and committing the AvaTax transaction only when the bill is approved. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.

**Acceptance.**
1. Issue a PO with an exemption certificate, receive an untaxed invoice for a taxable item and see the use-tax flag carried into the bill sync.
2. With an Avalara AvaTax sandbox account connected, raise a request shipped to a second state: each line's tax equals AvaTax's returned amount with its jurisdictions shown, and the AvaTax transaction is committed only when the matching bill is approved.
3. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them.
4. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.

**Evidence.** `src/purse/requests.ts`; `tests/purse.test.mjs`
**Gap.** Exemption certificates, use-tax flags and Avalara AvaTax rates absent

#### PO-008 — Automatic PO creation and sending after approval

Core · target · **partial** · Cites BASE-MAIL-001

**Requirement.** Per purchase type, an approved request can become a PO and be sent (or transmitted by PunchOut) automatically, with the buyer able to require manual review for chosen suppliers or amounts. An approved request whose supplier is a SUPPLIER-008 pending supplier waits, showing why, and converts and sends once when the supplier activates, without a second approval. On a Procure page, as Procurify's is, a buyer selects approved lines from several requests to the same supplier, entity and currency and combines them into one PO: each PO line keeps its PUR-008 source link to its request line, coding and CODING-001 split, each request shows the shared PO, and lines already on a PO cannot be selected again; an automatic rule can also combine one supplier's approved lines once a day. On the Procure page, before issue, the buyer may correct price, quantity, unit, SKU and supplier and add charge lines within their PO-012 price variance limit; an automatic rule applies no edits, and a supplier price change it meets beyond the limit holds the PO for the buyer.

**Acceptance.**
1. Approve a catalog request under an automatic rule and see the PO created and sent; approve one above the manual-review amount and see it wait for the buyer.
2. Approve two requests from different departments for the same supplier, combine their three lines on the Procure page into one PO and see one PO with three lines, each linked to its source request line and keeping its coding; both requests show the PO, and converting either request's lines again is refused.
3. Approve a request for a supplier still in vendor approval and see no PO; activate the supplier and see one PO created and sent.
4. On the Procure page, add a $25 freight line and a $40 price increase to a combined line within the buyer's 10% limit and see the PO issued with no new approval step.
5. Before shipping combined or automatic POs, preserve INVOICE-003 source identity and calculate remaining balance once against the actual combined PO and its issued amendments, with source request allocations intact.
6. Acceptance must assert duplicate and over-balance invoice holds through that door.

**Evidence.** `tests/po-generation.test.mjs`; `tests/browser-po-generation.mjs`
**Gap.** Automatic sending, multi-request combination/shared PO/source splits, daily combination and combined Procure edits remain unbuilt. Current interim implementation: native owner explicitly authorizes internal generation; scheduler rechecks actual owner/approvals/supplier/catalogue/currency and claims once; no mail consent is inherited from generation. ct 23 Oct permits and requires the target owner-consented automatic-send standing rule; it remains an implementation Gap. PO-001/004 sending and PO-012 edits retain their exact authority obligations; no combined-source approval is claimed.

#### PO-009 — PO document content, labels and terms

Core · target · **partial** · Cites BASE-DATA-001, BASE-INPUT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Every PO document (PDF, and the same content behind PO-001's link and in cXML OrderRequest where the format allows) carries: the legal entity's name and the logo configured for the bill-to location; bill-to name and address; ship-to name, address and attention line, with a ship-to per line where lines differ; the supplier's name, address and remit-to; PO number, revision and issue date; payment terms, deposit or prepayment terms (PO-011) and FOB or shipping terms; need and promised dates; lines with supplier part number, description, quantity, unit, unit price, line tax and total, with freight, tax and the order total; notes to the supplier; the buyer's contact; and the business's purchase terms and conditions, printed on the document or attached. Admins set the logo, address labels (which name populates bill-to and ship-to), field labels and standard terms per entity (ACCESS-003) and location, with terms per purchase type where they differ; the applicable tax exemption or resale certificate (PO-007) is attached when the bill-to location and supplier state call for it. A change order (PO-004) shows its revision number and what changed. Native HTML and real PDF downloads use an owner-configured location/category profile frozen at conversion, including the legal name, bill-to logo and labelled bill-to/ship-to addresses with attention, buyer contact, shipping terms, printed terms, original attached purchase-terms PDF and a configured exemption/resale PDF selected by the supplier’s recorded two-letter postal state. This selection never claims tax validation. New conversions require a profile. A category-specific profile wins only when every line has that category; otherwise the location’s * profile applies. Supplier name, contact, postal address and remit-to are copied into the request’s immutable supplier snapshot. A later directory or profile edit never rewrites an existing PO. Legacy fields never captured are labelled Not recorded, never borrowed from supplier directory. Need dates, latest recorded supplier-promised dates, exact line quantities/units/prices, part numbers, per-line ship-to overrides, supplied line tax, freight, total, supplier notes and textual deposit/prepayment terms appear on both downloads. Explicit line tax must cover all lines and sum to supplied tax; when omitted entirely, supplied tax is apportioned by line value with largest-remainder cents, original line order breaking ties and equal shares for zero-valued lines. Textual deposit terms do not create a deposit, approval or payment. PDF originals are appended as pages and embedded byte-for-byte; the HTML offers the same originals for download. An amendment identifies the preceding PO, the numbered change order and each changed line/header value. Change-order numbering and document revision count issued amendments from one, independently of draft/request revisions; pre-issue edits never consume a change-order number. The approved request/PO revision is labelled separately. This completes native document doors; PO-001/004, PUNCHOUT-001/002, ACCESS-003, PO-007 and PO-011 inherit these document fields and original attachments before shipping their link, send, cXML, entity, tax-provider and structured-deposit capabilities.

**Acceptance.**
1. Configure two locations with distinct logos, addresses, field labels and purchase terms, issue and download PDFs from both, and assert each location’s identity, supplier/remit-to, payment/shipping/deposit text, need/promised dates, line tax/freight/total, notes, per-line destination and exact original terms/certificate.
2. Directory/profile edits cannot rewrite the first document.
3. Approve a quantity amendment and assert change order 1, its document revision 1, the separately labelled approved request/PO revision and old/new quantity.
4. Revise a draft before its first issuance, then issue two quantity amendments: their change-order/document revisions are 1 and 2, regardless of the higher request revisions.
5. Signed-out and out-of-scope downloads fail.
6. Run the supplier/profile/request/order web paths at 1440 and 390 without horizontal overflow, and restore the profile/snapshots/originals in the portable archive.

**Evidence.** `src/purse/po-profiles.ts`; `src/purse/po-content.ts`; `src/purse/po-pdf.ts`; `src/ui/po-profiles.tsx`; `tests/po-documents.test.mjs`; `tests/browser-po-documents.mjs`; `tests/restore-po-documents.mjs`
**Gap.** Asserted: Distinct emitted PDFs retain distinct location logos; Supplier and profile directory changes cannot rewrite the first emitted document; Amendment emits change order one. No complete asserting-line trace is recorded for point 1: Each PDF’s legal identity and all named supplier, remit, shipping, deposit, date, line, note and original fields are compared; point 3: Both old and new quantities and approved revision labels are compared; point 5: Signed-out and out-of-scope downloads are refused; point 6: Both web widths have no overflow, Actual archive restoration compares frozen profile, logo and original attachments.

#### PO-010 — Manual PO close and reopen

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-MAIL-001

**Requirement.** A buyer can close an issued PO, a line or a remaining balance without sending a cancellation to the supplier (a short shipment the supplier has written off, an order fulfilled under another PO), with a required reason; the remaining commitment is released to the budget, closed balances are excluded from shared overdue and receiving eligibility, and later invoices against the closed balance carry an explicit closed-balance exception for MATCH-002. Closing and reopening send nothing outbound. Supplier chases under PO-003 and receipt prompts under RECEIVE-001 remain required by those clauses; once built, they must use the shared eligibility and stop for a closed balance. A closed PO can be reopened by a buyer, which re-reserves its remaining balance subject to available budget and authority, with both events audited. After a supplier merge, issued POs continue and reopen as SUPPLIER-003 states.

**Acceptance.**
1. Receive 8 of 10 units and close the PO with a reason; no message reaches the supplier, the budget's committed figure falls by the two units' value and the closed balance disappears from overdue and receiving eligibility, an invoice for 10 units carries an explicit closed-balance exception, and reopening the PO re-reserves the two units once without an outbound message.
2. After PO-003 and RECEIVE-001 are built, repeat with an active supplier chase and receipt prompt and prove both stop on close; these dependent acceptance steps remain required under those clauses.

**Evidence.** `src/purse/order-closure.ts`; `src/purse/invoices.ts`; `src/ui/order-closure.tsx`; `tests/order-closure.test.mjs`; `tests/browser-order-closure.mjs`
**Gap.** Asserted: Receiving eight units leaves two thousand minor units outstanding; Close records the reason and removes the outstanding balance; Close and reopen send no supplier messages. No complete asserting-line trace is recorded for point 1: Closed balance disappears from the overdue projection; point 2: Active chasing stops on closure in this clause’s cited Evidence set, Active receipt prompting stops on closure in this clause’s cited Evidence set.

#### PO-011 — Deposit terms and two-way payment handoff

Core · target · **missing** · Cites BASE-INPUT-003, BASE-MAIL-001

**Requirement.** A PO, or the agreement it draws on (CONTRACT-001), can carry one or more deposit or prepayment terms, as Procurify's deposit billing does: an amount or a percentage of the PO total, a due trigger (on supplier acknowledgment under PO-001, on issue, or on a date) and the prepaid account it posts to (a default prepaid expenses or vendor prepayments account per entity, mapped from the ledger). The deposits on a PO can never exceed its total, a deposit added after issue is a PUR-009 amendment, and the terms print on the PO document (PO-009) and show on the supplier link. A deposit invoice (submitted as a deposit by the supplier through INVOICE-005's PO flip, marked as one by AP, or proposed as one by INVOICE-002's reading and confirmed by AP) matches two-way to its deposit term, not to receipts: it is never held for receipt under MATCH-001 or RECEIVE-001, it is approved for payment automatically within the unbilled deposit amount and its tolerance and goes to MATCH-002 above it, and AP-003 sets its due date from the trigger. It posts to the ledger once (SYNC-001 to SYNC-008) as a bill coded to the prepaid account, or as the ledger's own vendor prepayment where it has one (NetSuite vendor prepayments, Business Central prepayment invoices), and is paid through AP-001 or AP-002 like any bill. Before shipping this capability, its deposit due triggers must feed AP-003 due dates; deposit bills and their later application must count once in weekly approved bills and remaining expected liability. Acceptance must assert this AP-003 integration through the capability’s public door.

**Acceptance.**
1. Issue a $20,000 PO with a 50% deposit due on acknowledgment and acknowledge it.
2. A $10,000 deposit invoice arriving before any receipt is not held for receipt, is approved, and syncs to a QuickBooks Online sandbox company as one bill coded to the prepaid account; a retried push still leaves one bill.
3. A second $10,000 deposit invoice on the same PO is flagged and cannot be approved for payment.
4. The same journey against a NetSuite sandbox records the deposit as a vendor prepayment applied to the final vendor bill.

**Evidence.** None.
**Gap.** Deposit terms, two-way deposit matching, prepaid posting and deposit credits not built

#### PO-015 — Deposit credits and remaining liabilities

Core · target · **missing** · From PO-011 · Cites BASE-INPUT-003, BASE-MAIL-001

**Requirement.** Later invoices on the PO match three-way against receipts at their full value, and Purse applies the unapplied deposit balance as a credit line coded to the prepaid account (all of it on the final invoice, or pro rata on progress invoices where the term says so), so the net payable is the invoice less the deposit applied and the bill syncs with that credit line. The PO's billed total counts each deposit once, so INVOICE-003's remaining-balance check treats a final invoice carrying its deposit credit as within balance, and a deposit invoice beyond the unbilled deposit is flagged. BUDGET-001, REPORT-001 and REPORT-004 count a deposit as actual when its invoice is approved and never count it again on the final bill. A deposit not yet applied when the PO is closed or canceled (PO-010) stays on the supplier's balance (RECEIVE-002) for a refund or credit, and open POs adopted under IMPORT-003 keep their unapplied deposits. Before shipping, REPORT-001 must count a deposit once as actual and apply it once to the final bill and remaining liability, with drill-through to both source records. Acceptance must assert these figures through the public report door and web.

**Acceptance.**
1. After full receipt, a $20,000 final invoice matches three-way, carries a −$10,000 deposit credit line and syncs as a net $10,000 bill; the department budget's actual ends at exactly $20,000 and the dashboard shows $20,000 spend on the PO.
2. Before shipping, REPORT-001 must count a deposit once as actual and apply it once to the final bill and remaining liability, with drill-through to both source records.
3. Acceptance must assert these figures through the public report door and web.
4. Before shipping, INVOICE-003 must count each deposit once in billed balance, apply the final invoice deposit credit once and flag a deposit invoice beyond the unbilled deposit amount; unresolved flags refuse payment approval.
5. Acceptance must assert all three figures through the public invoice and approval doors.

**Evidence.** None.
**Gap.** Deposit terms, two-way deposit matching, prepaid posting and deposit credits not built

#### PO-016 — Frozen deposit documents and supplier links

Core · target · **missing** · From PO-011 · Cites BASE-INPUT-003, BASE-MAIL-001

**Requirement.** Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.

**Acceptance.**
1. Before shipping, its new document/link/send/cXML/entity/tax-provider/deposit door must preserve PO-009’s frozen applicable identity/profile, labelled fields, original terms/certificate, line destinations/taxes and numbered amendment differences, including structured deposit terms where this capability supplies them.
2. Acceptance must assert PO-009 content and attachments through that public door and its downloaded PDF.

**Evidence.** None.
**Gap.** Deposit terms, two-way deposit matching, prepaid posting and deposit credits not built

#### PO-012 — Buyer conversion edits within variance limits

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** A buyer converting approved lines (PUR-008, including PO-008's Procure page and its automatic rules) can correct each line before the PO is issued, as Procurify's purchasers do on its Procure page: unit price, quantity, unit of measure, supplier part number or SKU, and the supplier (to another active, purchasable supplier; a SUPPLIER-008 pending supplier cannot be chosen), and can add freight, tax and other charge lines. Each buyer has a price variance limit under ACCESS-001, set per buyer or per buyer role and entity as a dollar amount, a percentage, or both (the lower governs), measured above the approved line and above the approved request total; an admin can set it to zero, and a quantity increase is allowed only within a separate quantity variance (default zero). Decreases in price or quantity are always within the limit. An edit inside every limit creates a new exact revision of the request attributed to the buyer and the PO is issued from it with no renewed approval: the request and PO show the before-and-after values to the requester and the approvers, the requester is notified under NOTIFY-001, and AUDIT-001 records each edit with the limit in force. PUR-009 keeps its text: this clause defines the buyer edits that are not amendments. An edit beyond any limit, a supplier switch whose price change is beyond it, or a quantity increase beyond the quantity variance is a PUR-009 amendment: the revision is re-routed under APPROVAL-001 to the chain the request's rules now select, and nothing on the PO is issued, sent or transmitted (PO-001, PO-008, PUNCHOUT-001) until it is approved. BUDGET-001 moves the reservation to the edited amount and commits it atomically under PUR-006 when the PO is issued; where the edited amount would take a budget over, the edit goes to the budget-owner step as any over-budget request does, even when it is inside the buyer's limit. Coding, CODING-001 splits and CODING-002 values stay on the edited line, and each allocation is rescaled by its share exactly under PUR-016 (the remainder cent on the first allocation). Every edit is enforced on every door (web at both widths, API, Slack and Teams). Its buyer conversion edits must record before/after values and the price and quantity limits in force in AUDIT-001. Acceptance must assert this obligation through its public door and AUDIT-001 read/export. Native conversion writes a new exact buyer-attributed revision, preserving immutable source revisions and explicitly linked carried decisions. Price/quantity/unit/SKU, consistent active supplier changes and distinct freight/tax/other charges retain coding and rescale splits with the remainder cent on the first allocation. Caps apply to each line and the total; zero-limit increases are refused. A nonzero over-limit edit, changed threshold route or over-budget amount becomes an approval revision with no issued PO until its exact current chain and allocation-budget owners approve. Web conversion can explicitly issue in the same native transaction; API preparation retains its explicit separate issue door.

**Acceptance.**
1. Give a buyer a 10% price variance limit.
2. Convert an approved $1,000 line with a $40 unit price increase and a $25 freight line: the PO is issued at once with no new approval step, the requester sees the before-and-after values, the department budget's committed figure is $1,065 and the audit log records the buyer's edit and the 10% limit.
3. Raise the same line by $150 instead: the edit becomes an amendment routed to the original chain, and nothing is issued or sent until it is approved.
4. A buyer with a zero limit is refused any price increase through the web and the API, and is allowed a decrease.
5. Raise a $1,000 line split 60/40 to $1,040 and issue it: the two budgets commit $624 and $416.
6. An in-limit edit that would take the department over budget routes to the budget owner.
7. Switch the supplier on a line to a pending SUPPLIER-008 supplier and see the switch refused.

**Evidence.** `tests/po-documents.test.mjs`; `tests/spend-report.test.mjs`; `tests/browser-intake.mjs`; `tests/browser-approver-edits.mjs`; `tests/order-send.test.mjs`; `tests/browser-order-send.mjs`
**Gap.** Exact buyer revision/carry, separate charges, active/pending supplier checks, zero/within/over-limit/threshold and allocation-owner routing, first-allocation cents, invoice/risk lineage, approved native date revisions and explicit supplier change send/ack implemented. Mixed supplier-group conversion, NOTIFY-001 execution and Slack/Teams transports/qualification remain; Teams app/test tenant not held

#### PO-017 — Issued line need-date changes

Core · target · **partial** · From PO-012 · Cites BASE-AUDIT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** After approval and before or after issue, the requester or an approver may change a line's need date: it is a non-material change (APPROVAL-004's default), makes a new revision with no re-approval, and once the PO is issued it is sent to the supplier as a PO-004 change order. Approved requester/approver line need-date edits carry approval, create exact numbered document history and retain receiving custody; supplier delivery starts visibly pending and an explicit scoped buyer sends the exact numbered change with its frozen PDF and original terms; the safe current outcome and supplier acknowledgment are shown separately from creation-time metadata.

**Acceptance.**
1. Change the need date on an issued PO's line as the requester: no approval step is opened and the supplier receives a change order.

**Evidence.** `tests/po-documents.test.mjs`; `tests/spend-report.test.mjs`; `tests/browser-intake.mjs`; `tests/browser-approver-edits.mjs`; `tests/order-send.test.mjs`; `tests/browser-order-send.mjs`
**Gap.** Exact buyer revision/carry, separate charges, active/pending supplier checks, zero/within/over-limit/threshold and allocation-owner routing, first-allocation cents, invoice/risk lineage, approved native date revisions and explicit supplier change send/ack implemented. Mixed supplier-group conversion, NOTIFY-001 execution and Slack/Teams transports/qualification remain; Teams app/test tenant not held

#### PO-018 — Invoice balance after buyer conversion edits

Core · target · **partial** · From PO-012 · Cites BASE-AUDIT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** The current issued face and prior invoice evidence govern remaining-balance/risk checks.

**Acceptance.**
1. Before shipping buyer edits and charge lines, INVOICE-003 must use the edited current issued face once and prior invoice evidence across amendments; acceptance must assert an invoice at the remaining balance and one exceeding it, with unresolved-flag refusal.

**Evidence.** `tests/po-documents.test.mjs`; `tests/spend-report.test.mjs`; `tests/browser-intake.mjs`; `tests/browser-approver-edits.mjs`; `tests/order-send.test.mjs`; `tests/browser-order-send.mjs`
**Gap.** Exact buyer revision/carry, separate charges, active/pending supplier checks, zero/within/over-limit/threshold and allocation-owner routing, first-allocation cents, invoice/risk lineage, approved native date revisions and explicit supplier change send/ack implemented. Mixed supplier-group conversion, NOTIFY-001 execution and Slack/Teams transports/qualification remain; Teams app/test tenant not held

### Receiving

#### RECEIVE-001 — Receiver prompts and invoice holds

Core · target · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-AUDIT-001, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Native orders prompt the responsible receiver by email when the delivery date is due or an invoice is waiting on receipt. The hourly scheduler and buyer-triggered prompt door use the installation's IANA timezone (America/New_York if none is configured), inclusive due dates, and one retained attempt per order, receiver, reason and local calendar day. Mail contains only the PO number, due date and signed-in receipt link; it records provider acceptance, suppressed local mail, unavailable or uncertain outcomes honestly, never claiming delivery. The signed-in link opens the exact PO with an entered partial receipt or a one-tap confirmation of a line's full remaining quantity; GET never records receipt, and confirmation rechecks session, receiver authority and receipt position. Invoices held for receipt release into ordinary matching immediately when the recorded receipt covers their invoiced quantity; other risk, price, quantity and closed-balance exceptions still apply and no payment is approved by receiving. Buyers (including the owner) configure an active receiver by PO, location and/or purchase category: precedence is PO, location plus category, category, location, then requester by default. A category rule applies only when every line shares that category. An explicitly assigned PO permits receipt only by that active receiver or an audited owner override; without an explicit assignment, existing receiver-capability members and the request's own active requester may record receipt. The receiver with receiver capability can reassign the PO to another active receiver; changes retain reason, actor and versioned history. Closed, superseded and fully received balances stop prompts, using PO-010's shared eligibility. This completes native receipt doors. PO-006 inherits the delivered-tracking trigger; INTAKE-002/003, MOBILE-002 and NOTIFY-001 inherit receipt prompts and replies through their Slack, Teams, push and preference-controlled channels; PO-011 inherits deposit-invoice exemption; CARD-002 inherits card-paid no-hold/no-prompt behavior before those capabilities ship. Named future clauses must assert their inherited trigger, channel or exemption through their public door.

**Acceptance.**
1. Through native HTTP and the web at 1440 and 390 pixels, submit an invoice before goods, see the correct receiver's prompt and held state, enter a partial receipt and confirm the remainder once: the invoice releases into matching without another action.
2. Assign facilities to building services: facilities alone is prompted and the requester cannot record receipt.
3. Assert every rule precedence, reassignment, default-requester receipt, wrong-role/signed-out/deactivated refusal, stale confirmation, local-zone due day across DST, duplicate scheduler refusal, PO-010 closure/reopen, retained audit/history and portable outcomes.

**Evidence.** `src/purse/receipt-routing.ts`; `src/purse/receipt-prompts.ts`; `tests/receipt-routing.test.mjs`; `tests/browser-receipt-routing.mjs`
**Gap.** Asserted: Default requester receiving releases its reservation; Retained assignment, history and outcome graph validates. No complete asserting-line trace is recorded for point 1: The correct assigned receiver receives the invoice-held prompt, Partial and final receipts release the invoice into matching once; point 2: Facilities is the exclusive prompt recipient for building services, The requester cannot receive the assigned PO; point 3: Every rule precedence and reassignment is read back, Wrong-role, signed-out and deactivated actors cannot receive, Stale confirmation and DST due-day boundaries are independently asserted, Duplicate scheduler ticks make no duplicate prompt, Closure and reopen preserve the prompting boundary.

#### RECEIVE-002 — Credit memos, RMAs and supplier balances

Core · target · **partial**

**Requirement.** Returns and rejected services request a return authorization from the supplier through PO-002's thread, credit memos are captured like invoices, linked to the return and PO, and applied to later bills; each supplier shows open credits and balance.

**Acceptance.**
1. Return goods, request an RMA, receive a credit memo and apply it to the next bill; the supplier balance and synced bill reflect the credit once.

**Evidence.** `src/purse/receiving.ts`; `tests/purse.test.mjs`
**Gap.** RMAs, credit memos and balances absent

### Invoices and matching

#### INVOICE-001 — Supplier invoice email inbox

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001 · Rules D-1, D-3

**Requirement.** Each business (and entity) has an AP inbox address; suppliers' invoice emails and attachments (PDF, image, e-invoice XML) are captured with the original email retained, linked to the supplier by sender and remit details, and unknown senders are queued for review rather than trusted. E-invoice XML in UBL 2.1 (including PEPPOL BIS Billing 3.0 and the US DBNAlliance exchange profile) and cXML InvoiceDetailRequest is captured as structured fields straight from the XML, needing no document reading (INVOICE-002), with the XML and any embedded PDF kept. The owner configures the AP address, which must differ from INTAKE-004's request address; until ACCESS-003 adds entities, the business has one AP address, and ACCESS-003 must give each entity its own before it ships. AP mail arrives only through the signed Resend inbound webhook: signature, freshness and provider-ID replay are checked before hydration, INTAKE-004's transport limits apply (at most 3 attachments of 10 MB each, 30 MB decoded and a 2 MB provider record, refused explicitly, never truncated), and the exact provider record and attachments are kept in private R2 custody. Mail addressed to the AP address is captured only as supplier invoice mail and never becomes a purchase request, even when the request address is also a recipient. A capture is linked to a supplier only when the provider-reported From address exactly equals, ignoring letter case, a recorded contact email of exactly one supplier family, and it is labelled "Provider-reported sender; supplier authorship is not verified"; its reading's remit details are then compared with that supplier's recorded remit baseline by INVOICE-003; every other sender (unknown, a look-alike domain with a one-character, subdomain or encoded difference, an unrecorded mailbox at a supplier's contact domain, a contact of several suppliers, or an invalid address) is held with that reason until an owner or buyer assigns it to a supplier with a reason. Until ACCESS-001 adds an AP role, only owners and buyers read captures and download their originals. A capture creates no invoice evidence, payable or approval, and its text is data, never instructions. An owner or buyer opens an INVOICE-002 reading from one captured attachment, within INVOICE-002's 1 MB document limit (larger files are refused with the original kept), for a issued PO of the linked supplier; each attachment opens one reading. The reading binds the exact original bytes and waits for explicit review and confirmation, and the provider-reported sender, never a reading correction, reaches INVOICE-003's sender check, so duplicate-document, near-duplicate, remit, sender and PO-balance flags apply before cash-planning approval. A capture records when its attachment bytes equal an earlier capture's. UBL 2.1 Invoice documents of any customization (PEPPOL BIS Billing 3.0, DBNAlliance) and cXML InvoiceDetailRequest documents are read from their elements, not by document reading: invoice number, issue date (for cXML, the calendar date written in invoiceDate, without time-zone conversion), due date (UBL only; cXML payment days become "Net N" terms), PO number, currency, supplier name, postal remit address, each line's description, quantity, unit price, line amount and the PO line it references (the line number on the named PO), subtotal, document charges (UBL ChargeTotalAmount, cXML ShippingAmount), tax in the document currency and payable total, each with confidence 1 and its element path. Absent elements stay blank for the reviewer, and bank or tax identifiers are never read out of the original. Profile conformance and e-invoicing network membership are neither validated nor claimed. XML with a DOCTYPE or entity declaration is refused as unsupported, and nothing it references is fetched or expanded. A PDF embedded in a UBL invoice is kept beside the XML as its own exact private original when it fits the transport limits; the XML original always keeps it. Before shipping, each connected mailbox, other inbound provider or entity AP address inherits this entire clause and must pass its own provider sandbox. ACCESS-003 inherits entity AP addresses, ACCESS-001 inherits AP roles, and ERASURE-001 inherits capture, original, sender and audit erasure with anonymized financial lineage preserved.

**Acceptance.**
1. Send invoices from a known supplier and an unknown sender to the AP address; the known one becomes a draft invoice linked to its supplier, the unknown one waits for review, and both originals download.
2. Send a UBL 2.1 invoice and a cXML InvoiceDetailRequest from the known supplier: each becomes a draft invoice whose number, dates, PO reference, lines, tax and totals equal the XML's values, its lines link to the PO, and the XML downloads byte for byte.
3. Before shipping email/XML capture, preserve genuine date, original-byte identity, sender provenance and remit evidence for INVOICE-003, applying duplicate/fraud/balance flags before approval; acceptance must submit duplicate and look-alike mail originals and assert unresolved-flag refusal.

**Evidence.** `src/purse/invoice-inbox.ts`; `src/purse/invoice-inbox-api.ts`; `src/purse/invoice-xml.ts`; `src/purse/email-intake-api.ts`; `src/ui/invoice-inbox.tsx`; `scripts/installer/restore-invoice-inbox.mjs`; `tests/invoice-inbox.test.mjs`; `tests/browser-invoice-inbox.mjs`
**Gap.** Asserted: Known supplier capture is a linked draft; Unknown sender capture is held; UBL and cXML reference and dates equal their source fields. No complete asserting-line trace is recorded for point 1: Known and unknown original files download unchanged; point 3: Unresolved flags refuse payment approval through this capture door.

#### INVOICE-002 — Invoice reading with confidence

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** Invoice documents are read into supplier, invoice number, dates, terms, PO number, lines, freight, tax, totals and remit-to, with per-field confidence; low-confidence fields are highlighted for AP review and every value links to where it was read. The document is data, never instructions. Until ACCESS-001 supplies AP roles, the owner/buyer stages and reviews originals; every invoice original download and its metadata are owner/buyer-only, including originals recorded through the earlier invoice and attachment doors. Text PDFs and MIME email bodies use an inert labelled parser; a MIME From header supplies the unverified sender ahead of any body label. Scanned/image invoices and other layouts use a chosen external reader through a private original download and source-bound JSON proposal; An agent’s external-reader call carries external and, for regulated fields, sensitive; company policy decides it. The original digest, attachment revision, declared provider/model/run, immutable proposal and corrections remain linked. Reader execution and quotations are declared, never verified. Native label matches score 0.97 and table matches 0.92; missing values score zero and remain blank; below 0.95 is highlighted. Every field, including high-confidence or absent optional fields, requires explicit human review before confirmation. Required identity, date, currency, PO, line and amount fields cannot be missing; absent optional due dates, terms, sender or remit facts remain explicitly unrecorded. Corrections retain original values, actor and source and score one only as human corrections. Each line amount must equal quantity (up to three decimals) × unit price, rounded half-up to cents; lines must sum to subtotal and subtotal plus explicit freight and tax must equal the document total. invoice allocations include freight/tax apportioned by line subtotal, floored to cents with remainder on the first mapped item, with the original breakdown retained. Every item maps once to a unique line of the selected issued PO; confirmation rechecks its immutable supplier, number, currency and revision. It records evidence, never submission, bank verification, payment approval or a match bypass. Confirmed date, unverified sender, safe postal remit facts, optional transient bank comparison and exact original bytes pass through INVOICE-003. Structured fields, quotations and correction/audit history never accept bank/TIN fields; remit keeps payee/postal address and a private original/page link, not a bank excerpt. Bank comparison inputs are transient and discarded after the existing keyed check. Postal/payee or bank differences from the supplier record raise a “remit details changed” hold. This completes native invoice kinds and reading doors. ACCESS-001, INVOICE-001/004/005, IMPORT-003 and API-001 inherit private originals, source-bound human confirmation, safe remit retention and INVOICE-003 holds before adding their roles, invoice kinds or reading doors. Native files are at most 1 MB; native PDF reading accepts 50 pages/500,000 text characters, and readings accept 100 lines/2,000 characters per field, with explicit refusal rather than truncation.

**Acceptance.**
1. Through authenticated HTTP and the web at 1440 and 390, process text PDF and MIME invoices, an actual image-only scanned PDF through the source-bound external-reader door, and an invoice containing prompt-like instructions.
2. Assert every header and line field, confidence and source page/link; missing and low-confidence values remain review-only and instructions neither create nor approve an invoice.
3. Correct a field, retain its original/correction history, refuse absent review, stale/source-changed confirmation and irreconcilable line/subtotal/charge/total amounts, then explicitly confirm into invoice evidence without approval.
4. Assert exact original downloads, private original/read/history refusal for signed-out or wrong-role callers, rejected structured bank values/excerpts and absence of raw bank digits from non-original state/audit.
5. Confirm altered remit/sender and repeated originals: INVOICE-003 flags duplicates, changed postal/bank remit and sender, refuses unresolved cash-planning approval, and reasoned risk review does not bypass matching.
6. A complete archive restore preserves originals, source digests, proposals, corrections, confirmation and flags; corrupt source digests are refused.

**Evidence.** `src/purse/invoice-reading.ts`; `src/purse/invoice-reading-fields.ts`; `src/purse/invoice-reading-proposal.ts`; `src/ui/invoice-reading.tsx`; `tests/invoice-reading.test.mjs`; `tests/browser-invoice-reading.mjs`; `scripts/installer/restore-invoice-reading.mjs`
**Gap.** Asserted: Text PDF header, line and total fields are read exactly; MIME sender comes from the original From header; Image-only PDF uses the declared external proposal. No complete asserting-line trace is recorded for point 2: Low-confidence cases stay in review before creation; point 3: Stale and source-changed confirmation are both refused; point 4: Structured bank values and excerpts are rejected on every named proposal/correction door; point 5: Unresolved cash-planning approval is refused, Reasoned review does not manufacture a match; point 6: An actual archive round-trip preserves original bytes, source digests, proposals, corrections, confirmation and flags.

#### INVOICE-003 — Duplicate and fraud checks

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** Beyond PUR-011’s exact supplier-plus-reference identity, Purse flags near-duplicates (same canonical supplier, currency, amount and invoice date with a varied reference), the same document image arriving twice, remit-to details that differ from the verified supplier record, invoices exceeding the PO’s remaining balance (with any PO-011 deposit counted once in the PO’s billed total and the deposit credit applied on the invoice), deposit invoices beyond the PO’s unbilled deposit, and invoices from look-alike sender domains. Flagged invoices cannot be approved for payment until AP resolves the flag. Until ACCESS-001 supplies AP roles, owners and buyers capture and review native invoice evidence. structured inputs retain a valid invoice calendar date (default UTC entry date, explicitly labelled), an optional buyer-recorded unverified sender, exact-byte original-document SHA-256 and safe bank-comparison results. Near-duplicate dates use the recorded invoice date, an older payable date where present, otherwise the older UTC entry date. bank comparison uses the surviving supplier’s keyed matching-only fingerprint, explicitly labelled buyer-recorded identity, not bank verification; supplied remit with no baseline is held. Structured bank digits are discarded and a domain-separated keyed digest binds re-entry evidence without returning the digest; original documents retain their uploaded contents and are owner/buyer-only. Confirmed payee/postal remit facts are compared with the surviving supplier record; a difference or absent postal baseline raises a “remit details changed” hold. INVOICE-002 owns source-bound extraction and confirmation. A domain different from every immutable PO contact domain is flagged, including one-character, subdomain and Unicode/encoded look-alikes; missing contact provenance is also a flag when sender evidence is supplied. Sender matching never claims authentication. Document checks apply both to original bytes supplied with a new invoice and the existing later attachment-upload door. Exact supplier/reference and identical submitted evidence remain idempotent; changed source metadata under that identity is refused. billed balance counts prior invoice evidence across request amendments once against the issued PO face value, never sums superseded face values, and keeps currencies separate. Every flag needs an immutable owner/buyer reasoned disposition under an exact review version; this is risk review, never bank verification and never a bypass of price, quantity, receipt or closed-balance discrepancies. Unresolved flags hold AP-003 cash-planning approval; a later upload also removes an already-approved invoice from cash bills and REPORT-003 realized savings until review, retaining its historical approval. This completes native doors. SUPPLIER-002 carries the verified bank baseline; PO-005/008/012 carry their new PO kinds and edited/combined balance sources; PO-011 carries deposit-once, deposit-credit and unbilled-deposit checks; INVOICE-001/002/005, IMPORT-003 and API-001 carry their email, extraction, supplier, adoption and key-based source doors; ACCESS-001 carries AP review authority; MATCH-001 and AP-001/002 carry genuine payment-approval refusal. Future verified-bank, deposit, source and payment-approval acceptance remains required by each named inheriting clause. SECURITY-001 owns evidence keys, representations and legacy evidence states.

**Acceptance.**
1. Through authenticated HTTP and the web at 1440 and 390, submit a near-duplicate, a resent actual PDF, changed remit details and a look-alike domain: each is flagged and cash-planning approval refuses until reasoned owner/buyer review.
2. Assert that missing bank/contact baselines hold, raw structured bank digits never enter invoice/audit records or state, original bytes download unchanged, exact re-entry stays idempotent and changed evidence refuses.
3. Upload a repeated document after a planning approval: current bills and realized savings hold while historical approval remains; review restores eligibility without bypassing matching.
4. Prove remaining-balance checks across an issued amendment, stale/repeated/wrong-role/signed-out review refusal, and archive preservation of exact original bytes, flags and immutable review evidence.

**Evidence.** `src/purse/invoice-risk.ts`; `src/purse/invoice-evidence.ts`; `src/purse/invoice-review.ts`; `tests/invoice-risk.test.mjs`; `tests/browser-invoice-risk.mjs`; `scripts/installer/restore-invoice-risk.mjs`
**Gap.** Asserted: Raw structured bank values do not enter retained invoice/audit evidence; Exact re-entry returns the same invoice identity; A later repeated document is flagged. No complete asserting-line trace is recorded for point 1: Near-duplicate, repeated PDF, remit and sender outcomes are individually asserted through the invoice door, Cash-planning approval stays held until reasoned review; point 2: Missing bank and contact baselines are held, Original bytes download unchanged, Changed evidence is refused; point 3: Risk review restores eligibility without manufacturing matching; point 4: Every stale/repeated/role/session refusal is asserted against review, Actual archive restoration compares all originals, flags and immutable review evidence.

#### MATCH-001 — Automatic two- and three-way matching with tolerances

Core · target · **partial** · Cites BASE-INPUT-003, BASE-MAIL-001

**Requirement.** An invoice is matched on arrival to its PO lines (two-way) and receipts (three-way, per purchase type), with price and quantity tolerances by percentage and dollar amount configured per category or supplier. Charges on an invoice that are not on the PO (freight, fuel surcharges, handling, small-order and other fees) have their own unplanned-charge tolerance, as Coupa's unanticipated-charge tolerance does: a dollar amount and a percentage of the invoice per supplier or category, with a default coding per charge type (or allocation pro rata across the invoice lines' codings under CODING-001). Within that tolerance an unplanned charge is coded and does not stop automatic approval; above it the invoice goes to MATCH-002 as an unplanned-charge exception. A charge that is on the PO, such as quoted freight, matches against the PO. A bill line split under CODING-001 matches against its PO line as one line. Invoices within tolerance are approved for payment automatically; others go to MATCH-002. A deposit invoice is the exception to the receipt hold: it matches two-way to its PO-011 deposit term, is never held for receipt, and later invoices apply the deposit as a credit. PUR-011's deterministic discrepancy calculation is the basis. Before shipping this capability, its automatic approvals must feed AP-003’s approved-bill list and cash view with the same term and due/discount dates, while held or exception bills remain unapproved. Acceptance must assert this AP-003 integration through the capability’s public door.

**Acceptance.**
1. Process invoices exactly matching, within a 2% tolerance, above it and before receipt; the first two are approved automatically, the third goes to exceptions and the fourth is held for receipt.
2. A deposit invoice within a PO's deposit term, arriving before receipt, is approved and not held (PO-011's journey).
3. With a $50 or 5% unplanned-charge tolerance, an otherwise exact invoice carrying a $35 freight line that is not on the PO is approved automatically, with the freight coded to the configured freight GL account, and one carrying a $120 fuel surcharge goes to exceptions as an unplanned charge.
4. Before shipping, provide genuine approved-invoice evidence to REPORT-003 realized savings, replacing the explicitly labelled cash-planning basis; assert the 60% received/billed award example and refusal of unapproved invoice savings through the report API and web.
5. Before shipping invoice/payment approval, unresolved INVOICE-003 flags refuse approval and a later-source hold suspends current eligibility without erasing historical approvals; acceptance must assert each duplicate/remit/sender flag and the post-approval attachment door.

**Evidence.** `src/purse/orders.ts`; `tests/purse.test.mjs`
**Gap.** Automatic matching on arrival, tolerances, unplanned-charge tolerance and two-way deposit matching absent

#### MATCH-002 — Exception queue and resolution

Core · target · **partial**

**Requirement.** Each exception is assigned to the responsible buyer, requester or receiver with the price, quantity and receipt context; resolutions are accept variance (with approval above a limit), request credit or corrected invoice from the supplier, short-pay, or correct the receipt, each with a reason kept. Exceptions show age and are reminded and escalated like approvals. A short-pay approves the bill at the PO price and quantity, records the withheld difference against the supplier with its reason, and the synced bill carries only the approved amount. Correcting the receipt records a PUR-010 receipt correction with the receiver's reason and re-runs MATCH-001. Before shipping this capability, its resolved approvals and short-pay amounts must update AP-003 cash requirements once; unresolved exceptions cannot gain cash-planning approval. Acceptance must assert this AP-003 integration through the capability’s public door.

**Acceptance.**
1. Resolve one exception by accepting a variance with approval and one by requesting a credit through the supplier thread; reasons, approvals and the final matched state are on the invoice.
2. Short-pay a $1,050 invoice against a $1,000 PO line: the bill is approved at $1,000, it syncs to the QuickBooks Online sandbox at $1,000, the $50 difference is recorded against the supplier with the reason, and REPORT-003's exception rate counts the invoice.
3. Resolve a quantity exception by correcting a receipt from 8 to 10 units: the receipt correction is recorded with the receiver and reason, and the invoice matches three-way and is approved.

**Evidence.** `src/purse/orders.ts`; `src/purse/documents.ts`; `tests/purse.test.mjs`
**Gap.** Assignment and resolution workflow absent

#### INVOICE-004 — Non-PO invoices and invoice approval

Core · target · **missing** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011 · Rules D-1, D-3

**Requirement.** Invoices without a PO (utilities, professional services) are coded to GL account, department, location, class, project and CODING-002 fields, or split across several codings under CODING-001, and routed through invoice approval thresholds and escalation, with recurring non-PO suppliers suggested a blanket PO. Before shipping this capability, its approved non-PO bills must carry AP-003 payment terms, due/discount dates and enter the weekly cash view once. Acceptance must assert this AP-003 integration through the capability’s public door. INVOICE-004 inherits AGENT-008’s source-cited repeated non-PO supplier detection and blanket-PO suggestion obligation when its native source door ships.

**Acceptance.**
1. Process a non-PO invoice above the threshold; it routes to the configured approver, escalates after inaction and syncs as a bill once approved.
2. Apply the "Copier lease" split template to a second non-PO invoice: its three allocations route to each location's approver and sync as one bill with three coded lines.
3. Before shipping, include non-PO invoice spend outside REPORT-003 PO coverage, plus its off-contract and unapproved measures, separated by currency with exact source drill-through.
4. Acceptance must assert that a non-PO invoice reduces PO coverage through the report API and web.

**Evidence.** None.
**Gap.** Non-PO invoice coding, splits and approval routing not built

#### INVOICE-005 — Supplier invoice submission from the PO (PO flip)

Core · target · **partial** · Rules D-1, D-3

**Requirement.** From PO-001's no-account link, a supplier turns an acknowledged PO into an invoice: lines, quantities and prices prefill from the PO's uninvoiced and received balance, the supplier enters the invoice number, date, freight and tax and attaches its own invoice PDF, and the submission arrives as a structured invoice that needs no reading (INVOICE-002) and goes straight to INVOICE-003's checks and MATCH-001. The supplier cannot invoice above the remaining PO balance without the line being flagged, sees the invoice's status (received, approved, scheduled, paid) and cannot change remit-to details from this form.

**Acceptance.**
1. Issue and partly receive a PO, open its supplier link, flip it into an invoice for the received quantity with a PDF attached; it matches three-way and is approved automatically, its status shows on the link, and a second flip that exceeds the remaining balance is flagged.
2. Before shipping supplier PO flip, apply INVOICE-003 exact-document, duplicate, remaining-balance and source/remit checks before matching or approval; acceptance must assert that an unresolved flag refuses payment approval.

**Evidence.** `tests/supplier-invoice.test.mjs`; `tests/browser-supplier-invoice.mjs`
**Gap.** Asserted: Received quantity prefills from the acknowledged PO; Three-way matching produces the automatic approval; Approved status returns on the supplier link. No complete asserting-line trace is recorded for point 1: Supplier PDF is captured as private original evidence.

### Payables and payment handoff

#### AP-001 — BILL handoff

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-SECRET-001

**Requirement.** Approved bills (matched or approved non-PO) are sent to BILL with supplier, remit-to, invoice, due date and attachment, and payment status (scheduled, sent, cleared, failed, voided) returns onto the invoice, PO and supplier. A bill is sent once; a failed payment returns to AP with the reason. Purse never holds funds. Before shipping this capability, its payment-status return must update AP-003 so settled or voided bills leave outstanding cash requirements without losing term, discount or approval evidence. Acceptance must assert this AP-003 integration through the capability’s public door. Its payment-status changes must enter AUDIT-001 with the source bill, provider evidence and actor or authenticated provider identity. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. In BILL's sandbox, hand off two approved bills, pay one and fail one; statuses return, the failure reaches AP and re-sending the paid bill is refused.
2. Before shipping, provide genuine payment approval to REPORT-003 realized savings with the approved invoice source and no duplicate amount; assert the exact received/billed quantity savings through the report API and web.
3. Before shipping payment approval or provider handoff, unresolved INVOICE-003 flags refuse the action, including a new flag on a historically approved invoice; acceptance must assert duplicate/remit/sender and later-upload holds through the real payment door.
4. Before shipping, Outbound connector secrets inherit SECURITY-001 encrypted storage, metadata-only reads, no read-back, rotation/revocation/deletion and archive exclusion; assert through this connector before shipping.

**Evidence.** None.
**Gap.** BILL handoff and payment status return not built

#### AP-002 — Ledger and ACH payment handoff

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-SECRET-001

**Requirement.** For buyers who pay from their accounting system, approved bills sync as payable bills (SYNC-001 to SYNC-004) and the ledger's payment status flows back; owner-run deployments can instead use an ACH payment provider such as Dwolla, paying only verified bank details (SUPPLIER-002) and recording NACHA return codes on failure. Before shipping this capability, its ledger/ACH payment-status return must update AP-003 outstanding cash requirements once, preserving term, discount and approval evidence. Acceptance must assert this AP-003 integration through the capability’s public door. Its ledger/ACH payment-status changes must enter AUDIT-001 with source bill, provider evidence and actor or authenticated provider identity. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. Pay a synced bill in the QuickBooks Online sandbox and see Paid on the invoice; send an ACH payment through the provider sandbox, receive an R01 return and see it on the invoice and supplier.
2. Before shipping, provide genuine payment approval to REPORT-003 realized savings with the approved invoice source and no duplicate amount; assert the exact received/billed quantity savings through the report API and web.
3. Before shipping payment approval or provider handoff, unresolved INVOICE-003 flags refuse the action, including a new flag on a historically approved invoice; acceptance must assert duplicate/remit/sender and later-upload holds through the real payment door.
4. Before shipping, Outbound connector secrets inherit SECURITY-001 encrypted storage, metadata-only reads, no read-back, rotation/revocation/deletion and archive exclusion; assert through this connector before shipping.

**Evidence.** None.
**Gap.** Ledger payment status return and ACH provider handoff not built

#### AP-003 — Terms, due dates and cash requirements

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Payment terms (Net 15/30/60, 2/10 Net 30, due on receipt) set due and discount dates; AP sees bills due by week with discounts expiring, and finance sees a cash-requirements view of approved bills plus open commitments by expected invoice date. Until ACCESS-001 provides AP and finance roles, the owner and buyers record terms, approve for cash planning and read this view; other roles cannot read it. “Approved for cash planning” is a manual, audited confirmation of exact native invoice evidence, never a claim of matching, payment approval, scheduling, sending or payment. price, quantity, receipt and closed-balance discrepancies refuse that confirmation. Invoice calendar date is the basis for every term: Net 15/30/60 adds that many calendar days, 2/10 Net 30 adds 30 days with a 2% deadline 10 days after invoice date (inclusive), and due on receipt is due on the recorded invoice date. The discount rounds half-up once to minor units; the UI compares its deadline with today in America/New_York. Approved terms are immutable. Weeks start Monday and currencies stay separate. Expected native PO liability includes received-but-unbilled value and freight/tax proportionally, excludes canceled and closed quantities, and subtracts approved bills across issued amendment history once. A buyer records the expected invoice date, defaulting to the PO need date; both basis and source PO remain visible. This completes native invoice and planning doors; ACCESS-001, CODING-001, PO-011, INVOICE-004, MATCH-001/002, AP-001/002, SYNC-001 through SYNC-008 and IMPORT-003 inherit the obligations below before adding their roles, allocation, deposit, non-PO, matching, payment, ledger or adopted-record capability. Future capability acceptance remains with the named clauses.

**Acceptance.**
1. Approve native bills on Net 15, Net 30, Net 60, due on receipt and 2/10 Net 30 through the authenticated HTTP door; the due list sorts by date, the 2/10 deadline and rounded discount show, and cash totals approved bills plus remaining expected PO liability by Monday week without double counting or mixing currencies.
2. At 1440 and 390 pixels, record and approve terms, inspect the discount and weekly total, change the expected invoice date and open its source PO and invoice.
3. Unreceived invoices, stale versions, invalid dates, unauthorized and signed-out writes fail without mutation; approved terms cannot be rewritten.
4. Portable restore retains terms, approval and forecast history.
5. INVOICE-003 unresolved flags hold cash-planning approval; a later original-document upload can hold a historically approved invoice out of current due bills until reasoned risk review, while the immutable approval remains.
6. Acceptance must assert held and restored current cash eligibility without bypassing matching.

**Evidence.** `src/purse/payment-terms.ts`; `src/purse/payables.ts`; `src/purse/cash-requirements.ts`; `src/ui/payables.tsx`; `tests/payables.test.mjs`; `tests/browser-payables.mjs`; `scripts/installer/restore-payables.mjs`
**Gap.** Asserted: Net 15, Net 30, Net 60 and due-on-receipt dates are compared; Two-ten discount and deadline are compared; Due bills sort by their expected dates. No complete asserting-line trace is recorded for point 2: Both browser widths show the expected discount and weekly total, Source PO and invoice drill-through is independently asserted; point 3: Approved terms cannot be rewritten; point 4: Actual archive restore compares term, approval and forecast history; point 6: An unresolved source flag refuses cash-planning approval, A late document removes a historically approved bill from the current due list; point 7: Risk review restores current cash eligibility without bypassing matching.

### Card-paid purchases

#### CARD-001 — Card funding for approved purchases

Core · target · **missing**

**Requirement.** A purchase type, request or PO can carry the payment method "card". On approval, Purse asks the business's card provider to create a virtual card or set a spend limit for that request: [Coaster](https://github.com/just-every/run-coaster) natively, Ramp (Developer API: virtual cards and limits) and Brex (Team API: cards with spend controls) through their APIs. The card or limit carries the approved amount plus a configured tolerance, the supplier or merchant restriction, a one-time or recurring interval matching the PO, an expiry and the request's reference, and is issued to the requester or buyer. The approved amount is committed against the request's budget at once; a change of amount needs PUR-009 renewed approval and updates the limit; a cancellation or PO-010 close freezes the card or ends the limit. Purse never sees or stores card numbers.

**Acceptance.**
1. Approve a $1,200 software request marked "card"; a virtual card or limit for $1,200 restricted to that merchant appears in the Ramp sandbox, the Brex sandbox and a local Coaster installation with the request's reference, the budget's committed figure rises by $1,200, and canceling the request freezes the card.

**Evidence.** None.
**Gap.** Card or limit funding at Coaster, Ramp and Brex not built

#### CARD-002 — Card transaction reconciliation closes the purchase

Core · target · **missing**

**Requirement.** Settled transactions on CARD-001's cards and limits return from Coaster, Ramp or Brex (webhooks with a scheduled pull) and reconcile to the request or PO by card or limit ID: amount, merchant (matched to the supplier), date, receipt image and coding. A receipt missing at the provider is requested from the cardholder. The reconciled amount moves the budget from committed to actual (BUDGET-001), counts in REPORT-001 and REPORT-003 as spend under PO, and closes the PO without an invoice: no invoice hold, receipt-for-invoice hold (RECEIVE-001) or overdue chase (PO-003) fires for a card-paid PO. Transactions above the approved amount plus tolerance, from another merchant, or with no matching request become exceptions for AP. Coding and receipts sync to the ledger through the card provider's own accounting sync, and Purse never posts a card transaction as a bill. Before shipping, REPORT-001 must include card-paid purchases once under their coding and separate currency, with drill-through to the reconciled source purchase. Acceptance must assert these figures through the public report door and web.

**Acceptance.**
1. Replay a settled $1,180 transaction with a receipt from the card provider's sandbox for the card of CARD-001's acceptance; it reconciles to the PO, the budget moves $1,180 from committed to actual and releases the $20 balance, the PO closes, no invoice hold or chase fires, the dashboard shows the spend under the department, and no bill is created at the ledger.
2. A $1,500 transaction on the same card becomes an AP exception.
3. Before shipping, REPORT-001 must include card-paid purchases once under their coding and separate currency, with drill-through to the reconciled source purchase.
4. Acceptance must assert these figures through the public report door and web.

**Evidence.** None.
**Gap.** Card transaction reconciliation and invoice-free PO close not built

### Accounting sync

#### SYNC-001 — QuickBooks Online

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-SECRET-001

**Requirement.** OAuth connection pulls vendors, chart of accounts, classes, locations, items, customers/projects and terms; Purse pushes new and changed vendors, POs (as QuickBooks purchase orders), approved bills linked to their POs with the supplier invoice PDF and its other attachments attached (as QuickBooks attachables, within QuickBooks Online's attachment size limit, with an oversize file named in SYNC-005's error queue rather than silently dropped), and credit memos (vendor credits); bill payment status pulls back. Every pushed record stores its QuickBooks ID and a request idempotency key, so retries and re-syncs never create a second bill. Before shipping this capability, its returned invoice dates, terms, approval and payment states must feed AP-003 due/discount dates and weekly cash requirements without duplicating imported or already-posted bills. Acceptance must assert this AP-003 integration through the capability’s public door. Its sync attempts, outcomes and returned payment-status changes must enter AUDIT-001 with source record, external identity and authenticated actor/provider evidence. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. In a QuickBooks Online sandbox company, connect, import lists, sync a vendor, PO and bill, retry the bill push after a simulated timeout and see exactly one bill, with the invoice PDF attached once to it in QuickBooks; pay it in QuickBooks and see the status return.
2. Before shipping, synced PO and non-PO bills feed REPORT-003 PO coverage, off-contract and unapproved measures by currency with source drill-through; acceptance must assert that a synced bill without a PO counts outside coverage and the source figures reconcile.
3. Before shipping, Outbound connector secrets inherit SECURITY-001 encrypted storage, metadata-only reads, no read-back, rotation/revocation/deletion and archive exclusion; assert through this connector before shipping.

**Evidence.** None.
**Gap.** QuickBooks Online connection and sync not built (CSV export is PUR-011)

#### SYNC-002 — Xero

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** The same scope with Xero contacts, accounts, tracking categories, purchase orders, bills (accounts-payable invoices) with the supplier invoice PDF attached through Xero's attachments API, credit notes allocated to their bills, and payments, with Xero IDs stored for idempotency; CODING-001 allocations and CODING-002 fields mapped to tracking categories post as each line's tracking options. Before shipping this capability, its returned invoice dates, terms, approval and payment states must feed AP-003 due/discount dates and weekly cash requirements without duplicating imported or already-posted bills. Acceptance must assert this AP-003 integration through the capability’s public door. Its sync attempts, outcomes and returned payment-status changes must enter AUDIT-001 with source record, external identity and authenticated actor/provider evidence. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. In a Xero demo company, connect, sync a contact, PO and bill twice and see one bill with the invoice PDF attached once, then mark it paid in Xero and see the status in Purse.
2. Sync a bill whose lines carry two tracking categories (department and a CODING-002 "Event" field) and see each Xero line carry both tracking options; sync a credit memo against a bill and see one Xero credit note allocated to that bill, and re-sync it without a second credit note.
3. Before shipping, synced PO and non-PO bills feed REPORT-003 PO coverage, off-contract and unapproved measures by currency with source drill-through; acceptance must assert that a synced bill without a PO counts outside coverage and the source figures reconcile.
4. Before shipping, Outbound connector secrets inherit SECURITY-001 encrypted storage, metadata-only reads, no read-back, rotation/revocation/deletion and archive exclusion; assert through this connector before shipping.

**Evidence.** None.
**Gap.** Xero connection and sync not built

#### SYNC-003 — NetSuite

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-SECRET-001

**Requirement.** Token-based authentication to SuiteTalk REST syncs vendors, subsidiaries, departments, classes, locations, items, purchase orders, item receipts, vendor bills, vendor credits and vendor payment status, with external IDs for idempotency and subsidiary mapping per ACCESS-003 entity; custom segments and custom lists are pulled and CODING-002 field values post to their mapped segments and body or column fields; the supplier invoice PDF and its other attachments are uploaded to the File Cabinet and attached to the vendor bill. Before shipping this capability, its returned invoice dates, terms, approval and payment states must feed AP-003 due/discount dates and weekly cash requirements without duplicating imported or already-posted bills. Acceptance must assert this AP-003 integration through the capability’s public door. Its sync attempts, outcomes and returned payment-status changes must enter AUDIT-001 with source record, external identity and authenticated actor/provider evidence. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. In a NetSuite sandbox, sync a PO with a receipt and bill for one subsidiary, retry the bill push and see one vendor bill with the invoice PDF attached once, then pay it and see the status.
2. Before shipping, synced PO and non-PO bills feed REPORT-003 PO coverage, off-contract and unapproved measures by currency with source drill-through; acceptance must assert that a synced bill without a PO counts outside coverage and the source figures reconcile.
3. Before shipping, Outbound connector secrets inherit SECURITY-001 encrypted storage, metadata-only reads, no read-back, rotation/revocation/deletion and archive exclusion; assert through this connector before shipping.

**Evidence.** None.
**Gap.** NetSuite connection and sync not built

#### SYNC-004 — Pantry

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** [Pantry](https://github.com/just-every/run-pantry) connects natively: vendors, POs, approved bills, credits and 1099 boxes post to Pantry's payables with source links back to Purse, and Pantry's payment and reconciliation status returns. Neither product posts a record the other already holds. Before shipping this capability, its returned invoice dates, terms, approval and payment states must feed AP-003 due/discount dates and weekly cash requirements without duplicating imported or already-posted bills. Acceptance must assert this AP-003 integration through the capability’s public door. Its sync attempts, outcomes and returned payment-status changes must enter AUDIT-001 with source record, external identity and authenticated actor/provider evidence. Acceptance must assert this obligation through its public door and AUDIT-001 read/export. The native slice is owner-only and USD-only: explicit connection consent and a separate exact source/account/vendor posting confirmation, manual re-sync and payment refresh, no automatic retry or original-document transfer. It creates or explicitly maps a vendor, posts or adopts one exactly matching approved native PO bill, and returns authenticated active payment allocations with reversals; returned dates must match the approved terms. AP-003 reduces only remaining outstanding cash and preserves original approval and terms. Reconciliation remains unknown; a zero balance without payment evidence is not labelled Paid. Credential envelopes participate in installation-key rotation/recovery; archives retain financial history and exclude credentials. Under RL-103, future credit, PO, non-PO, reconciliation and 1099 capabilities inherit the same source-bound consent, credential and audit obligations before shipping. The RL-103 interim floor is: native-owner explicit USD-book connection; exact source/account/vendor posting confirmation; manual re-sync and payment refresh; dedupe by fingerprint, adopting or refusing an existing bill and never duplicating; payment-evidenced Paid; reconciliation reported as unknown; credentials encrypted, rotated and excluded from archives; no original transfer. Target: the owner consents once to a versioned posting rule, and AP-approved bills post under it. ACCESS-001 AP roles act within scope. Unmapped, ambiguous or changed sources hold. A transport-unknown outcome is reconciled by readback before any bounded, audited re-post. Payment and reconciliation status return on a schedule. Imported bills adopt by mapping. Deposit bills wait for prepaid reconciliation. Foreign-currency bills post to a USD book with a retained rate under Pantry CURRENCY-001.

**Acceptance.**
1. Connect a local Pantry installation, sync a bill, re-sync, and pay it in Pantry; one payable exists and Purse shows it paid with a link to the Pantry record.
2. Before shipping, synced PO and non-PO bills feed REPORT-003 PO coverage, off-contract and unapproved measures by currency with source drill-through; acceptance must assert that a synced bill without a PO counts outside coverage and the source figures reconcile.
3. Before shipping, Outbound connector secrets inherit SECURITY-001 encrypted storage, metadata-only reads, no read-back, rotation/revocation/deletion and archive exclusion; assert through this connector before shipping.

**Evidence.** `tests/pantry-flow.mjs`; `tests/browser-pantry.mjs`
**Gap.** Native USD posting and payment return are implemented; PO/source and 1099 transport depend on Pantry INTEG-001. Credits, non-PO qualification, reconciliation, returned date/term correction, scoped AP posting rules, reconciled retry and scheduled return remain unproved. RL-103 resolves the interim floor.

#### SYNC-005 — Sync status, errors and tie-out

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-SECRET-001

**Requirement.** Every synced record shows its sync state, external ID and last attempt; failures (closed periods, deleted accounts, inactive vendors) land in an error queue with a plain reason and a retry; scheduled refreshes pull list changes; and a tie-out report compares Purse's approved bills, credits and payments with the ledger for a period. This applies to every connection, SYNC-001 to SYNC-004 and SYNC-006 to SYNC-008, and the tie-out counts records adopted with existing ledger IDs (IMPORT-004) as already posted. On every connection each CODING-001 allocation posts as its own coded bill or PO line and each CODING-002 field value posts to its mapped target; an unmapped or inactive value holds the record in the error queue with the field named. On every connection a PO-011 deposit posts once to the prepaid account and its application on a later bill posts as that bill's credit line, and the tie-out lists prepaid, applied and unapplied deposits per supplier. Before shipping this capability, its returned invoice dates, terms, approval and payment states must feed AP-003 due/discount dates and weekly cash requirements without duplicating imported or already-posted bills. Acceptance must assert this AP-003 integration through the capability’s public door. Its sync attempts, outcomes and returned payment-status changes must enter AUDIT-001 with source record, external identity and authenticated actor/provider evidence. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. Push a bill into a closed sandbox period; it appears in the error queue with the reason, succeeds after reopening and retry, and the period tie-out shows zero differences.
2. Before shipping, synced PO and non-PO bills feed REPORT-003 PO coverage, off-contract and unapproved measures by currency with source drill-through; acceptance must assert that a synced bill without a PO counts outside coverage and the source figures reconcile.
3. Before shipping, Outbound connector secrets inherit SECURITY-001 encrypted storage, metadata-only reads, no read-back, rotation/revocation/deletion and archive exclusion; assert through this connector before shipping.

**Evidence.** None.
**Gap.** Sync states, error queue, retries and tie-out report not built

#### SYNC-006 — Sage Intacct

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-MAIL-001, BASE-SECRET-001

**Requirement.** A Web Services (or REST API) connection with the business's sender and user credentials pulls vendors, GL accounts, payment terms, items and the department, location, class, project, customer and employee dimensions plus user-defined dimensions, per entity in a multi-entity company (mapped to ACCESS-003 entities). Purse pushes new and changed vendors, purchase orders as Purchasing transactions where the company uses Intacct Purchasing, approved bills (AP bills) with line dimensions (including CODING-002 field values on their mapped user-defined dimensions, and one line per CODING-001 allocation) and the invoice PDF as a supporting document, and vendor credits (AP adjustments); bill payment status (AP payments) pulls back. Every pushed record stores its Intacct record number and a Purse external ID checked before any create, so a retry never creates a second bill. Before shipping this capability, its returned invoice dates, terms, approval and payment states must feed AP-003 due/discount dates and weekly cash requirements without duplicating imported or already-posted bills. Acceptance must assert this AP-003 integration through the capability’s public door. Its sync attempts, outcomes and returned payment-status changes must enter AUDIT-001 with source record, external identity and authenticated actor/provider evidence. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. In a Sage Intacct sandbox company with two entities, connect, pull vendors and dimensions, sync a vendor and a bill coded to department, location, class and project for one entity with its PDF attached, retry the bill push after a simulated timeout and see exactly one bill with the attachment, post a vendor credit, then pay the bill in Intacct and see Paid in Purse.
2. Before shipping, synced PO and non-PO bills feed REPORT-003 PO coverage, off-contract and unapproved measures by currency with source drill-through; acceptance must assert that a synced bill without a PO counts outside coverage and the source figures reconcile.
3. Before shipping, Outbound connector secrets inherit SECURITY-001 encrypted storage, metadata-only reads, no read-back, rotation/revocation/deletion and archive exclusion; assert through this connector before shipping.

**Evidence.** None.
**Gap.** Sage Intacct connection and sync not built

#### SYNC-007 — Microsoft Dynamics 365 Business Central

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-SECRET-001

**Requirement.** An OAuth connection through Microsoft Entra ID to the Business Central API (v2.0) pulls companies, vendors, G/L accounts, items, payment terms, dimensions and dimension values (global and shortcut dimensions). Purse pushes vendors, purchase orders, purchase invoices with dimension set lines and attachments, and purchase credit memos, and pulls vendor payment status through vendor ledger entries. Every pushed record stores its Business Central ID and Purse's external document number checked before create, so a retry never creates a second invoice. Before shipping this capability, its returned invoice dates, terms, approval and payment states must feed AP-003 due/discount dates and weekly cash requirements without duplicating imported or already-posted bills. Acceptance must assert this AP-003 integration through the capability’s public door. Its sync attempts, outcomes and returned payment-status changes must enter AUDIT-001 with source record, external identity and authenticated actor/provider evidence. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. In a Business Central sandbox environment, connect, pull dimensions, sync a vendor, PO and purchase invoice with two dimensions and a PDF, retry the invoice push and see exactly one purchase invoice, post a credit memo, then pay the invoice and see Paid in Purse.
2. Before shipping, synced PO and non-PO bills feed REPORT-003 PO coverage, off-contract and unapproved measures by currency with source drill-through; acceptance must assert that a synced bill without a PO counts outside coverage and the source figures reconcile.
3. Before shipping, Outbound connector secrets inherit SECURITY-001 encrypted storage, metadata-only reads, no read-back, rotation/revocation/deletion and archive exclusion; assert through this connector before shipping.

**Evidence.** None.
**Gap.** Business Central connection and sync not built

#### SYNC-008 — QuickBooks Desktop

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-SECRET-001

**Requirement.** QuickBooks Desktop (Pro, Premier and Enterprise, US editions) connects through the QuickBooks Web Connector with a Purse-issued .qwc file and qbXML: Purse pulls vendors, accounts, classes, items, customers:jobs and terms, and pushes vendors (VendorAdd/VendorMod), purchase orders, bills linked to their POs and vendor credits, and pulls bill payments. Because Web Connector runs on the buyer's own machine on a schedule, each request is queued in Purse with its state; a push stores the QuickBooks TxnID and Purse's reference in the bill's memo and reference fields, and a retry queries for that reference before adding, so a lost response never creates a second bill. The sync status shows when Web Connector last ran. Before shipping this capability, its returned invoice dates, terms, approval and payment states must feed AP-003 due/discount dates and weekly cash requirements without duplicating imported or already-posted bills. Acceptance must assert this AP-003 integration through the capability’s public door. Its sync attempts, outcomes and returned payment-status changes must enter AUDIT-001 with source record, external identity and authenticated actor/provider evidence. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. Against a QuickBooks Desktop sample company with Web Connector, add the .qwc, run a sync that pulls lists and pushes a vendor, PO and bill, drop the response to the bill add and run again to see exactly one bill, pay it in QuickBooks Desktop and see Paid in Purse after the next run.
2. Before shipping, synced PO and non-PO bills feed REPORT-003 PO coverage, off-contract and unapproved measures by currency with source drill-through; acceptance must assert that a synced bill without a PO counts outside coverage and the source figures reconcile.
3. Before shipping, Outbound connector secrets inherit SECURITY-001 encrypted storage, metadata-only reads, no read-back, rotation/revocation/deletion and archive exclusion; assert through this connector before shipping.

**Evidence.** None.
**Gap.** QuickBooks Desktop Web Connector sync not built

### Reporting, contracts and notifications

#### REPORT-001 — Spend and committed-budget dashboards

Core · target · **partial** · Cites BASE-INPUT-003, BASE-ROLE-001

**Requirement.** Dashboards show spend and commitments by department, project, location, supplier, category, GL account and any CODING-002 custom field over any period, with each CODING-001 allocation under its own coding, including card-paid purchases (CARD-002), adopted open POs (IMPORT-003) and deposits counted once as actual (PO-011), with budget versus reserved, committed and actual, filters, and drill-through from any figure to the requests, POs and invoices behind it. Currencies stay separate unless the owner sets reporting rates. Native reports retain the existing record visibility and report by department (cost centre), project, location, supplier and category. Outstanding authority is the commitment ledger: reserved until issued, committed against an issued PO’s unreceived, uncancelled, unclosed balance; an approved amendment’s extra authority stays reserved until issued. Actual is recorded invoice-allocation evidence (including flagged exceptions), never a claim of payment or matching approval. The inclusive period filters PO/request need dates for outstanding authority and UTC invoice entry dates for actual. Freight and supplied tax follow line-value proportions with largest-remainder cent allocation and original line order as the tie-break; a zero-value order uses equal shares, and closed/received lines take no share of remaining commitments. Figures and drill-through retain separate currencies. Policy budgets and available outstanding authority cover the whole visible policy scope; filtered reserved, committed and actual columns identify the selected records, and actual is not deducted again from the outstanding-authority budget. This completes native capabilities. CODING-001/002 inherit allocation, GL/custom-field reporting; CARD-002 inherits card purchases; IMPORT-003 inherits adopted commitments; PO-011 inherits counting deposits once; BUDGET-001 inherits period budget/reserved/committed/actual semantics; ACCESS-001 inherits its finer report scope before those capabilities ship.

**Acceptance.**
1. With a populated workspace, open the dashboard at 1440 and 390 pixels, filter by department and project, and drill from a supplier's committed figure to the exact POs that sum to it.
2. Through native HTTP and the web at both widths, distinguish pre-PO reservations, issued outstanding commitments, receipt/closure releases and invoice evidence; preserve mixed-coding freight cents and currencies; every grouped figure equals its source rows.
3. An out-of-scope requester sees no other requester’s records, including in choices and drill-through.

**Evidence.** `src/purse/spend-report.ts`; `src/ui/spend-report.tsx`; `tests/spend-report.test.mjs`; `tests/browser-spend-report.mjs`
**Gap.** Asserted: Receipts and closure release only their outstanding authority; Mixed-coding freight cents remain exact; Every grouped figure equals the sum of its actual source rows. No complete asserting-line trace is recorded for point 1: Department and project filters and committed-PO drill-through are read at both widths; point 2: Reservations and commitments remain separate, Currencies remain separate; point 3: Requester choices exclude other requesters, Requester drill-through excludes other requesters.

#### REPORT-002 — Saved, scheduled and exported reports

Core · target · **partial** · Cites BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** Users save report views (with filters and groupings on any coding or CODING-002 custom field, split lines reported per CODING-001 allocation), schedule them by email (weekly, monthly) to members, and export CSV and XLSX. A read-only OData v4 feed authenticated with a scoped API key (API-001) serves Excel (Power Query) and Power BI, and a Google Sheets connection writes a saved view into a sheet the owner chooses through the Google Sheets API on a schedule; both respect the key's or connecting member's ACCESS-001 scope.

**Acceptance.**
1. Save a view, schedule it, advance the clock and receive the email with an attachment matching the view; read the same view through the OData feed with a scoped key and see the rows match, see a key scoped to one department receive only that department's rows, and refresh it into a test Google Sheet through the Sheets connection.

**Evidence.** `src/purse/documents.ts`; `tests/purse.test.mjs`
**Gap.** Saved, scheduled and XLSX reports, OData feed and custom-field groupings absent

#### REPORT-003 — Procurement performance measures

Core · target · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-DATA-001, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Purse reports request-to-PO and approval cycle times, spend under PO (PO coverage), off-contract and unapproved spend found in synced bills, on-time delivery, invoice exception rate and savings, separating negotiated savings from realized savings (AGENT-005). Negotiated savings are the difference between a quote’s or agreement’s first offered price and the awarded price (PUR-005, SOURCE-001, CONTRACT-001); realized savings are only what approved invoices actually billed below the first offered price for the received quantity. Until ACCESS-001 supplies AP/finance roles, owners and buyers read the performance dashboard/API. Native source measures are elapsed creation-to-first-issuance and first-submission-to-approved-decision per revision (including rework), using recorded server timestamps, with missing endpoints excluded rather than fabricated. Delivery compares accepted receipt events’ UTC dates with the buyer-evidenced supplier promise; unknown promises are excluded. Invoice exceptions count each native invoice once; native PO coverage, missing immutable contract references and absent pre-issue purchase approval are reported by currency, never claimed as paid spend or verified contract compliance. Buyer-recorded quote awards are immutable, reasoned, and attach the first recorded supplier offer and a later winning quote to the exact native draft revision before submission. Every item/unit/SKU/quantity maps one-to-one and its winning price must equal the draft price. Negotiated savings count only approved revisions, with the latest approved award per request replacing earlier negotiated figures. Savings use signed line-value differences, excluding freight and tax; realized cents round half-up once for invoice quantity capped by net accepted quantity across amendments, so returns reduce realized savings. Today’s realized savings require buyer cash-planning-approved invoice evidence and are labelled accordingly, never payment approval. This completes native doors. Before shipping, ACCESS-001 carries AP/finance access; INVOICE-004 and SYNC-001 through SYNC-008 carry non-PO, off-contract and unapproved synced bill measures; SOURCE-001 and CONTRACT-001 carry their supplier awards and agreement first-offer/award evidence; MATCH-001 and AP-001/002 carry genuine payment approval as the realized-savings basis; AGENT-005 carries its realized-outcome sources. Each new source must preserve currency separation and exact record drill-through. The non-PO invoice acceptance and new-source cases remain required by the named inheriting clauses before they ship.

**Acceptance.**
1. Through native HTTP and the web at 1440 and 390, derive each measure from its source records, including timestamp differences, currency-separated coverage/off-contract/unapproved evidence, known/unknown promises and distinct invoice exceptions.
2. Record an award from $10,000 to $9,000, approve its exact revision and receive/bill 60%: assert $1,000 negotiated and, after cash-planning approval only, $600 realized, drilling to both quotes, award and invoice.
3. A quote without an award and an unapproved invoice count as neither negotiated nor realized savings respectively; a returned unit reduces realized savings.
4. Requester/signed-out report reads are refused and the portable archive retains valid award links.
5. INVOICE-003 unresolved flags exclude even historically cash-planning-approved invoice evidence from current realized savings until risk review; acceptance must assert the held amount and the restored source-backed savings.

**Evidence.** `src/purse/performance-metrics.ts`; `src/purse/savings-report.ts`; `src/purse/quote-awards.ts`; `tests/performance-report.test.mjs`; `tests/browser-performance-report.mjs`; `scripts/installer/restore-quote-awards.mjs`
**Gap.** Asserted: Request-to-PO and approval durations equal source timestamps; Coverage, off-contract and unapproved amounts reconcile to source rows; Unknown promise is reported honestly. No complete asserting-line trace is recorded for point 6: Late invoice-risk holds remove historically approved evidence from current realized savings, Risk review restores source-backed savings.

#### REPORT-004 — Month-end received-not-billed accruals

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-ROLE-001

**Requirement.** For a period-end date the controller chooses, Purse reports received-not-billed value per PO line, as Procurify's Accruals report and Unbilled PO Items export do: the quantity and value received with an effective received date on or before the cut-off (at the PO line's unit price, or the received value for amount, milestone and percentage-complete service receiving under PO-005), less the quantity and value billed on bills approved with an invoice date on or before the cut-off. Bills that are draft, pending approval, in MATCH-002 exceptions or disputed do not reduce it. Receivers record an effective received date with each receipt, defaulting to the day it is recorded and never in the future or before the PO was issued, and PUR-010's recorded time is kept alongside it. Each row carries the PO and line, supplier, item, the receipt's effective received date and recorded date (a receipt recorded after the period end with an effective date inside it is marked late-entered), quantities, unit price, accrual value, currency, and the line's GL account, department, location, class, project, entity and CODING-002 field coding, with one row per CODING-001 allocation of a split line; unapplied PO-011 deposits on the line's PO show in their own column and never net against the accrual. Card-paid POs (CARD-002) and balances closed under PO-010 on or before the cut-off are excluded, and POs adopted under IMPORT-003 count at their imported received and billed amounts and dates. The report filters by entity, department, location, supplier and GL account, totals by GL account and coding, drills from every total to its receipt and bill records, and exports to CSV, XLSX and a Xero manual-journal import file. The controller can optionally post it to the connected ledger (SYNC-001 to SYNC-008, or [Pantry](https://github.com/just-every/run-pantry) under SYNC-004) as one journal entry per entity, debiting each line's expense or asset account by its coding and crediting the configured accrued liabilities account, dated the period end, with a reversal dated the first day of the next period (the ledger's own reversal date where it has one, as NetSuite and Sage Intacct do, and a second dated journal elsewhere). Posting is a person's action under ACCESS-001's finance permission, never automatic; a period posts once under an idempotent reference, and a rerun after later changes shows the difference to post. Where NetSuite's own receipt accruals are in use (item receipts synced under SYNC-003), journal posting is off by default so the accrual is never booked twice. Its accrual postings and reversals must enter AUDIT-001 with entity, period, values, idempotent reference and actor. Acceptance must assert this obligation through its public door and AUDIT-001 read/export.

**Acceptance.**
1. On a PO for 10 units at $100, receive 6 units with an effective date of 28 June, enter a $200 bill for 2 units dated 30 June and leave it pending approval, and enter a $400 bill for 4 units dated 2 July.
2. The 30 June accrual shows $600 for the line with both receipt dates, and the pending bill does not reduce it.
3. Approve the 2 July bill and run 31 July: the line shows $200.
4. Then record a seventh unit on 3 August with an effective date of 29 June: the next 30 June run shows $700 and marks that receipt late-entered.
5. A card-paid PO and a closed balance are absent from every run.
6. The CSV and XLSX totals equal the sum of the drill-through records.
7. Post the 30 June accrual to a QuickBooks Online sandbox company: a journal dated 30 June and its reversal dated 1 July appear, and posting the same period again creates nothing.

**Evidence.** None.
**Gap.** Effective received dates, the period-end accrual report, exports and reversing journal posting not built

#### CONTRACT-001 — Agreement terms and renewal reminders

Core · target · **done** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Supplier agreements carry value, term, auto-renewal, notice period and owner; owners are emailed before the notice deadline at configured intervals with spend to date against the agreement value; agreements link to [Locket](https://github.com/just-every/run-locket) or another CLM for drafting and negotiation, and to [Inkwell](https://github.com/just-every/run-inkwell) or Docusign for signature status. Native agreement terms and PDF readings require explicit confirmation: native owners explicitly confirm or correct versioned terms and take reminder ownership; buyers/owners read the register under native capabilities. CLM/signature links and signature statuses are owner-recorded with source descriptions, never provider-verified by a pasted URL. An immutable attribution assigns each issued native invoice to at most one same-supplier-family, same-currency agreement; exact allocation totals and source records are labelled invoice evidence, not paid spend or verified contract compliance. Calendar dates use the installation timezone (America/New_York when unset); the notice deadline is the end date less the integer notice-day count. Positive configured reminder-day offsets precede that deadline. Hourly Cron claims only the most recently due interval once per agreement/deadline/offset, rechecks the enabled auto-renewal terms and active native owner before sending, never sends at or after the deadline, and retains accepted, suppressed, unavailable or uncertain outcomes without automatic replay. Corrections retain prior terms, attributions and reminder snapshots; complete archives retain and validate that graph without granting historical owner authority. Agreement monetary fields are integer minor units, with optional unknown values retained on older manually recorded terms. Before shipping, future agreement/provider/record doors inherit this source, review, scope, search, savings and portable-history obligation under ACCESS-001/002/003, SECURITY-001, ERASURE-001, SEARCH-001, REPORT-003, PO-005/011 and AGENT-005/006.

**Acceptance.**
1. Record an auto-renewing agreement with a 60-day notice period, advance the clock and receive reminders before the deadline showing spend to date; a linked Locket record shows on the agreement.

**Evidence.** `src/purse/agreements.ts`; `src/purse/agreement-reading.ts`; `src/purse/agreement-awards.ts`; `src/purse/agreement-reminders.ts`; `src/purse/savings-report.ts`; `src/ui/agreements.tsx`; `scripts/installer/restore-agreements.mjs`; `scripts/installer/restore-agreement-readings.mjs`; `scripts/installer/restore-agreement-awards.mjs`; `tests/agreements.test.mjs`; `tests/agreement-reading.test.mjs`; `tests/agreement-savings.test.mjs`; `tests/browser-agreements.mjs`; `tests/browser-agreement-value.mjs`; `tests/browser.mjs`
**Gap.** None.

#### CONTRACT-002 — Agreement reading and source confirmation

Core · target · **done** · From CONTRACT-001 · Cites BASE-INPUT-003, BASE-ROLE-001

**Requirement.** An uploaded agreement PDF is read into draft fields (parties, value, start and end dates, auto-renewal, notice period, payment terms) with per-field confidence and the page each value came from; the owner confirms or corrects the fields before they are saved, and the document is data, never instructions. Deterministic labelled-text PDF extraction proposes typed fields with confidence, page, line and exact original digest; ambiguous or unreadable fields are refused or left missing for correction. Extraction and correction never save agreement terms until a native owner explicitly confirms the reviewed version. Source text remains inert data. Confirmed value and sanitized document text are searchable under the existing buyer scope and protected-field exclusions. Confirmed PDF provenance can carry into a later agreement version only when every extracted field is unchanged; corrections preserve the original confirmation and versioned prices.

**Acceptance.**
1. Upload a sample agreement PDF; the value, term and notice period are proposed with confidence and source pages, nothing is saved until the owner confirms, and a corrected notice period drives the reminder dates.

**Evidence.** `src/purse/agreements.ts`; `src/purse/agreement-reading.ts`; `src/purse/agreement-awards.ts`; `src/purse/agreement-reminders.ts`; `src/purse/savings-report.ts`; `src/ui/agreements.tsx`; `scripts/installer/restore-agreements.mjs`; `scripts/installer/restore-agreement-readings.mjs`; `scripts/installer/restore-agreement-awards.mjs`; `tests/agreements.test.mjs`; `tests/agreement-reading.test.mjs`; `tests/agreement-savings.test.mjs`; `tests/browser-agreements.mjs`; `tests/browser-agreement-value.mjs`; `tests/browser.mjs`
**Gap.** None.

#### CONTRACT-003 — Agreement awards and source-backed savings

Core · target · **done** · From CONTRACT-001 · Cites BASE-INPUT-003

**Requirement.** Owner-confirmed first-offer and awarded-price source descriptions and complete item schedules retain quantity, unit, SKU and unit prices; their extended totals must equal the confirmed agreement first offer and value. A buyer maps each exact agreement schedule line once to an exact native request draft; a request revision has either a quote award or an agreement award, never both. REPORT-003 uses only approved request revisions, signed differences without freight or tax, the latest approved award for negotiated savings and each issued revision’s own immutable agreement version for realized savings. Received quantities, returns, cash-planning approval and unresolved invoice-risk holds apply identically to quote and agreement awards.

**Acceptance.**
1. REPORT-003 receives confirmed agreement first-offer and awarded prices and links negotiated and invoice-realized savings to those exact versions, schedule lines, PDF originals and invoice sources.
2. Acceptance asserts $10,000 to $9,000 as $1,000 negotiated after approval and $600 realized for 60% received/billed after cash-planning approval; returns and risk holds reduce or exclude the current figure.

**Evidence.** `src/purse/agreements.ts`; `src/purse/agreement-reading.ts`; `src/purse/agreement-awards.ts`; `src/purse/agreement-reminders.ts`; `src/purse/savings-report.ts`; `src/ui/agreements.tsx`; `scripts/installer/restore-agreements.mjs`; `scripts/installer/restore-agreement-readings.mjs`; `scripts/installer/restore-agreement-awards.mjs`; `tests/agreements.test.mjs`; `tests/agreement-reading.test.mjs`; `tests/agreement-savings.test.mjs`; `tests/browser-agreements.mjs`; `tests/browser-agreement-value.mjs`; `tests/browser.mjs`
**Gap.** None.

#### NOTIFY-001 — Notifications and preferences

Core · target · **missing** · Cites BASE-MAIL-001

**Requirement.** Every event a person must act on or wants to follow (approval needed, returned, approved, approver nudge (APPROVAL-002), approver edit (APPROVAL-004), buyer conversion edit (PO-012), mentioned in a comment or replied to (COMMENT-001), PO acknowledged, chase sent, delivered, receipt needed, exception assigned, bill paid, document expiring) reaches them by email, Slack, Teams or push per their preferences, with a daily digest option, US quiet hours and an in-app notification list. Every send is recorded with its outcome. Quiet hours are set per member in their own time zone (default 8 pm to 7 am local, weekends optional); non-urgent notifications inside quiet hours are held and delivered when they end, and only events the owner marks urgent (such as a bank-detail change hold) break through.

**Acceptance.**
1. Set one member to Slack and digest and another to email; trigger each event and see the right channel, the digest batch and recorded outcomes, including a bounced email.
2. With a Pacific-time member's quiet hours 8 pm to 7 am, trigger an approval request at 9 pm Pacific (across a daylight-saving change) and see it delivered at 7 am local, while an urgent bank-detail hold arrives at once.
3. Before shipping preference-controlled channels, apply them to RECEIVE-001 receipt prompts and assert correct channel, quiet hours and outcomes.

**Evidence.** None.
**Gap.** Channel preferences, digests, quiet hours and the in-app list not built

### Platform, migration and governance

#### API-001 — Public API, webhooks and automation

Core · target · **partial** · Cites BASE-AGENT-001, BASE-INPUT-001, BASE-MAIL-001, BASE-ROLE-001, BASE-SECRET-001 · Rules D-1, D-2, D-3

**Requirement.** A documented, versioned REST API (OpenAPI) with scoped API keys exposes requests, POs, receipts, invoices, suppliers and budgets with the same validation and authority as the console; signed webhooks announce events with stable IDs and replay. A published Purse app for Zapier (triggers: request submitted, request approved, PO issued, PO acknowledged, invoice exception, bill paid; actions: create request, create supplier, record receipt) and a Make app with the same triggers and actions use these webhooks and scoped keys, as does [Crank](https://github.com/just-every/run-crank). Scoped connector keys for unattended Pier replenishment requests (STOCK-001) are part of this clause; the request action creates a draft only, never a PO.

**Acceptance.**
1. Create a scoped key, create a request and read its PO through the API, receive and verify a signed webhook, replay it and see the receiver de-duplicate; a key without the scope is refused.
2. Run the Zapier app's trigger and action tests (Zapier Platform CLI) and a Make scenario against a test installation: an approved request fires the trigger once, and the create-request action produces a draft under the key's scope.
3. Send a Pier replenishment need with a connector key scoped to create requests: it creates a draft only, and PO creation and calls outside that scope are refused.
4. Before shipping keys or new invoice mutation doors, run the same INVOICE-003 source checks, exact evidence identity, reasoned review authority and unresolved-flag refusal; acceptance must assert direct-key duplicate/fraud submission and wrong-role review refusal.

**Evidence.** `src/purse/api.ts`; `API.md`; `tests/purse.test.mjs`
**Gap.** General API keys, OpenAPI and webhooks absent; INTAKE-007 supplies create-request-only tokens

#### SEARCH-001 — Search across purchasing records

Core · target · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-003, BASE-ROLE-001

**Requirement.** One search, in the web at any width, the native apps and API-001, finds requests, POs (including IMPORT-003's adopted numbers) and change orders, receipts, invoices and bills, suppliers, agreements and catalog items. It searches by number (request, PO, change order, Purse invoice, the supplier's invoice reference), supplier name or DBA, amount (exact or a range), date range, requester, status, coding and CODING-002 field values, and by text in descriptions, notes, COMMENT-001 comments and the text read from attached documents (INVOICE-002, SOURCE-002). Partial numbers match, and supplier names match regardless of case and punctuation. Results show only records inside the searcher's ACCESS-001 scope and open the record. SECURITY-001's protected fields are never indexed, so a TIN or bank account number finds nothing. Native web and session HTTP search covers requests, and historical imported POs, receipts, native invoice evidence, supplier names/DBAs, catalog items, supplier agreement references and the text actually read by INVOICE-002/SOURCE-002. A read-only result opens its exact source record projection under a fresh current-session scope check. Supplier names ignore Unicode case, punctuation, symbols and spacing; number fragments and token prefixes match. Amounts are integer minor units: `$1,234.56` or decimal currency text means exact 123456 minor units, while minimum/maximum bounds are inclusive; the currency filter selects one currency and unfiltered amounts remain separate labelled rows. Date bounds are inclusive calendar dates on invoice document date, otherwise the recorded at, issuedAt, generatedAt, createdAt and needDate fields in that precedence; currency amounts remain labelled and are never added. Requester search follows own-purchase grants and any explicitly granted department reads; all staff and custom-role reads follow one complete ACCESS-001 permission-and-scope grant. Invoice document text is returned only under scoped invoice-read authority (including ACCESS-001 AP, finance and auditor grants); catalog search applies approval, date validity and CATALOG-001 grants. Search projects explicit non-protected fields, never document originals, remit/bank/TIN fields or matching hashes; readable document text excludes payment/tax identifier lines and digit identifiers. Complete archives preserve the scoped projection, and the derived full-text index rebuilds before search becomes ready after restore; neither grants authority. This completes native doors. Before shipping, ACCESS-001 must carry its department/entity/custom-role scope through query filters and result opens; API-001 and MOBILE-002 must expose the same scoped search; IMPORT-003 must search adopted original numbers; PO-004/005/008/012, INVOICE-001/004/005, CONTRACT-001, CODING-001/002 and COMMENT-001 must index their new order/bill/agreement/allocation/custom-field/comment kinds under the same protected-field exclusions and exact source links.

**Acceptance.**
1. In a workspace of 100,000 synthetic records, search for an adopted Procurify PO number, a supplier invoice reference, a supplier name typed without its punctuation, an amount of $1,234.56 and a phrase from an invoice PDF: each returns its record within one second at 1440 and 390 pixels and through the API.
2. A department-scoped requester's search for another department's PO number returns nothing, and a search for a supplier's full bank account number returns nothing for every role.

**Evidence.** `tests/search.test.mjs`; `tests/browser-search.mjs`; `tests/browser-search-scale.mjs`; `tests/browser.mjs`
**Gap.** Asserted: Adopted Procurify PO number returns its source record; Supplier invoice reference returns its source record; Punctuation-free supplier name returns its source record. No complete asserting-line trace is recorded for point 1: All queries run on one hundred thousand synthetic records at both browser widths.

#### IMPORT-001 — Procurify migration

Core · target · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-ROLE-001, BASE-SECRET-001 · Register R-5

**Requirement.** Purse moves a Procurify customer in from two named sources, used together or alone: the CSV data sets a Procurify Superuser (or a user with the Export Data permission) downloads from Settings → Export Data (Purchase Order Items, Unbilled PO Items, Receiving Logs, Bills in the detailed custom format, and the user, department, location, account code, vendor, catalog and budget lists), and the Procurify REST API, connected with the buyer's own OAuth 2.0 client credentials, which reads the same records plus PO headers, approval routing, bill and PO attachments and payment records. Purse imports users, departments, locations, GL accounts, vendors, catalog items, approval routing (mapped to APPROVAL-001 chains for review, with Procurify approval pools arriving as "any one of" steps with their members), vendor approval routing (as SUPPLIER-008's vendor approval chain, with Procurify's bypass settings) and pending vendor requests (as SUPPLIER-008 pending suppliers linked to their requests), each purchaser's price edit variance limit (as the PO-012 limit on the matching Purse buyer, in dollars or as a percentage), item-level approval decisions on multi-line requests where the fixture carries them (an approved item imports as an approved line, and a denied item as a declined line with its reason that cannot be converted, under PUR-007's request-level decision on the remaining lines), custom header and line field definitions and values (as CODING-002 fields, with list values and ledger mappings), split items' account-code allocations (as CODING-001 allocations), budgets, open and historical POs with receipts, PO deposits and deposit bills (as PO-011 terms with their applied and unapplied balances), bills, vendor credits, payments, request and PO comments (as COMMENT-001 history), travel requests (as INTAKE-006 records, with approved trips not yet expensed keeping their budget reservation) and attachments. Historical POs and bills arrive as inert history; open POs are adopted under IMPORT-003, and records Procurify already synced to the ledger keep their ledger identity under IMPORT-004. Counts and totals reconcile per supplier, department and period against the sources before switching. Procurify expense reports and reimbursements are not purchasing records: Purse lists them in the reconciliation and exports them in the import format of [Coaster](https://github.com/just-every/run-coaster) (or as CSV for Expensify, Ramp or Brex) for the expense tool to take on. PUR-013's review, resume and undo apply.

**Acceptance.**
1. Import a fixture built in the documented column layouts of the named Export Data CSVs, and the same records through a recorded Procurify API fixture with attachments; review mappings and counts, commit, reconcile totals per supplier and period against the sources, see expense reports exported in Coaster's format and not imported as purchases, see a travel request arrive as an INTAKE-006 record and a PO with a part-applied deposit arrive with its unapplied balance, see an approval pool arrive as an "any one of" step with its three members, a bill item split across three account codes arrive with its three allocations, and custom field values arrive on their open POs and bills, see vendor approval routing arrive as the vendor approval chain and a pending vendor request arrive as a pending supplier on its request, see two purchasers' price edit variance limits ($50 and 10%) arrive on the matching Purse buyers and govern their conversion edits, see a request with one denied item arrive with that line declined and the rest convertible, and undo an untouched batch.
2. Before shipping, Full sensitive import storage inherits SECURITY-001 encryption, masks, authority and archive rules; assert them through the import door before shipping.

**Evidence.** `src/purse/imports.ts`; `public/fixtures/procurify-shape.csv`; `tests/purse.test.mjs`
**Gap.** Real Procurify export and API adapter, deposits, comments, travel requests, approval pools, custom fields, split allocations, vendor approval routing, pending vendor requests, purchaser variance limits and item-level decisions absent

#### IMPORT-002 — Coupa, Precoro and spreadsheet migration

Core · target · **missing** · Cites BASE-DATA-001, BASE-MAIL-001

**Requirement.** The same reviewed path imports Coupa and Precoro exports and a documented spreadsheet template for businesses moving from email and spreadsheets, and vendor lists pull from the connected ledger (SYNC-001 to SYNC-004 and SYNC-006 to SYNC-008) with SUPPLIER-003's duplicate check. Each source is previewed without writes, committed after review, reconciled by counts and totals per supplier and period against the source, and can be undone like IMPORT-001; open POs are adopted under IMPORT-003 and already-synced records keep their ledger identity under IMPORT-004.

**Acceptance.**
1. Import a Precoro export, a Coupa export and the spreadsheet template; each is previewed without writes, committed after review and reconciled to the source's counts and totals, and an untouched batch undoes.
2. Then pull vendors from a sandbox ledger and see duplicates flagged.
3. Before shipping, Full sensitive import storage inherits SECURITY-001 encryption, masks, authority and archive rules; assert them through the import door before shipping.

**Evidence.** None.
**Gap.** Coupa, Precoro and spreadsheet-template importers not built

#### IMPORT-003 — Adopting open POs without re-sending

Core · target · **partial** · Cites BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001 · Rules D-1, D-3

**Requirement.** On switch day the owner reviews the open POs from IMPORT-001 or IMPORT-002 and adopts them. An adopted PO keeps its original number (searchable, printed as the PO reference and matched by MATCH-001 and INVOICE-002 against invoices quoting it), its supplier, lines, remaining quantities, received and billed amounts, any unapplied PO-011 deposit, and its remaining value committed against the imported budgets; it becomes receivable and matchable at once and is never sent to the supplier on adoption. The adoption records the source system's approval evidence as imported evidence and the adopting owner and time, never as native authority: any later amendment, change order or cancellation needs native approval under PUR-009 before PO-004 sends it, and new numbering continues without colliding with adopted numbers. Before shipping this capability, its adopted PO and bill balances, including unapplied deposits, must enter AP-003 expected liability and approved bills without duplication or invented native approval. Acceptance must assert this AP-003 integration through the capability’s public door. Before shipping, REPORT-001 must include adopted open PO commitments at their remaining value without counting historical received/billed quantities again, with original-number drill-through. Acceptance must assert these figures through the public report door and web.

**Acceptance.**
1. Import a fixture with an open PO for 10 units, 4 received and 2 billed, and adopt it; no email reaches the supplier's test inbox, the budget's committed figure equals the imported remainder, receiving 3 more units is accepted, an invoice quoting the original Procurify PO number for 3 units matches three-way against the remaining quantity, and an amendment to the adopted PO waits for native approval.
2. Before shipping, REPORT-001 must include adopted open PO commitments at their remaining value without counting historical received/billed quantities again, with original-number drill-through.
3. Acceptance must assert these figures through the public report door and web.
4. Before shipping adoption, imported invoice originals and available date/sender/remit provenance must pass INVOICE-003 before a new approval, with absent verification labelled honestly; acceptance must assert duplicate/balance holds on adopted invoices without granting authority from history.

**Evidence.** `tests/order-adoption.test.mjs`; `tests/browser-order-adoption.mjs`; `tests/browser-import-adoption.mjs`
**Gap.** Asserted: Original PO number is retained after adoption; Adoption sends no supplier mail; Remaining commitment equals the imported remainder. No complete asserting-line trace is recorded for point 1: Original-number invoice matches all three-way terms, Amendment awaits native approval; point 3: The report web projection compares those figures; point 4: Duplicate and balance holds block new approval of historical invoices.

#### IMPORT-004 — Existing ledger records keep their ledger identity

Core · target · **missing**

**Requirement.** Vendors, POs, bills, vendor credits and payments the previous system already synced to the ledger are imported with their existing ledger IDs, taken from the source record where it holds them (Procurify's accounting sync IDs) or matched against the connected ledger's vendors and open and paid bills by vendor, reference, date and amount, with every match reviewed before commit. Records carrying a ledger ID are linked, never pushed again: the first sync updates only what Purse changes afterwards, and payment status keeps flowing back for them. Unmatched historical bills stay history and are not posted.

**Acceptance.**
1. Import vendors and bills that already exist in a QuickBooks Online and a Sage Intacct sandbox company, review the proposed links, commit and run the first sync to each; zero new vendors and zero new bills are created in either ledger, a payment made afterwards in the ledger returns to the imported bill, and a vendor edited in Purse after the move updates the existing ledger vendor.

**Evidence.** None.
**Gap.** Ledger-ID matching and first-sync linking not built

#### AUDIT-001 — Audit log and approval evidence

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-003, BASE-DATA-006, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Every decision (including which pool member decided an APPROVAL-001 “any one of” step), amendment, approver edit (APPROVAL-004), buyer conversion edit with the variance limit in force (PO-012), split allocation change (CODING-001), comment and comment edit (COMMENT-001), grant, send, sync, accrual posting (REPORT-004) and payment-status change is in an audit log with actor, time, action and subject, filterable and exportable for auditors (including SOX-style evidence that each PO was approved under the policy in force), surviving erasure of the actor with anonymized references. Until ACCESS-001 supplies read-only auditors, the owner alone reads and exports the full log; other roles are refused on both native HTTP audit doors. The owner filters by exact subject ID or PO number, exact action and inclusive UTC from/through dates. A PO-number filter includes its request’s decisions and amendments and its invoices. CSV export contains exactly the filtered rows, actor, timestamp, action, subject, reason and retained detail. Native request revisions supply before/after amendment terms; new decisions retain an immutable snapshot of the policy in force and its version. Historical decisions without that snapshot retain their recorded policy/version and explicitly say the snapshot is unavailable; policy is never presented as historical authority. This is complete for actions. APPROVAL-001/004, PO-012, CODING-001, COMMENT-001, PO-001/002, SYNC-001 through SYNC-008, REPORT-004 and AP-001/002 inherit their new events before shipping; ERASURE-001 inherits anonymization with business evidence retained; ACCESS-001 inherits read-only auditor export. The future clauses below must assert their event, edit, limit, send, sync, posting, payment and erasure acceptance when those capabilities exist.

**Acceptance.**
1. Through native HTTP and the web at 1440 and 390 pixels, approve a request, issue its PO, amend its quantity and filter the PO’s history.
2. The decision shows the exact policy snapshot and the amendment’s two revisions show the before/after values; editing the current policy cannot rewrite the exported approval evidence.
3. Export the filtered CSV and verify the same events and retained policy.
4. Filter a member grant, exact action and inclusive date bounds.
5. Signed-out, requester and buyer reads/exports are refused without mutation.

**Evidence.** `src/purse/audit-log.ts`; `src/purse/requests.ts`; `src/ui/audit-log.tsx`; `tests/audit-log.test.mjs`; `tests/browser-audit-log.mjs`
**Gap.** Asserted: Filtered history contains events only for the intended request and PO; Before and after amendment quantities are read back; The exact original policy name, limit, amount and reason are retained. No complete asserting-line trace is recorded for point 3: CSV has exactly the filtered event identities and count.

#### SECURITY-001 — Protected supplier storage and role projections

Core · target · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-AUDIT-001, BASE-INPUT-001, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** SECURITY-001 policy is the single main business and native owner authority, never membership grants alone. Only that owner creates or changes recoverable TIN/account/routing values through a handler rechecking session validity/version, origin, revision and merge state; every write requires reason and evidence reference, encrypts before storage and refreshes SUPPLIER-003 matching atomically. Buyer matching-only input remains fingerprint-only; a fingerprint never proves recoverable storage. Bank details are labelled Recorded, not verified – not active for payment; SUPPLIER-002 owns activation, call-back, independent approval, provider verification and payment holds. Reveal is owner-only, one field per POST with no-store, reason and native reauthentication within ten minutes; buyer/requester/approver/receiver, tokens, supplier/RFQ links have no reveal scope; an agent reveal carries sensitive and security, decided by company policy. Owners see masked values until reveal; buyers see TIN/account/routing last four; requesters/approvers/receivers see only On file for TIN/account and nothing for routing. Ordinary non-sensitive tools, create-only tokens, exports, search, logs, mail and PDFs receive neither full values nor last four; separately authorized sensitive and security calls follow company policy. All supplier/state/merge/duplicate/import-plan reads reuse supplierPublicValue rather than duplicating projection. Errors never echo input, and every write, reveal and refusal is audited without digits. Structured protected fields cannot enter human-preparation context or ProposedAction inputs; no protected-field action is supported. Free text remains source data, not a claim of universal free-text redaction; existing historical context needs separate handling.

**Acceptance.**
1. Through native HTTP and the web at 1440 and 390, assert authorized owner store/reveal and stale/revoked/cross-origin/revision/missing-reason refusal without writes.
2. Through native HTTP and the web at 1440 and 390, assert exact per-role masks and audited 403 reveal refusals.
3. Through native HTTP and the web at 1440 and 390, assert refusal nonleakage.
4. Through native HTTP and the web at 1440 and 390, assert no full values or suffixes in logs/search/exports/PDF/mail/agent context.
5. Through native HTTP and the web at 1440 and 390, assert concurrent change/reveal revision settlement.

**Evidence.** `tests/supplier-duplicates.test.mjs`; `tests/browser-protected-web.mjs`; `tests/integration-tokens.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/invoice-risk.test.mjs`; `tests/browser.mjs`; `tests/integration-tokens.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/purse.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/supplier-duplicates.test.mjs`; `tests/browser-protected-web.mjs`; `tests/browser-evidence-history.mjs`
**Gap.** Asserted: Owner storage retains all requested protected fields; Authorized reauthenticated owner reveals each exact field; Refused writes preserve the protected snapshot. No complete asserting-line trace is recorded for point 4: Every suffix is absent from every named PDF, mail, log and agent-context output. The policy-driven agent class and disposition cases also remain unproved.

#### SECURITY-002 — Credential custody and encryption-key rotation

Core · target · **partial** · From SECURITY-001 · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-SECRET-001

**Requirement.** Connector secrets never have read-back, even for the owner: create/show-once, rotate, revoke and delete expose metadata only. Encryption is AES-256-GCM in a separate table outside p_records, bound to business/supplier/field/key ID. The installation key is a Worker secret provisioned through rer setup and rer-setup.json, never D1/R2/archives/argv/logs; unavailable keys return 503 without fallback and revision races return 409. Audited owner rotation retains old keys until every value is reencrypted and checked; key loss means unrecoverable values and reentry, without escrow/plaintext copies.

**Acceptance.**
1. Through native HTTP and the web at 1440 and 390, assert connector show-once only.
2. Through native HTTP and the web at 1440 and 390, assert readable audited rotation and explicit missing-key 503.

**Evidence.** `tests/supplier-duplicates.test.mjs`; `tests/browser-protected-web.mjs`; `tests/integration-tokens.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/invoice-risk.test.mjs`; `tests/browser.mjs`; `tests/integration-tokens.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/purse.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/supplier-duplicates.test.mjs`; `tests/browser-protected-web.mjs`; `tests/browser-evidence-history.mjs`
**Gap.** Asserted: Rotation reports all three values checked and preserves other product records; Every rotated ciphertext decrypts under the new key to the original payload; Missing-key data is labelled unavailable and returns the explicit refusal. No complete asserting-line trace is recorded for point 1: Every connector secret is shown only once through each credential lifecycle; point 2: Rotation audit fields are independently read back.

#### SECURITY-003 — Protected-data export and restore

Core · target · **partial** · From SECURITY-001 · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** Default archives exclude protected values, encrypted protected values, connector secrets and sensitive TIN/bank matching key material. Matching and invoice-evidence keys require true cryptographic separation with explicit preservation/migration of legacy fingerprints and evidence, never relabelling an old root or rewriting frozen history. Invoice-evidence hashes must actually verify with their stated old/new representation and lineage; a format check is insufficient. An explicit owner include encrypts that section under a passphrase supplied as private input. Default restore labels values Not restored – re-enter, preserves other matching and verifiable invoice evidence, never restores reveal authority or grants; after a merge reveal remains per supplier row, and wrong-passphrase include restore writes nothing. ERASURE-001 retains only tax-required encrypted/reveal-restricted data and fences archive resurrection. ACCESS-001/003, SUPPLIER-001/002, IMPORT-001/002, SYNC-001 through SYNC-008, AP-001/002, API-001, AGENT-010 and ERASURE-001 inherit their named duties below in both contract and acceptance before completion. Local fixtures never establish legal sufficiency or provider acceptance. The owner include is a separate passphrase-encrypted supplement kept with the ordinary installation archive; restoration of that protected section is an explicit owner action after ordinary restore and never imports installation keys or grants.

**Acceptance.**
1. Through native HTTP and the web at 1440 and 390, assert byte-search default export exclusions including matching key material, ordinary matching continuity and actual invoice-evidence verification.
2. Through native HTTP and the web at 1440 and 390, assert explicit include restoration and wrong-passphrase atomic refusal.

**Evidence.** `tests/supplier-duplicates.test.mjs`; `tests/browser-protected-web.mjs`; `tests/integration-tokens.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/invoice-risk.test.mjs`; `tests/browser.mjs`; `tests/integration-tokens.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/purse.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/supplier-duplicates.test.mjs`; `tests/browser-protected-web.mjs`; `tests/browser-evidence-history.mjs`
**Gap.** Asserted: Wrong passphrase leaves all ordinary and protected rows unchanged; Explicit included restoration reveals the exact original field. No complete asserting-line trace is recorded for point 1: Default export byte-search excludes protected values, encrypted values and matching-key material, Ordinary matching continues after actual default restore, Invoice evidence is cryptographically checked after actual default restore.

#### SECURITY-004 — Legacy invoice-evidence verification

Core · target · **partial** · From SECURITY-001 · Cites BASE-AUDIT-001, BASE-DATA-001, BASE-INPUT-001, BASE-INPUT-003, BASE-SECRET-001

**Requirement.** Invoice-evidence hashes made under the shared matching root (representation legacy-root-v1) are preserved byte for byte and never recomputed into, replaced by or relabelled as new evidence; new evidence uses a new independently random invoice-evidence key (v2), the old root keeps only its matching use and leaves default archives, and no default archive holds a bank-derived value with the key that derived it. A one-time audited migration gives every legacy hash exactly one state, shown wherever invoice evidence is shown: attested-at-migration when recomputed from retained records (no bank input, or a bank input equal to a retained supplier baseline), labelled "Checked at migration on <date> from retained records. Later checks verify this migration record, not the original submission."; unavailable-source when it binds a bank input no retained record reproduces, labelled "Original bank input not retained – legacy evidence not verified."; did-not-verify when every bound input is retained and recomputation fails, labelled "Legacy evidence did not verify." Only the native owner re-enters the original bank input, one invoice per no-store POST with reason, evidence reference, native reauthentication within ten minutes and revision; a match sets verified-by-reentry ("Verified by owner re-entry on <date>. Later checks verify this re-entry record."), a mismatch answers did not verify and writes only a digit-free audit event, and an absent old root returns 503 without fallback. Re-entered digits are discarded; invoices, audit, receipts, logs and archives never hold bank digits, suffixes or bank fingerprints. Each attestation is an HMAC under the invoice-evidence key over the exact legacy hash, representation, retained-field digest, state, event, actor and time. No state claims bank or supplier verification or changes INVOICE-003 flags, reviews, comparisons or holds. Restore writes nothing and names the invoice when a v2 hash does not recompute, an attestation does not bind the stored hash, a state is unsupported by its fields, a migrated archive holds an unmigrated legacy hash, or an invoice carries a bank-derived field; a pre-migration archive is migrated on import by the same rules and refused when a retained-input hash does not recompute. Unavailable-source rows are preserved history and are never counted as verified. The migration receipt counts each state and states that archives exported before migration still carry the old root.

**Acceptance.**
1. Legacy evidence remains byte-identical, each migration state is independently verifiable, and restoration refuses inconsistent evidence without changing invoice-risk holds.

**Evidence.** `tests/supplier-duplicates.test.mjs`; `tests/browser-protected-web.mjs`; `tests/integration-tokens.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/invoice-risk.test.mjs`; `tests/browser.mjs`; `tests/integration-tokens.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/purse.test.mjs`; `tests/browser-evidence-history.mjs`; `tests/supplier-duplicates.test.mjs`; `tests/browser-protected-web.mjs`; `tests/browser-evidence-history.mjs`
**Gap.** Asserted: Every migrated invoice retains its original hash bytes; Unsupported state or altered bound hash is refused; New evidence’s altered hash fails actual verification. No complete asserting-line trace is recorded for point 1: Every migration state is independently verified rather than merely accepted as a label, The migration and restore leave every existing invoice-risk hold unchanged.

#### ERASURE-001 — Personal data erasure with financial retention

Core · target · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001

**Requirement.** An owner can erase a departed member's or supplier contact's personal data with a receipt of what was removed, while purchasing and tax records the business must keep (US practice is seven years for payable records) are retained with the person anonymized. It must scrub identifying AUDIT-001 actor, email, reason, detail and retained revision/policy evidence fields while preserving anonymized business evidence and chronology; audit reads and CSV export must assert the anonymized result. Acceptance must assert this obligation through its public door and AUDIT-001 read/export. Under RL-2, a native owner reviews an exact field/original inventory, completes fresh native reauthentication and explicitly consents before erasure. Affected opaque originals are withdrawn rather than claiming in-place PDF redaction. Anonymous financial chronology has no automatic destruction; retained TIN and bank values stay encrypted under the existing reveal restriction. The erasure checkpoint rejects older archives in that installation; an empty installation must receive the newest archive as its later journal when restoring an older backup. Receipt, journal, financial links, invoice hashes, evidence state and attestations remain portable; retained evidence labels erased source values honestly. Future ACCESS-002/003, API-001, INVOICE-004, PO-011 and provider source doors inherit this erasure and restore boundary before shipping.  The RL-2 boundary retains: native-owner explicit inventory/review/consent with fresh proof; resumable withdrawal and deletion of opaque originals; anonymous financial chronology without automatic destruction; encrypted, reveal-restricted retained TIN and bank values; honest verification labels; installation-checkpoint or supplied-journal fencing. A fresh destination given no later journal restores only after the native owner acknowledges "erasure history unverified: supply your latest archive as the journal". The report records that acknowledgment, the archive time and that no journal was supplied. Retained protected values follow an owner retention period in whole years (default 7, minimum 1, IRS Pub. 583 warning below 7) counted from the latest supported payable. Expired values are listed and erased only on owner confirmation. Order-send acknowledgment names and recipients, travel identities, Pantry-held contact fields and scenario consents are in the reviewed inventory. None is asserted. The fresh-destination acknowledgment is a native-owner door in Settings of the empty installation with fresh native reauthentication; it and the restore report (acknowledgment, archive time, no journal supplied) live in an installation-local table that never enters an archive, and a restore that supplies a later journal needs none and is labelled journal-supplied. The unverified label stays on a restored installation; only a restore that supplies the journal clears it. Retention counts whole years from the latest invoice date entered against any order of the supplier; Ready to erase lists protected TIN and bank values and W-9 originals, a supplier with no payable has no clock, and an invoice whose bank binding lost its source value says so. Every refused erasure door of a configured business appends one value-free audit row, and agent erasure proposals carry standard and execution carries destructive, decided by company policy. A link holder's stated acknowledgment name is erased with its recipient, a sole proprietor's name in a synced Pantry bill source is erased with its contact, and a departed member's scenario consent actor and email are erased with the member.

**Acceptance.**
1. Erase a former requester and a supplier contact; the receipt lists removed fields, their POs and invoices remain with anonymized references, and a later archive restore does not bring the data back.
2. Before shipping erasure, cover SOURCE-001 nominated contact snapshots and personal supplier-response/audit fields while retaining anonymized business offer/award links; acceptance must assert those new records through the erasure and archive doors.
3. Before shipping erasure, scrub INTAKE-004 sender/recipient snapshots, source bodies/provider JSON/attachments, personal notes and audit fields while retaining anonymized purchasing lineage and non-authorizing replay receipts; acceptance must assert source downloads, audit/export and archive non-resurrection.
4. Before shipping, SECURITY-001 tax-retained TIN data remains encrypted and reveal-restricted; erasure must fence archive restoration from resurrecting erased identity.
5. Assert retained/erased and restore cases before shipping.
6. Erasing a retained value an invoice-evidence hash binds keeps the hash, state and attestation, shows (source values since erased) and never yields did-not-verify; restore accepts the difference only with the erasure journal.

**Evidence.** `tests/audit-log.test.mjs`; `tests/erasure-flow.mjs`; `tests/audit-log.test.mjs`; `tests/erasure-retention-flow.mjs`; `tests/browser.mjs`; `tests/audit-log.test.mjs`; `tests/order-send.test.mjs`; `tests/travel.test.mjs`; `tests/agent-value.test.mjs`; `tests/pantry-flow.mjs`; `tests/browser-erasure.mjs`
**Gap.** Asserted: Departed member receipt lists removed policy and revision fields; Supplier contact erasure completes; Domain rows and public audit/CSV contain no retained personal values. No complete asserting-line trace is recorded for point 2: Every nominated contact snapshot and personal supplier-response field is independently checked.

### Push further: agents in the purchasing job

#### AGENT-001 — Requirements intake agent

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-INPUT-003, BASE-MAIL-001

**Requirement.** In the web form, Slack, Teams or email, an employee describes a need in plain words, such as laptops for three new engineers starting 3 November. The agent asks for missing facts, finds catalog, PunchOut or preferred-supplier items, proposes coding, need date and attachments from past purchases and policy, and shows the predicted approval route. Drafting and submitting carry standard; an approval or other binding purchasing decision carries commitment and money. The company policy decides each call. Under the held policy, the requester edits and submits the draft. This builds on PUR-014 intake preparation.

**Acceptance.**
1. Under the held company policy, describe a need in Slack; the agent asks for the missing quantity, proposes catalog items and coding with sources, and creates a draft that the requester edits and submits.

**Evidence.** `src/purse/agents.ts`; `tests/purse.test.mjs`
**Gap.** No agent execution

#### AGENT-002 — Quote collection and normalization agent

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-INPUT-003, BASE-MAIL-001

**Requirement.** For an RFQ, the agent sends invitations from the selected template, answers supplier clarification questions from the request specification and hands questions outside it to the buyer. It reads replies and quote PDFs, normalizes units, freight, tax, lead time, validity and terms into PUR-005 comparison, flags missing or nonconforming items and recommends an award with reasons. Invitations and supplier replies carry external; an award or binding approval carries commitment and money. The company policy decides the agent calls. SOURCE-001 exact responses, original custody, first-offer baseline and award lineage remain intact.

**Acceptance.**
1. Under the held company policy, run an RFQ with three test supplier inboxes replying in different formats; the comparison is normalized with sources, a nonconforming quote is flagged, and the award waits for the policy-named buyer.
2. Through the RFQ-agent door, retain SOURCE-001 governed invitations, immutable responses/originals, actual first-offer currency baseline and latest exact response; under the held company policy, no award or purchasing approval occurs before the buyer decides.

**Evidence.** `tests/quote-agent.test.mjs`; `tests/browser-quote-agent.mjs`; `tests/browser.mjs`
**Gap.** Three actual supplier inboxes and autonomous invitation/specification clarification mail are unproved; unsupported source formats stay flagged. Held Resend credential is rejected. ct 23 Oct 07:58Z approved interim floor: deterministic v1/model-provider none, exact buyer-approved native RFQ scope plus owner per-type enablement, source text is data, clarification remains a draft or buyer escalation, and no agent award/approval/outbound authority. SOURCE-001 and future sending doors inherit exact original/version/baseline/current-authority duties.  ct 23 Oct 07:58Z approved deterministic labelled/source-backed human-send-only analysis with audited revocable per-type controls. Remaining rider Gap: every comparison line must visibly cite its exact source page/part; unsupported/unparseable formats stay flagged, never guessed. No autonomous send/award/approval.

#### AGENT-003 — Late-order resolution agent

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011

**Requirement.** The agent asks suppliers to acknowledge, records promised dates and replies on the PO, informs the requester and proposes alternatives when a delay threatens the need date: another supplier, a PunchOut item or a split shipment, with price and date. Supplier contact carries external; substitutions, price changes, cancellations and binding commitments carry money and commitment and use PUR-009 amendment lineage. The company policy decides execution, cadence and count limits.

**Acceptance.**
1. Under the held company policy, simulate a supplier replying with a three-week delay; the agent updates the PO, informs the requester and proposes an alternative, and the order changes only after the policy-named buyer approves.

**Evidence.** `tests/late-order-resolution.test.mjs`; `tests/browser-order-thread.mjs`; `tests/agent-governance.test.mjs`
**Gap.** Reader requires one explicit Promised delivery: YYYY-MM-DD statement; broader supplier formats, live mailbox qualification, PunchOut/split-shipment alternatives and notification channels remain unproved. ct 23 Oct 07:58Z approved interim floor: exact source-bound native buyer ProposedAction records nonbinding supplier evidence and an in-app requester notice; no automatic commercial amendment, order, alternative purchase or outbound message. PUR-009 remains mandatory for binding changes.  ct 23 Oct 07:58Z approved source-bound immutable ProposedActions, exact dated statement shown at buyer confirmation, nonbinding alternatives and PUR-009 before adoption. The in-app requester notice states only that a supplier promise was recorded and by whom. Notice withdrawal upon future proposal rejection/expiry remains an explicit Gap; no rejected or unconfirmed proposal emits a notice.

#### AGENT-004 — Invoice exception agent

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-AUDIT-001, BASE-SECRET-001

**Requirement.** For each MATCH-002 exception the agent gathers evidence, prompts the receiver, reads the PO revision and receipts, asks the supplier for a credit memo or corrected invoice, explains the mismatch and follows the resolution until the bill posts once and payment status settles. Internal evidence work carries standard, supplier contact external, payment or variance changes money, binding sign-off commitment, and regulated bank data sensitive with security when credentials or protective settings change. The company policy decides the agent calls; SUPPLIER-002 bank-change controls and genuine receipt evidence remain.

**Acceptance.**
1. Create a price mismatch; the agent requests a corrected invoice, reads it on arrival, re-matches, and the bill syncs once and is marked paid in a sandbox ledger, with every agent step in the audit.

**Evidence.** `src/purse/agents.ts`; `tests/purse.test.mjs`
**Gap.** No agent execution

#### AGENT-005 — Value realization tracking

Core · push-further · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001, BASE-SIGNIN-001 · Register R-6

**Requirement.** The company policy decides this agent’s standard evidence work, external contact, sensitive records, money changes and commitment sign-offs. In the held-policy native journey, a request records its promised outcome (a need met by a date, a seat count used, a quoted saving). The agent collects evidence after delivery (receipts and milestones, software seat usage from the identity provider or [Auth](https://github.com/just-every/run-auth) sign-in records, supplier issues, a requester check-in at 30 and 90 days) and reports realized value against the promise, never counting an unsigned or unrealized discount as savings. Requesters confirm usefulness; the agent cannot invent evidence. Native operation is labelled deterministic v1, model/provider: none. The promise is immutable purchasing input on the exact approved request revision; later changes require amendment and approval. Native quantity receipts compare their recorded UTC event dates to the promised need date and preserve net accepted quantities; recorded milestone descriptions and supplier issues remain source facts; free text is never scored as completion. Imported usage retains the exact JSON original, SHA-256, declared provider, inclusive period and active-true rule (only distinct seat IDs with active === true count), explicitly provider-reported and unverified. Usage imports require a native delivery receipt and an inclusive period ending on or after its UTC date. The latest declared period end, then import time and ID, selects the report source. A 50-seat promise and 31 active seats reports a 19-seat shortfall; missing evidence is labelled no evidence yet. Only the native requester with requester capability confirms usefulness against the exact report, approved revision and unchanged source fingerprint; owner authority never substitutes for another requester. Confirmation is an explicit ProposedAction and never approves a purchase, payment or claimed monetary saving. Owner enable/pause controls, complete run inputs/sources/mode/messages/proposals/outcomes, audit and source-exact archives are retained without restoring historical identity authority. Real hourly Cron claims each 30- and 90-day elapsed interval (86400000 milliseconds per day from the earliest accepted native delivery receipt timestamp for the issued purchase lineage) before one mail attempt, rechecks policy, revision and requester, records outcomes without inbox-delivery claims and never repeats a consumed interval. Each overdue interval is handled once; paused intervals are suppressed and consumed rather than replayed after re-enabling. REPORT-003 annotates eligible existing realized-savings rows with exact confirmed outcome sources without adding any money; its buyer-only financial scope, award/approval/invoice/receipt/return/risk/currency rules remain intact on value reports, state, download and confirmation doors. Before shipping, live IdP or Auth usage collection inherits this whole clause under ACCESS-002 and SECURITY-001 and must pass its provider sandbox; native imported evidence is not live collection. ACCESS-001/003, ERASURE-001, PO-005 service milestones and AGENT-010 inherit new scope, record, source and governance capabilities before they ship.

**Acceptance.**
1. Approve a 50-seat software purchase promising full use; import seat-usage evidence showing 31 active seats, and see the agent's report state the shortfall with its sources and the requester's confirmation request.
2. Before shipping, feed confirmed outcome evidence to REPORT-003 realized savings with exact sources; never treat an unsigned or unawarded discount as realized.
3. Acceptance must assert the report amount and drill-through.

**Evidence.** `src/purse/value-promise.ts`; `src/purse/agent-value.ts`; `src/purse/agent-value-evidence.ts`; `src/purse/agent-value-checkins.ts`; `src/ui/agent-value.tsx`; `scripts/installer/restore-agent-value.mjs`; `tests/agent-value.test.mjs`; `tests/agent-value-checkins.test.mjs`; `tests/browser-agent-value.mjs`; `tests/browser.mjs`
**Gap.** Asserted: The approved exact request revision promises fifty seats; The imported provider original reports thirty-one active of fifty seats; The report shows the nineteen-seat shortfall and receipt source. No complete asserting-line trace is recorded for point 2: Confirmed outcome annotations retain exact realized-savings source versions, Unsigned and unawarded discounts never create realized savings; point 3: The report amount and all drill-through sources are independently compared. The policy-driven agent class and disposition cases also remain unproved.

#### AGENT-006 — Recurring-spend consolidation, renegotiation and cancellation proposals

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-AUDIT-001, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-003, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** The company policy decides this agent’s standard evidence work, external contact, sensitive records, money changes and commitment sign-offs. In the held-policy native journey, from supplier families, agreements and notice dates, price history, usage (AGENT-005) and service outcomes (SUPPLIER-005), the agent proposes which recurring spend to consolidate, renegotiate or cancel, each as a reproducible scenario showing the cash effect on commitments and forecast spend, operational risk and the notice deadline. Under the held company policy, finance and affected owners approve the commitment and money calls; the agent drafts the negotiation brief or cancellation notice, and the policy-named person sends it. The deterministic v1 slice has no model or provider. Conditional consolidation uses recorded calendar, category and supplier-family overlap; renegotiation uses exact reported underusage or comparable confirmed price increases; cancellation review uses zero reported active seats. Functional interchangeability remains unknown until human review, reported usage remains unverified and no figure is realized savings. Immutable safe source projections and revisions retain prices, notice terms, families, usage, service facts, commitment allocations and recomputable arithmetic. The native owner assigns agreement ownership to an active native member through audited agreement confirmation. Each assigned agreement owner consents under their own grant to the same source hash. Finance approval is independent of affected agreement and budget owners and requires payable approval and cash access over linked purchases. Every budget whose recorded allocated commitment changes also consents through its configured budget owner, or the policy approver where no separate budget owner is recorded. Procurement and finance prepare only within source scope. Forecasts use recorded value, auto-renewal, recorded renewal months or inclusive term duration, and recorded increase caps; they are labelled "forecast from recorded terms; not issued, not realized". Missing recorded value or term remains unknown. Renewal assumptions show the hypothetical proposed total separately from issued obligations and commitments. Scheduled discovery runs inside each agreement's recorded reminder lead window through its notice deadline. It records source-exact proposals and in-app notices for finance approvers and assigned owners, deduplicated by source and notice window. It grants no consent, draft, send or purchasing authority. After all exact consents, the native owner requests a nonbinding draft and separately consents to send its exact hash to an explicit recipient through PO-004's native send boundary. The claim precedes the existing native mail adapter; it is consumed once and an uncertain outcome is never retried automatically. The send is recorded against the agreements and notice deadlines. A separate native-owner-approved agreement disposition records cancellation or non-renewal after an accepted notice attempt; the person separately ends future recurring orders and records outstanding PO cancellation through their existing authorized doors. The scenario itself cancels nothing. Drafting and sending recheck sources, policies, grants and native consent identity versions. Historical archives preserve source facts and accountability without restoring authority. Assigned owners receive safe agreement terms and the curated affected scenario, with no original, protected-data or general invoice read grant. New recipient and actor stores inherit ERASURE-001. Erased source values retain their original hashes as labelled anonymous history under sealed erasure evidence; monetary arithmetic still recomputes, and erased scenarios cannot approve, draft, send or authorize a disposition. AGENT-005, AGENT-010 and future proposal or sending capabilities inherit this whole source, scope, protected-context and explicit-current-authority boundary before shipping. Notice drafts cite recorded notice terms and say "verify the notice method your agreement requires"; no notice effectiveness or legal adequacy is claimed.

**Acceptance.**
1. With overlapping subscriptions and an approaching notice date, the agent proposes consolidation with a scenario whose figures recompute from the cited records; under the held company policy, sending or cancellation waits for the policy-named owner to approve and send.

**Evidence.** `tests/agent-value.test.mjs`; `tests/agreements.test.mjs`; `tests/agent-value-checkins.test.mjs`; `tests/browser-recurring-scenarios.mjs`; `tests/recurring-scenario-web-rider.mjs`
**Gap.** Asserted: The scenario has exact baseline, proposed and cash-effect amounts; The recorded agreement notice deadline and supplier issue source are retained; Every recorded forecast figure recomputes from its cited source terms. No complete asserting-line trace is recorded for point 1: A company-selected held policy is independently proven for sending and cancellation. The policy-driven agent class and disposition cases also remain unproved.

#### AGENT-007 — Supplier onboarding and compliance agent

Core · push-further · **missing** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-MAIL-001

**Requirement.** The agent chases incomplete SUPPLIER-001 onboarding and expiring documents, checks W-9 TIN and name through an IRS TIN Matching partner, runs SUPPLIER-007 screening, compares new bank details with verification results and flags anomalies, including a new account days before a large invoice or a remit change by email. Supplier contact carries external, TIN and bank data sensitive, and activation or bank changes money and security as applicable. The company policy decides these calls; SUPPLIER-002 verification is not manufactured by storage or risk review.

**Acceptance.**
1. Under the held company policy, onboard a supplier whose TIN does not match its name; the agent flags the mismatch, chases a corrected W-9 and activation waits for the policy-named buyer.

**Evidence.** None.
**Gap.** Supplier onboarding and compliance agent not built

#### AGENT-008 — Coding and policy agent

Core · push-further · **done** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-AUDIT-001, BASE-INPUT-003, BASE-ROLE-001

**Requirement.** The company policy decides this agent’s standard evidence work, external contact, sensitive records, money changes and commitment sign-offs. In the held-policy native journey, the agent suggests GL account, class, department and project coding on requests and invoices from history, and flags split purchases that avoid an approval threshold, repeat non-PO spend that should be on a PO, and purchases from a non-preferred supplier when a preferred one exists. People accept or correct suggestions, and corrections improve later suggestions: each accepted or corrected coding is kept as an example for that supplier, item and requester, and later suggestions weigh the most recent corrections above older history and cite them. The native deterministic-v1 executor uses scoped requests and PO-backed invoices, records model and provider as none, and applies the company policy to standard preparation and any commitment sign-off. A possible split means the same requester, exact supplier and currency submitted two or more requests, each at 80% to below a configured applicable approval limit, on one business-local day, whose sum exceeds that limit; it is a review flag, never a finding of intent or an approval. Coding suggestions cite exact native invoice and immutable human-example versions; recent human choices take precedence over uncorrected history, with item and requester relevance retained. A human choice is retained separately from original invoice evidence; request changes still use ordinary editing and renewed approval. Preferred alternatives are accessible approved catalog items in the same category and currency, with suitability left to review. invoices all require a PO, so repeat non-PO activity is explicitly unavailable; INVOICE-004 inherits that detection and blanket-PO suggestion duty when its source door ships. CODING-001, CODING-002 and future ledger posting inherit the reviewed coding, source, scope and audit boundaries.

**Acceptance.**
1. Submit two requests from one requester to one supplier just under a threshold on the same day; the agent flags the split for the approver, and its coding suggestion on a new invoice cites the past invoices it learned from.
2. Correct its GL account suggestion on two invoices from one supplier: on the third invoice from that supplier the agent suggests the corrected account and cites the two corrections.

**Evidence.** `tests/coding-agent.test.mjs`; `tests/browser-coding-agent.mjs`
**Gap.** None.

#### AGENT-009 — Price benchmark and negotiation brief

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011

**Requirement.** For a request or renewal the agent compares quoted unit prices with the business's purchase history, PunchOut prices and other quotes received, and drafts a negotiation brief with target price and arguments. Drafting carries standard, an outside message external, and making or accepting a binding offer commitment and money; the company policy decides the calls.

**Acceptance.**
1. Under the held company policy, request an item bought before at a lower price; the brief cites the earlier PO and PunchOut price, proposes a target, and a message waits for the policy-named buyer.

**Evidence.** `src/purse/agents.ts`; `tests/purse.test.mjs`
**Gap.** No benchmark or agent execution

#### AGENT-010 — Agent governance

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-INPUT-001, BASE-MAIL-001, BASE-ROLE-001

**Requirement.** Purse agent runs retain purchasing inputs, exact sources, model/provider, messages, proposals and outcomes by purchase type. Chasing uses PO-003 cadence and count facts; the company policy sets the disposition and business limits. Ordinary preparation uses protected-field-free context; a protected-data tool carries sensitive and security with its authorized source projection. Supplier messages and documents retain their source lineage. The Base policy, Pause, attribution and grant duties apply to every native, API and MCP agent door.

**Acceptance.**
1. Under the held company policy with AGENT-003 limited to two chases, see it stop at the limit, pause it mid-run and see no further sends; inspect the run record and show that an instruction planted in a supplier reply does not alter its job.
2. Through each new preparation door, verify that ordinary context and proposed actions contain no SECURITY-001 protected values or suffixes; any separately authorized protected-data operation declares sensitive and security and follows company policy.

**Evidence.** `tests/agent-governance.test.mjs`; `tests/purse.test.mjs`; `tests/browser-agent-governance.mjs`; `tests/agent-value.test.mjs`; `tests/agent-value-checkins.test.mjs`; `tests/quote-agent.test.mjs`
**Gap.** Asserted: The configured run sends two chases and one escalation, never a third chase; Pausing during a send suppresses the next chase and escalation; Every retained run includes inputs, sources, mode, provider, messages, proposals and outcomes. No complete asserting-line trace is recorded for point 2: A separately authorized sensitive/security operation is classified and decided by company policy. The policy-driven agent class and disposition cases also remain unproved.

#### AGENT-011 — Spend questions in plain language

Core · push-further · **done** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-011, BASE-ROLE-001

**Requirement.** The company policy decides this agent’s standard evidence work, external contact, sensitive records, money changes and commitment sign-offs. In the held-policy native journey, a member asks a spend question in the web, Slack or Teams ("what did Marketing commit to software this quarter against budget?", "which suppliers did we pay over $50,000 last year without a PO?"); the agent answers from Purse's own records within that member's ACCESS-001 scope, shows the figures as a table or chart, states the filters and period it used, and links every figure to the requests, POs, invoices and card transactions behind it so it recomputes through REPORT-001. It says when the data cannot answer the question rather than estimating, and never sees SECURITY-001's protected fields. The native web reader is deterministic v1 with model and provider recorded as none; it accepts exact REPORT-001 dimensions, one stated UTC period and a reserved, committed or recorded-actual metric. It refuses unsupported conditions in full, including payment, card and non-PO questions whose sources are unavailable. Owner purchase-type controls and immediate pause apply under AGENT-010; each run retains scoped filters, figures, source versions and its answer or refusal. INTAKE-002 and INTAKE-003 inherit the same current-member scope, refusal, source drill-through, protected-field exclusion and governance obligations before a Slack or Teams question door ships.

**Acceptance.**
1. With a populated workspace, ask three spend questions as a finance viewer and one as a department-scoped requester; each answer equals the REPORT-001 figure for the stated filters and drills to its records, the requester's answer covers only their scope, and a question the data cannot answer is declined with the reason.

**Evidence.** `tests/spend-report.test.mjs`; `tests/browser-spend-questions.mjs`
**Gap.** None.

## Agent surface

### Agent surface

#### SURFACE-001 — Purchasing registry and native-action parity

Agent surface · target · **missing** · From new · Cites BASE-AGENT-002, BASE-AGENT-006

**Requirement.** Purse offers purchasing registry and native-action parity for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. The registry covers every Core clause in the tool and not-tool lists below, including split parts.
2. A request draft, exact-revision decision, PO conversion, receipt, supplier invoice and ledger posting through their tools produce the same purchasing record and event type as their native actions.
3. The registry exposes the declared input and output shape for each purchasing job and reports the native purchasing refusal code.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-002 — Purchasing record resources

Agent surface · target · **missing** · From new · Cites BASE-AGENT-003

**Requirement.** Purse offers purchasing record resources for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. Resource templates cover requests and revisions, suppliers and their safe projections, catalogue items, POs, receipts, invoice evidence, agreements, budgets and agent runs.
2. After a tool changes a PO or invoice, its returned record link opens the exact resulting version with the sponsoring person’s purchasing projection.
3. A department-scoped requester and an AP clerk receive their respective purchasing fields, including SECURITY-001 masking.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-003 — Internal work and external exposure classes

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006

**Requirement.** Purse offers internal work and external exposure classes for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. Creating an internal reversible draft is standard with its item count; exposing its selected records to a supplier is external with recipient count and known, new or public counterparty.
2. A move, correction, attachment, restoration or message that newly exposes purchasing data outside the business receives external from the actual destination.
3. A TIN, bank-account or card-data read receives sensitive with record count and data kind; ordinary preparation retains its protected-field-free projection.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-004 — Money and binding purchasing decisions

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006

**Requirement.** Purse offers money and binding purchasing decisions for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. A payment, card funding, changed charge or purchasing price carries money with exact amount, currency and counterparty.
2. Issuing an order, accepting a supplier offer, signing off an award or giving a binding notice carries commitment with its value and counterparty.
3. A binding money action carries both money and commitment; drafting the same proposal carries standard until the call binds or changes the business obligation.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-005 — Outside resources and provider-kept steps

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-008

**Requirement.** Purse offers outside resources and provider-kept steps for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. Creating an outside card, account or paid provider resource carries accounts with its provider.
2. An outside provider’s consent, hosted card entry or identity/business verification step carries gated with provider and step when that provider requires a person.
3. Where that provider offers a company API or brokered credential route, the call uses that route and the company policy decides the applicable classes.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-006 — Authority, protection and irreversible effects

Agent surface · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-006

**Requirement.** Purse offers authority, protection and irreversible effects for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. Membership, roles, buyer limits, integration grants or device changes carry access with affected people and widening or narrowing direction.
2. Credential rotation, bank-protection controls and encryption settings carry security with the setting.
3. Erasure and irreversible supplier or purchasing-data removal carry destructive with the item count; reversible drafts and ordinary corrections remain standard.
4. Protected-data reveal combines sensitive and security while retaining the sponsor’s current source and field authority.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-007 — Policy across procurement workflows

Agent surface · target · **missing** · From new · Cites BASE-AGENT-007

**Requirement.** Purse offers policy across procurement workflows for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. Run the request-to-order and invoice-exception jobs under an all-autonomous company policy and the held company policy, with classes computed from their current purchasing records.
2. Under the held policy, the saved PO issue, award and supplier message show their exact purchasing revision, recipient, amount and policy-named approver; changing that revision requires a new decision.
3. A changed policy applies across native embedded agents, the integration API and MCP on the same purchasing fixture.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-008 — Purchasing decisions and attribution

Agent surface · target · **missing** · From new · Cites BASE-AGENT-008

**Requirement.** Purse offers purchasing decisions and attribution for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. An agent-created purchase, supplier message, invoice action and binding notice retain the agent as preparer or actor and the sponsoring person in records, activity, downloads and outside sender identity.
2. A person’s exact-revision purchasing approval remains that person’s act; an equivalent agent decision is recorded as the agent’s act and classified commitment and money as applicable.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-009 — Procurement activity by class

Agent surface · target · **missing** · From new · Cites BASE-AGENT-009

**Requirement.** Purse offers procurement activity by class for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. A seeded week’s requests, supplier contact, order issues, receipts, invoice reviews and ledger actions reconcile with the Agents view by computed class and policy decision.
2. The review feed and pending purchasing decisions retain their exact source record and purchasing revision; Undo uses the existing reversible native action where one exists.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-010 — Procurement events and specialist handoffs

Agent surface · target · **missing** · From new · Cites BASE-AGENT-010

**Requirement.** Purse offers procurement events and specialist handoffs for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. Request, approval, supplier, PO, receipt, invoice, payment-return, agreement and source-risk changes expose the event types listed below with their exact purchasing record links.
2. Pier replenishment and Linen asset needs arrive as request drafts; Pantry bill and payment events reconcile to their original Purse invoice.
3. A late-order event reaches the procurement specialist with the PO evidence and a bill-created event can ask Chest for a missing W-9 without inventing purchasing authority.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-011 — Purchasing capacity and company limits

Agent surface · target · **missing** · From new · Cites BASE-AGENT-011

**Requirement.** Purse offers purchasing capacity and company limits for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. An over-size purchasing attachment or response returns its declared capacity refusal without truncation.
2. Run a supplier-contact recipient threshold and a payment amount threshold under company policy, retaining exact recipient counts, amounts, currencies and counterparties.
3. Model, mail and other provider estimates and actual spend attach to the purchasing run; the company’s no-cap answer permits the same run and still reports spend.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-012 — Once-only purchasing actions and conflicts

Agent surface · target · **missing** · From new · Cites BASE-AGENT-012

**Requirement.** Purse offers once-only purchasing actions and conflicts for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. Retry an order issue, receipt, supplier-invoice submission and ledger post after an interrupted response; each retains one native effect and its source lineage.
2. A stale purchasing revision refuses the change with its current revision; a long import, export or source-reading job retains its authorized record handle.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

#### SURFACE-013 — Procurement specialist seeded week

Agent surface · target · **missing** · From new · Cites BASE-AGENT-001, BASE-AGENT-013 · Register R-7

**Requirement.** Purse offers procurement specialist seeded week for its procurement specialist, using the purchasing records and jobs below.

**Acceptance.**
1. A stranger agent given only the installation URL creates a sourced request, obtains its applicable purchasing decision, issues and chases the PO, records a partial receipt, resolves an invoice exception, posts the approved bill and reads returned payment status through MCP.
2. Run that same seeded week under all-autonomous and held company policies. Under all-autonomous every declared class runs without a policy wait or refusal; under held the company-named person completes exactly the decisions that policy requires.
3. The week preserves source records, exact budgets, once-only invoices, currency-separated figures, risk holds and agent attribution across the native and MCP actions.

**Evidence.** None.
**Gap.** The procurement MCP adapter and seed-specific Base conformance journey are not implemented.

## Later

None.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Human screen-reader pass | MOBILE-001 | not run | | |
| R-2 | VPAT | MOBILE-001 | not run | | |
| R-3 | iOS and Android store approvals | MOBILE-002 | not run | | |
| R-4 | Real Okta, Entra ID, Google Workspace and JumpCloud tenant qualification | ACCESS-002 | not run | | |
| R-5 | Anonymized real Procurify account export and purchasing case | IMPORT-001 | not run | | |
| R-6 | Owner current-process cost and attention baseline | AGENT-005 | not run | | |
| R-7 | Claude, ChatGPT, Codex and Copilot client qualification | SURFACE-013 | not run | | |
