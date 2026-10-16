# Purse product contract

Target edition: 17 October 2026. Purse is connected procurement for growing US businesses (50–500 employees) that replaces Procurify, and gives a buyer of Coupa's mid-market purchase-to-pay or Precoro a complete switch, with the intake orchestration and agent depth buyers look for in Zip and Levelpath. Employees ask for what they need on the web, in Slack or Microsoft Teams, on a phone or from an Amazon Business or other PunchOut catalogue; suppliers are onboarded with W-9, insurance and verified bank details; budgets and approval chains hold spend before it is committed; purchase orders are actually sent, acknowledged and chased; goods and services are received; supplier invoices arrive by email, are read, de-duplicated and matched two- or three-way; and vendors, POs, bills and payment status stay in sync with QuickBooks Online, Xero, NetSuite or [Pantry](https://github.com/just-every/run-pantry) without double posting. Money is USD by default (other currencies stay separate), dates and reminders follow US time zones and daylight saving, and fiscal years, 1099 reporting, sales and use tax and ACH follow US norms.

This is a target contract, not a release verdict: it describes the product Purse is being built towards so the distance can be measured. Every named clause states the behaviour a buyer gets and the acceptance evidence (a journey or test through a public door) that proves it. The status table at the end marks each clause `done`, `partial` or `missing` against current code and tests; a cited local test proves the bounded local behaviour only, never hosted placement, provider receipt or a real owner export. Clause IDs PUR-001 to PUR-017 are kept unchanged. This documentation round changes no homepage, interface or runtime behaviour.

Purse is one product among sibling seeds and keeps the market's separation: [Pantry](https://github.com/just-every/run-pantry) is the general ledger, [Coaster](https://github.com/just-every/run-coaster) owns employee expenses, corporate cards and reimbursements, [Locket](https://github.com/just-every/run-locket) owns contract lifecycle management, [Inkwell](https://github.com/just-every/run-inkwell) owns e-signature, [Pier](https://github.com/just-every/run-pier) owns warehouse inventory, [Easel](https://github.com/just-every/run-easel) owns financial planning, [Auth](https://github.com/just-every/run-auth) is a workforce identity provider and [Linen](https://github.com/just-every/run-linen) is the IT service desk. Purse integrates with each of them, and with their incumbents, rather than rebuilding them.

## Purchasing core (existing guarantees)

- **PUR-001 — Business setup and scoped capabilities.** One business retains locations, cost centres, projects, currencies and native-session requester, approver, buyer and receiver capabilities. Setup preserves identity and data. The full role model is ACCESS-001's. **Acceptance evidence:** Sign in as genuine members, configure the business and capabilities, re-run setup and restart; each member keeps exactly the configured capabilities and no data is lost (`tests/purse.test.mjs` P01).

- **PUR-002 — Supplier register with blocking.** Suppliers retain contacts, documents, agreements and preferred/blocked reasons. Blocked suppliers cannot enter native purchasing. Self-service onboarding, tax and bank details are SUPPLIER-001 to SUPPLIER-003's. **Acceptance evidence:** Create, prefer and block suppliers through the API; submission, approval, conversion and issue to a blocked supplier fail with the recorded reason (P02).

- **PUR-003 — Approved catalogue prices.** Approved catalogue reference prices copy into request revisions; subsequent catalogue changes do not change approved terms. **Acceptance evidence:** Request a catalogue item, change its price after approval and see the approved revision and PO keep the original price (P03).

- **PUR-004 — Durable exact request revisions.** Durable drafts retain decimal quantities, project/category/need date, real attachment bytes and immutable revision history. Invalid values are refused. **Acceptance evidence:** Create and amend a request with attachments, download the original bytes and read every revision; invalid quantities and dates are refused without writes (P04).

- **PUR-005 — Quotation comparison.** Supplied quotations compare price, freight, tax, delivery, conditions and evidence, with missing fields visible and currencies separate. Supplier-submitted responses are SOURCE-002's. **Acceptance evidence:** Record quotes in two currencies with a missing freight value; the comparison never merges currencies and shows the missing field (P05).

- **PUR-006 — Exact-revision policy and concurrent budgets.** Current amount/category/project policy binds the exact request revision. Self approval fails. Concurrent budget reservations cannot overspend. Multi-step chains are APPROVAL-001's. **Acceptance evidence:** Approve the exact revision under policy, attempt self approval and race two reservations against one budget; only one fits (P06).

- **PUR-007 — Decisions and scoped delegation.** Approve/reject/return decisions retain reason, actor, time, revision and delegation. Scoped delegation expires. Resubmission preserves history. **Acceptance evidence:** Return, resubmit and approve under an expiring delegation; after expiry the delegate is refused and the history keeps every decision (P07).

- **PUR-008 — Approved lines become numbered POs once.** Approved lines allocate once to numbered POs with source links and downloadable documents, including concurrent conversion. **Acceptance evidence:** Convert the same approved lines concurrently; one PO receives them and its document downloads (P08).

- **PUR-009 — Issuance and amendments under renewed authority.** Document generation and authorised issuance are distinct. Revisions and POs retain approved supplier identity and terms across supplier-directory edits. Supplier/quantity/cost amendments retain issued history, invalidate stale authority, reserve changes and require renewed approval before an amendment is issued. Sending to the supplier is PO-001's. **Acceptance evidence:** Issue a PO, edit the supplier directory, amend supplier and cost; the old issuance remains, the amendment needs fresh approval and reserves its change (P09).

- **PUR-010 — Receiving, returns and commitments.** Partial receipts, service milestones, rejection, return and cancellation retain reasons. Events explain outstanding quantities and commitments. Physical returns exceeding current replenishment authority remain recorded with an explicit hold for review, without overspending. Overreceipt, repeat return and wrong roles fail. **Acceptance evidence:** Receive partially, reject, return beyond authority and cancel; outstanding quantities and commitments reconcile and invalid receipts are refused (P10).

- **PUR-011 — Invoice evidence, discrepancies and accounting CSV.** Supplier ID plus invoice reference identifies invoice evidence once across POs. Identical re-entry is idempotent; conflicting evidence is refused for review. Allocations expose price/quantity/receipt discrepancies and export accounting CSV once without posting or payment. Live posting is SYNC-001 to SYNC-004's and payment is AP-001's. **Acceptance evidence:** Enter an invoice twice identically and once conflicting, allocate across POs and download the CSV; discrepancies show and the conflict is refused (P11).

- **PUR-012 — Commitments, overdue and renewals visible; complete restore.** Commitments remain currency-separated, overdue receiving and renewals stay visible, and complete `.rer` archive restore preserves domain links, decisions, files and import history. Corrupt/nonempty restore fails atomically. **Acceptance evidence:** Export a populated installation, restore into an empty one and compare records and files; corrupt or nonempty restores write nothing (`tests/browser-archive.mjs`, overview in `src/ui/overview.tsx`).

- **PUR-013 — Reviewed CSV move-in.** The documented first CSV move-in kit uses Base import-kit D1, current native-session SQL guards, exact source keys/bytes/mapping decisions, no-write preview, reviewed commit, resume, idempotence and conflict-preserving undo. Imported status never grants authority. Real incumbent exports are IMPORT-001 and IMPORT-002's. **Acceptance evidence:** Preview, change input, commit, resume and undo a fixture CSV; changed input needs a new review and undo preserves edited targets (P13).

- **PUR-014 — Governed human preparation and proposed actions.** Five human preparation workflows (intake, RFQ, renewal, exception, negotiation) retain editable downloadable drafts, missing fields, source references and input versions. ProposedActions recheck current authority at execution. No result is presented as an agent's unless an agent produced it, and nothing is sent or bound without the authority that action requires. The agents that do this work are AGENT-001 to AGENT-010's, governed by AGENT-010. **Acceptance evidence:** Prepare, edit and download each workflow's draft, then execute a proposed action with stale input and with the wrong role; both are refused (P14).

- **PUR-015 — Owner-run source and command path.** MIT source runs through maintained RER install/setup/dev/build/preview/verify/reset/export/import/deploy-dry-run/describe/check, with native TanStack Start/Hono/Cloudflare, shipped fonts, Purse theme and real dev personas. **Acceptance evidence:** Run the RER command path from a fresh clone and the browser journey (`tests/runtime.mjs`, `tests/browser.mjs`, `tests/run-site.mjs`).

- **PUR-016 — Exact money and quantities with an append-only ledger.** Quantities are thousandths; money is integer minor units, each line rounds half-up once. Commitment reservations/releases/amendments append to an auditable ledger. Invalid/nonfinite values fail. **Acceptance evidence:** Enter decimal quantities and currency text, round lines and amend; the commitment ledger is append-only and invalid values leave state unchanged (P16 and the currency-text test).

- **PUR-017 — Current-session authorisation on every door.** Every private API/download checks current native session, capability, business and record scope. Forged actor, role, revision and total cannot authorise. Denials preserve domain state. **Acceptance evidence:** Call every command and download signed out, with the wrong role, forged revision, revoked session and another record's scope; each is refused without mutation (P17).

## Roles, access and entities

- **ACCESS-001 — Full procurement role model.** Beyond PUR-001's capabilities, a business assigns owner, admin, requester, approver, buyer, receiver, AP clerk, finance viewer and read-only auditor roles, scoped by department, location, project and entity. Requesters see only their own purchases and their department's where granted; AP sees invoices and supplier tax and bank fields only through SECURITY-001's masking; auditors read everything and change nothing. Admins can define custom roles from the same permission set. Every grant and revocation is audited. **Acceptance evidence:** Sign in as each role at 1440 and 390 pixels and through the API; each sees and does exactly its scope, a department-scoped approver cannot act outside it, an auditor's write is refused and the audit shows each grant.

- **ACCESS-002 — Single sign-on and provisioning.** Owners connect SAML 2.0 or OIDC sign-in with Okta, Microsoft Entra ID, Google Workspace, JumpCloud or [Auth](https://github.com/just-every/run-auth), and SCIM 2.0 provisioning creates, updates and deactivates members with their department and manager. Deactivation ends sessions and transfers open approvals to the manager or a named delegate, so no request stalls on a departed approver. **Acceptance evidence:** Sign in through a test IdP, provision and deprovision a user by SCIM, and see their sessions end and pending approvals move to the delegate with an audit record.

- **ACCESS-003 — Multiple entities and subsidiaries.** One installation holds several US legal entities (or a US parent with foreign subsidiaries), each with its own EIN, ship-to and bill-to addresses, currency, chart of accounts mapping, numbering and accounting connection. Approvers see one cross-entity queue filtered by entity, and a PO cannot be charged to an entity's budget it does not belong to. **Acceptance evidence:** Configure two entities with different accounting connections, raise and approve requests in each from one queue, and see POs numbered and synced to the right ledger; a cross-entity charge is refused.

## Intake

- **INTAKE-001 — Guided intake by category.** Admins build intake forms per purchase type (goods, software and subscriptions, professional services, contractors, equipment) with conditional questions, required attachments (specifications, quotes, security questionnaires), default coding and a requested need date. The employee path is a single short form that hides fields their purchase does not need, shows which policy and approvers will apply before submission and keeps a draft if they leave. **Acceptance evidence:** Configure a software form with a conditional security question, fill it as a requester on a phone, see the predicted approval route before submission and submit; the request revision carries every answer and file.

- **INTAKE-002 — Slack intake, approvals and updates.** A Purse Slack app lets employees start a request with a shortcut or message, attach files, and follow its status in a thread; approvers approve, reject or return the exact revision from an interactive message after sign-in binding; requesters receive PO, acknowledgement, delivery and chase updates. Slack actions use the same server-side authority as the web. **Acceptance evidence:** Install the app in a test workspace, raise a request from Slack, approve it from the approval message, amend it and see the stale message refuse to approve; status updates arrive in the thread.

- **INTAKE-003 — Microsoft Teams intake, approvals and updates.** The same journey as INTAKE-002 through a Teams app (Bot Framework with Adaptive Cards), installable by a Teams admin, with approval cards bound to the exact revision. **Acceptance evidence:** Sideload the Teams app in a test tenant, raise and approve a request from Teams cards, and see a stale card refused and updates delivered to the chat.

- **INTAKE-004 — Email intake.** Each business has a request address; an employee forwards a supplier quote or describes a need by email and receives a link to a prefilled draft with the attachments retained. Mail from unknown senders is held, never turned into a request. **Acceptance evidence:** Send a quote PDF from a member's address to the request address and from an unknown address; the member gets a prefilled draft link and the unknown mail is held.

- **INTAKE-005 — Cross-team review orchestration.** A purchase type can require reviews by IT security, legal, privacy or finance in parallel or sequence before approval, with each reviewer's questions, files and decision on the request. Reviews can open and track tickets in Jira, ServiceNow or [Linen](https://github.com/just-every/run-linen), pull a supplier's risk result from OneTrust, and hand contract review to [Locket](https://github.com/just-every/run-locket). **Acceptance evidence:** Submit a new-software request that triggers security and legal reviews, complete one in Purse and one through a linked Jira ticket, and see approval wait for both.

## Mobile

- **MOBILE-001 — Responsive web requesting, approval and receiving.** Requesting, approval status, approval and receiving work in the browser at phone width with readable records and no horizontal scroll. **Acceptance evidence:** Run the fresh-install browser journey at 390 pixels: request, approve and record a partial receipt (`tests/browser-journey.mjs`, `tests/browser.mjs`).

- **MOBILE-002 — Native iOS and Android apps.** Native apps sign in with the business's identity provider, push approval, acknowledgement and delivery notifications through APNs and FCM, approve the exact revision, photograph a packing slip or scan a barcode to receive, and queue receipts offline until they reconnect with conflict checks. **Acceptance evidence:** On test devices, approve from a push notification, receive offline with a slip photo, reconnect and see the receipt applied once; a revoked session is refused.

## Suppliers

- **SUPPLIER-001 — Self-service supplier onboarding.** A buyer invites a supplier by email to a no-account onboarding link where the supplier enters legal name, DBA, entity type, address, contacts, remit-to, W-9 (TIN, federal tax classification, backup-withholding certification and e-signature), certificate of insurance, diversity certificates and payment terms. The buyer reviews and activates; the supplier can return through a fresh link to update details, which then go back to review. **Acceptance evidence:** Invite a supplier, complete onboarding from the link on a phone with a W-9 and COI, review and activate; the supplier becomes purchasable and its documents download.

- **SUPPLIER-002 — Bank-detail change controls.** Supplier bank and remit details are entered only by the supplier through SUPPLIER-001's link or by AP with evidence, then verified by a call-back to a previously known contact and an independent second approver before use. Account ownership is checked through a bank-verification provider (for example Plaid Auth or the payment provider's own check). Any change emails the previous contact, places pending payments to that supplier on hold and is audited; a change requested by email alone is never applied. **Acceptance evidence:** Change a supplier's bank details through the link, see payments hold, the old contact notified and activation refused until a second approver records the call-back; an emailed change request cannot alter the details.

- **SUPPLIER-003 — Duplicate supplier detection.** New and imported suppliers are checked against existing ones by TIN, normalised legal name and DBA, email domain, address, phone and bank account; possible duplicates are shown before creation and can be merged, keeping both histories. **Acceptance evidence:** Create a supplier differing only by punctuation and one sharing a TIN with an existing record; both are flagged, and a merge keeps every PO and invoice link.

- **SUPPLIER-004 — Document expiry, compliance refresh and renewal reminders.** Insurance certificates, W-9s, licences, security reviews and agreements carry expiry dates; Purse emails the supplier and owner before expiry on a schedule, requests refreshed documents through SUPPLIER-001's link on configured compliance cycles, and can block new POs to a supplier whose required document has lapsed. **Acceptance evidence:** Advance the clock past a COI's reminder and expiry dates; the supplier and owner are emailed, the refreshed COI clears the warning, and a lapsed supplier's new PO is held.

- **SUPPLIER-005 — Supplier performance and issues.** Each supplier shows on-time delivery against promised dates, quality rejections and returns, invoice accuracy (match exceptions per invoice), acknowledgement speed, spend and open issues, with issue records (late, damaged, wrong item, billing) linked to POs and resolved with reasons. **Acceptance evidence:** Record late and rejected deliveries and an invoice mismatch for a supplier; its scorecard reflects each and every figure drills to the records behind it.

- **SUPPLIER-006 — 1099 readiness.** Suppliers carry 1099 eligibility from their W-9, a default 1099-NEC or 1099-MISC box, and backup-withholding status; payments recorded through AP-001 and AP-002 total by calendar year per box and export to the ledger ([Pantry](https://github.com/just-every/run-pantry), QuickBooks Online, Xero, NetSuite) or a filing partner such as Track1099 or TaxBandits. Purse does not file returns. **Acceptance evidence:** Pay 1099 and non-1099 suppliers across a year end; the year's 1099 report totals only eligible payments by box and the export matches the payment records.

- **SUPPLIER-007 — Restricted-party screening.** New suppliers and changes of name or address are screened against the US Treasury OFAC SDN list (through the public list or a screening provider); possible matches block activation for compliance review, and the screening result and source date are kept. **Acceptance evidence:** Onboard a supplier whose name matches a test SDN entry; activation is blocked pending review and the result records the list version.

## Sourcing and catalogues

- **SOURCE-001 — RFQ invitations and supplier responses.** A buyer sends a request for quotation to nominated suppliers with scope, quantities, response deadline and questions; suppliers respond through a no-account link with line prices, freight, tax, lead time, validity and files; reminders go before the deadline; responses land in PUR-005's comparison and the buyer awards one, with the award reason kept. **Acceptance evidence:** Invite three suppliers, have two respond through their links and one miss the deadline after a reminder, compare and award; the request revision carries the awarded quote.

- **SOURCE-002 — Quote document processing.** A supplier quote PDF or email attached to a request is read into draft lines (item, quantity, unit price, freight, tax, lead time, validity) with field confidence; the requester or buyer confirms before the lines enter the revision. **Acceptance evidence:** Attach a sample quote PDF; the extracted lines show confidence, a corrected field is kept, and nothing enters the revision until confirmed.

- **PUNCHOUT-001 — Amazon Business PunchOut.** Requesters punch out from Purse into the business's Amazon Business account (cXML PunchOut), build a cart under its buying policies and return it as request lines with Amazon item IDs and prices; after approval Purse transmits the PO by cXML OrderRequest, and Amazon order confirmations, shipments and invoices flow back to the PO, receipts and invoice matching. **Acceptance evidence:** Against Amazon Business's PunchOut test environment, punch out, return a cart, approve, transmit the PO and receive the confirmation and invoice onto the same PO.

- **PUNCHOUT-002 — Other PunchOut and hosted catalogues.** The same cXML and OCI PunchOut path connects Staples Business Advantage, Grainger, CDW, Office Depot, Uline and Fisher Scientific, and suppliers' hosted catalogues can be loaded from CSV with price validity dates. **Acceptance evidence:** Connect a cXML test catalogue and an OCI one, return carts from each and transmit approved POs; a catalogue CSV with expired prices is refused.

- **STOCK-001 — Stockroom consumables.** Office, cleaning and site consumables carry stockroom counts and reorder points; a count below its reorder point creates a draft request to the preferred supplier or PunchOut item for the owner to submit. Businesses that run warehouse inventory use [Pier](https://github.com/just-every/run-pier), which can send its own replenishment needs to Purse as requests. **Acceptance evidence:** Record a count below a reorder point; a draft request appears with the preferred item and quantity, and nothing is submitted until a person does.

## Approvals and budgets

- **APPROVAL-001 — Multi-step conditional approval chains.** Chains combine sequential and parallel steps chosen by amount, department, location, project, category, GL account, supplier risk, new-supplier status and the requester's manager hierarchy (from ACCESS-002 or the member record). The request shows which rule chose each step and why, and an amendment re-evaluates the chain against the new revision. **Acceptance evidence:** Configure a chain that adds finance above $10,000 and IT for software; submit requests either side of each condition, see the route and reason before and after submission, and see an amendment re-route.

- **APPROVAL-002 — Approval reminders, escalation and out-of-office.** Pending approvers are reminded by email, Slack, Teams or push on the business's schedule in their time zone; after configured inaction the step escalates to the approver's manager or a named backup, and an approver's out-of-office period redirects new steps to their delegate automatically. Requesters see who holds their request and since when. **Acceptance evidence:** Leave a step pending past its reminder and escalation times; the approver is reminded, the backup receives the step, and the requester's view shows the holder and age.

- **APPROVAL-003 — Approve from any channel.** Approvers approve, reject or return from email links, Slack, Teams, the native app or the web, always against the exact revision and current authority; a message for a superseded revision cannot approve. **Acceptance evidence:** Approve one request from an email link and one from Slack, amend a third after its email was sent and see that email's approval refused.

- **BUDGET-001 — Budgets and live budget position.** Budgets are set per department, location, project, GL account or combination, by month, quarter or fiscal year (any US fiscal year start), in USD. Each budget shows amount, reserved by pending requests, committed by issued POs, actual from matched and synced bills, and available; requesters and approvers see the position at the moment they ask or decide. Over-budget requests are blocked or routed to a budget-owner step by configuration. **Acceptance evidence:** Set a quarterly department budget, raise, issue and bill purchases against it and see reserved, committed, actual and available move at each step; an over-budget request routes to the budget owner.

- **BUDGET-002 — Budget import and ownership.** Budgets import from CSV, a spreadsheet or [Easel](https://github.com/just-every/run-easel) and from the accounting system's budgets where available, with named budget owners who receive threshold alerts at configured percentages. **Acceptance evidence:** Import a budget file, assign owners, and cross 80% of a budget; the owner is alerted once and the import is previewed before it writes.

## Purchase orders and supplier communication

- **PO-001 — POs sent to suppliers and acknowledged.** Issuing a PO emails it to the supplier's order contact as a PDF from the business's own sending identity (RER mail relay or the buyer's Postmark account), with a no-account link where the supplier accepts, accepts with changes (dates, quantities, prices), or rejects, and gives a promised delivery date. Acknowledgement status and promised dates show on the PO for the buyer and requester; supplier-proposed changes become a PUR-009 amendment for approval, never a silent edit. Bounces and unopened orders are visible. **Acceptance evidence:** Issue a PO to a test inbox, acknowledge it with a changed date from the link and see the date on the PO, then propose a price change and see an amendment created for approval; a bounced address shows as undelivered.

- **PO-002 — Supplier messaging on the PO.** Each PO has a message thread with the supplier: buyer messages go by email, supplier replies to that email thread back onto the PO with attachments, and the requester sees the thread. Messages are retained with the PO and travel in archives. **Acceptance evidence:** Send a question from a PO, reply from the supplier inbox with an attachment, and see the reply and file on the PO for the buyer and requester.

- **PO-003 — Overdue acknowledgement and delivery chasing.** Unacknowledged POs and deliveries past their promised or need date are chased automatically by email on a buyer-configured cadence, escalated to the buyer after a configured number of chases, and visible to the requester with each chase and reply. Overdue receiving is already visible (PUR-012); chasing turns it into follow-through. **Acceptance evidence:** Advance the clock past a PO's promised date; the supplier receives chases at the configured cadence, the buyer is alerted after the limit and the requester's view shows each chase.

- **PO-004 — Change orders and cancellations sent.** Approved amendments and cancellations are sent to the supplier as numbered change orders and re-acknowledged through PO-001's link; the PO shows the acknowledged revision. **Acceptance evidence:** Approve a quantity amendment on an issued PO; the supplier receives change order 1, acknowledges it and the PO shows the acknowledged revision.

- **PO-005 — Blanket, recurring and service POs.** Blanket POs set a spending cap and validity period with draw-downs by release or invoice; recurring POs generate scheduled orders (monthly services, subscriptions) with renewal checks; service POs receive by milestone or percentage complete. Remaining balances count as commitments. **Acceptance evidence:** Create a $24,000 annual blanket PO, invoice against it three times and see the balance fall and an over-cap invoice flagged; a recurring PO generates its next order on schedule.

- **PO-006 — Shipment tracking.** Supplier acknowledgements, advance ship notices and PunchOut confirmations carry carrier and tracking numbers (UPS, FedEx, USPS, DHL); Purse shows tracking status on the PO and tells the receiver when a delivery is out for delivery or delivered. **Acceptance evidence:** Add a tracking number through the acknowledgement link and replay carrier status events; the PO and receiver show delivered and the receiver is prompted.

- **PO-007 — US sales and use tax on purchases.** Requests and POs carry sales tax by line, the business's resale or exemption certificates can be attached and sent with POs, and untaxed purchases of taxable items in a state where the business owes use tax are flagged for use-tax accrual in the ledger export. Tax rates can come from the supplier's invoice or Avalara AvaTax. **Acceptance evidence:** Issue a PO with an exemption certificate, receive an untaxed invoice for a taxable item and see the use-tax flag carried into the bill sync.

- **PO-008 — Automatic PO creation and sending after approval.** Per purchase type, an approved request can become a PO and be sent (or transmitted by PunchOut) automatically, with the buyer able to require manual review for chosen suppliers or amounts. **Acceptance evidence:** Approve a catalogue request under an automatic rule and see the PO created and sent; approve one above the manual-review amount and see it wait for the buyer.

## Receiving

- **RECEIVE-001 — Receiver prompts and invoice holds.** When a delivery is due, marked delivered by tracking or an invoice is waiting on receipt, the responsible receiver (or requester for services) is prompted by email, Slack, Teams or push with a one-tap partial or full receipt; invoices on hold for receipt release automatically when the receipt arrives and continue to matching. **Acceptance evidence:** Receive an invoice before goods; the receiver is prompted, the invoice is held, and recording the receipt releases it into matching without further action.

- **RECEIVE-002 — Credit memos, RMAs and supplier balances.** Returns and rejected services request a return authorisation from the supplier through PO-002's thread, credit memos are captured like invoices, linked to the return and PO, and applied to later bills; each supplier shows open credits and balance. **Acceptance evidence:** Return goods, request an RMA, receive a credit memo and apply it to the next bill; the supplier balance and synced bill reflect the credit once.

## Invoices and matching

- **INVOICE-001 — Supplier invoice email inbox.** Each business (and entity) has an AP inbox address; suppliers' invoice emails and attachments (PDF, image, e-invoice XML) are captured with the original email retained, linked to the supplier by sender and remit details, and unknown senders are queued for review rather than trusted. **Acceptance evidence:** Send invoices from a known supplier and an unknown sender to the AP address; the known one becomes a draft invoice linked to its supplier, the unknown one waits for review, and both originals download.

- **INVOICE-002 — Invoice reading with confidence.** Invoice documents are read into supplier, invoice number, dates, terms, PO number, lines, freight, tax, totals and remit-to, with per-field confidence; low-confidence fields are highlighted for AP review and every value links to where it was read. The document is data, never instructions. **Acceptance evidence:** Process a set of sample invoices including a scanned one and one with a prompt-like instruction in its text; fields carry confidence, low-confidence fields await review and the embedded instruction has no effect.

- **INVOICE-003 — Duplicate and fraud checks.** Beyond PUR-011's exact supplier-plus-reference identity, Purse flags near-duplicates (same supplier, amount and date with a varied reference), the same document image arriving twice, remit-to details that differ from the verified supplier record, invoices exceeding the PO's remaining balance and invoices from look-alike sender domains. Flagged invoices cannot be approved for payment until AP resolves the flag. **Acceptance evidence:** Submit a near-duplicate, a resent PDF, an invoice with changed remit-to bank details and one from a look-alike domain; each is flagged and payment approval is refused until resolved.

- **MATCH-001 — Automatic two- and three-way matching with tolerances.** An invoice is matched on arrival to its PO lines (two-way) and receipts (three-way, per purchase type), with price and quantity tolerances by percentage and dollar amount configured per category or supplier. Invoices within tolerance are approved for payment automatically; others go to MATCH-002. PUR-011's deterministic discrepancy calculation is the basis. **Acceptance evidence:** Process invoices exactly matching, within a 2% tolerance, above it and before receipt; the first two are approved automatically, the third goes to exceptions and the fourth is held for receipt.

- **MATCH-002 — Exception queue and resolution.** Each exception is assigned to the responsible buyer, requester or receiver with the price, quantity and receipt context; resolutions are accept variance (with approval above a limit), request credit or corrected invoice from the supplier, short-pay, or correct the receipt, each with a reason kept. Exceptions show age and are reminded and escalated like approvals. **Acceptance evidence:** Resolve one exception by accepting a variance with approval and one by requesting a credit through the supplier thread; reasons, approvals and the final matched state are on the invoice.

- **INVOICE-004 — Non-PO invoices and invoice approval.** Invoices without a PO (utilities, professional services) are coded to GL account, department, class and project and routed through invoice approval thresholds and escalation, with recurring non-PO suppliers suggested a blanket PO. **Acceptance evidence:** Process a non-PO invoice above the threshold; it routes to the configured approver, escalates after inaction and syncs as a bill once approved.

## Payables and payment handoff

- **AP-001 — BILL handoff.** Approved bills (matched or approved non-PO) are sent to BILL with supplier, remit-to, invoice, due date and attachment, and payment status (scheduled, sent, cleared, failed, voided) returns onto the invoice, PO and supplier. A bill is sent once; a failed payment returns to AP with the reason. Purse never holds funds. **Acceptance evidence:** In BILL's sandbox, hand off two approved bills, pay one and fail one; statuses return, the failure reaches AP and re-sending the paid bill is refused.

- **AP-002 — Ledger and ACH payment handoff.** For buyers who pay from their accounting system, approved bills sync as payable bills (SYNC-001 to SYNC-004) and the ledger's payment status flows back; owner-run deployments can instead use an ACH payment provider such as Dwolla, paying only verified bank details (SUPPLIER-002) and recording NACHA return codes on failure. **Acceptance evidence:** Pay a synced bill in the QuickBooks Online sandbox and see Paid on the invoice; send an ACH payment through the provider sandbox, receive an R01 return and see it on the invoice and supplier.

- **AP-003 — Terms, due dates and cash requirements.** Payment terms (Net 15/30/60, 2/10 Net 30, due on receipt) set due and discount dates; AP sees bills due by week with discounts expiring, and finance sees a cash-requirements view of approved bills plus open commitments by expected invoice date. **Acceptance evidence:** Approve bills on different terms; the due-date list orders them correctly, a 2/10 discount shows its deadline, and the cash view totals approved bills and expected commitments by week.

## Accounting sync

- **SYNC-001 — QuickBooks Online.** OAuth connection pulls vendors, chart of accounts, classes, locations, items, customers/projects and terms; Purse pushes new and changed vendors, POs (as QuickBooks purchase orders), approved bills linked to their POs, and credit memos (vendor credits); bill payment status pulls back. Every pushed record stores its QuickBooks ID and a request idempotency key, so retries and re-syncs never create a second bill. **Acceptance evidence:** In a QuickBooks Online sandbox company, connect, import lists, sync a vendor, PO and bill, retry the bill push after a simulated timeout and see exactly one bill; pay it in QuickBooks and see the status return.

- **SYNC-002 — Xero.** The same scope with Xero contacts, accounts, tracking categories, purchase orders, bills (accounts-payable invoices), credit notes and payments, with Xero IDs stored for idempotency. **Acceptance evidence:** In a Xero demo company, connect, sync a contact, PO and bill twice and see one bill, then mark it paid in Xero and see the status in Purse.

- **SYNC-003 — NetSuite.** Token-based authentication to SuiteTalk REST syncs vendors, subsidiaries, departments, classes, locations, items, purchase orders, item receipts, vendor bills, vendor credits and vendor payment status, with external IDs for idempotency and subsidiary mapping per ACCESS-003 entity. **Acceptance evidence:** In a NetSuite sandbox, sync a PO with a receipt and bill for one subsidiary, retry the bill push and see one vendor bill, then pay it and see the status.

- **SYNC-004 — Pantry.** [Pantry](https://github.com/just-every/run-pantry) connects natively: vendors, POs, approved bills, credits and 1099 boxes post to Pantry's payables with source links back to Purse, and Pantry's payment and reconciliation status returns. Neither product posts a record the other already holds. **Acceptance evidence:** Connect a local Pantry installation, sync a bill, re-sync, and pay it in Pantry; one payable exists and Purse shows it paid with a link to the Pantry record.

- **SYNC-005 — Sync status, errors and tie-out.** Every synced record shows its sync state, external ID and last attempt; failures (closed periods, deleted accounts, inactive vendors) land in an error queue with a plain reason and a retry; scheduled refreshes pull list changes; and a tie-out report compares Purse's approved bills, credits and payments with the ledger for a period. Sage Intacct and Microsoft Dynamics 365 Business Central connect through [Crank](https://github.com/just-every/run-crank) or the same adapter interface. **Acceptance evidence:** Push a bill into a closed sandbox period; it appears in the error queue with the reason, succeeds after reopening and retry, and the period tie-out shows zero differences.

## Reporting, contracts and notifications

- **REPORT-001 — Spend and committed-budget dashboards.** Dashboards show spend and commitments by department, project, location, supplier, category and GL account over any period, with budget versus reserved, committed and actual, filters, and drill-through from any figure to the requests, POs and invoices behind it. Currencies stay separate unless the owner sets reporting rates. **Acceptance evidence:** With a populated workspace, open the dashboard at 1440 and 390 pixels, filter by department and project, and drill from a supplier's committed figure to the exact POs that sum to it.

- **REPORT-002 — Saved, scheduled and exported reports.** Users save report views, schedule them by email (weekly, monthly) to members, and export CSV and XLSX; a read-only reporting connection serves Google Sheets, Excel and Power BI. **Acceptance evidence:** Save a view, schedule it, advance the clock and receive the email with an attachment matching the view; open the same data through the reporting connection.

- **REPORT-003 — Procurement performance measures.** Purse reports request-to-PO and approval cycle times, spend under PO (PO coverage), off-contract and unapproved spend found in synced bills, on-time delivery, invoice exception rate and savings, separating negotiated savings from realised savings (AGENT-005). **Acceptance evidence:** With a populated workspace, each measure computes from records that drill through, and an invoice without a PO counts as spend outside PO coverage.

- **CONTRACT-001 — Agreements, renewals and contract spend.** Supplier agreements carry value, term, auto-renewal, notice period and owner; owners are emailed before the notice deadline at configured intervals with spend to date against the agreement value; agreements link to [Locket](https://github.com/just-every/run-locket) or another CLM for drafting and negotiation, and to [Inkwell](https://github.com/just-every/run-inkwell) or Docusign for signature status. **Acceptance evidence:** Record an auto-renewing agreement with a 60-day notice period, advance the clock and receive reminders before the deadline showing spend to date; a linked Locket record shows on the agreement.

- **NOTIFY-001 — Notifications and preferences.** Every event a person must act on or wants to follow (approval needed, returned, approved, PO acknowledged, chase sent, delivered, receipt needed, exception assigned, bill paid, document expiring) reaches them by email, Slack, Teams or push per their preferences, with a daily digest option, US quiet hours and an in-app notification list. Every send is recorded with its outcome. **Acceptance evidence:** Set one member to Slack and digest and another to email; trigger each event and see the right channel, the digest batch and recorded outcomes, including a bounced email.

## Platform, migration and governance

- **API-001 — Public API, webhooks and automation.** A documented, versioned REST API (OpenAPI) with scoped API keys exposes requests, POs, receipts, invoices, suppliers and budgets with the same validation and authority as the console; signed webhooks announce events with stable IDs and replay; Zapier, Make and [Crank](https://github.com/just-every/run-crank) use these. The current session-bound local agent API (API.md) remains. **Acceptance evidence:** Create a scoped key, create a request and read its PO through the API, receive and verify a signed webhook, replay it and see the receiver de-duplicate; a key without the scope is refused.

- **IMPORT-001 — Procurify migration.** Purse moves a Procurify customer in from a real Procurify export: users, departments, locations, GL accounts, vendors, catalogue items, approval routing (mapped to APPROVAL-001 chains for review), budgets, open and historical POs with receipts, bills and attachments. Open POs arrive as inert history with a reviewed path to re-issue under native authority, and counts reconcile before switching. PUR-013's review, resume and undo apply. **Acceptance evidence:** Import an anonymised real Procurify export, review mappings and counts, commit, reconcile totals per supplier and period against the export, and undo an untouched batch.

- **IMPORT-002 — Coupa, Precoro and spreadsheet migration.** The same reviewed path imports Coupa and Precoro exports and a documented spreadsheet template for businesses moving from email and spreadsheets, and vendor lists pull from the connected ledger (SYNC-001 to SYNC-004) with SUPPLIER-003's duplicate check. **Acceptance evidence:** Import a Precoro export, a Coupa export and the spreadsheet template, each previewed without writes, then pull vendors from a sandbox ledger and see duplicates flagged.

- **AUDIT-001 — Audit log and approval evidence.** Every decision, amendment, grant, send, sync and payment-status change is in an audit log with actor, time, action and subject, filterable and exportable for auditors (including SOX-style evidence that each PO was approved under the policy in force), surviving erasure of the actor with anonymised references. **Acceptance evidence:** Perform approvals, amendments and sends, filter the log for one PO and export it; erase a member and see their entries anonymised but retained.

- **SECURITY-001 — Protected tax and bank data.** TINs, bank account and routing numbers and connector secrets are encrypted at rest with installation-local keys, masked in the interface except to roles granted them, never included in logs, exports or agent context, and excluded from archives unless the owner explicitly includes them. **Acceptance evidence:** Store a W-9 TIN and bank details, view them as AP and as a requester, export an archive and search logs; only the granted role sees the full values and the archive and logs contain none.

- **ERASURE-001 — Personal data erasure with financial retention.** An owner can erase a departed member's or supplier contact's personal data with a receipt of what was removed, while purchasing and tax records the business must keep (US practice is seven years for payable records) are retained with the person anonymised. **Acceptance evidence:** Erase a former requester and a supplier contact; the receipt lists removed fields, their POs and invoices remain with anonymised references, and a later archive restore does not bring the data back.

## Push further: agents in the purchasing job

Agents do the follow-through that buyers of Zip and Levelpath expect agents to do, and go further by checking whether each purchase delivered what it promised. Every agent works on the business's own records in Purse and connected systems, acts through AGENT-010's governed actions and never approves its own work, commits spend, accepts terms, changes bank details or sends outside the message types a person pre-authorised.

- **AGENT-001 — Requirements intake agent.** In the web form, Slack, Teams or email, an employee describes a need in plain words ("laptops for three new engineers starting 3 November"); the agent asks for what is missing, proposes catalogue, PunchOut or preferred-supplier items, coding, need date and attachments from past purchases and policy, and shows the predicted approval route. The requester reviews and submits; the agent cannot submit or approve. Builds on PUR-014's intake preparation. **Acceptance evidence:** Describe a need in Slack; the agent asks for the missing quantity, proposes catalogue items and coding with sources, and creates a draft only, which the requester edits and submits.

- **AGENT-002 — Quote collection and normalisation agent.** For an RFQ the buyer has approved, the agent sends invitations from the approved template, answers supplier clarification questions from the request's specification (escalating anything else to the buyer), reads replies and quote PDFs, normalises units, freight, tax, lead time, validity and terms into PUR-005's comparison, flags missing or non-conforming items and recommends an award with reasons. The buyer approves the invitation and decides the award. **Acceptance evidence:** Run an RFQ with three test supplier inboxes replying in different formats; the comparison is normalised with sources, a non-conforming quote is flagged, and no award is recorded until the buyer decides.

- **AGENT-003 — Late-order resolution agent.** Within the message types and cadence the buyer pre-authorised, the agent asks suppliers to acknowledge, confirms promised dates, reads replies into the PO, tells the requester, and when a delay threatens the need date proposes alternatives (another supplier, a PunchOut item, a split shipment) with price and date. Substitutions, price changes, cancellations and any binding commitment go to the buyer for approval as PUR-009 amendments. **Acceptance evidence:** Simulate a supplier replying with a three-week delay; the agent updates the PO, informs the requester and proposes an alternative, and nothing changes the order until the buyer approves.

- **AGENT-004 — Invoice exception agent.** For each MATCH-002 exception the agent gathers the evidence (prompts the receiver, reads the PO revision and receipts, asks the supplier for a credit memo or corrected invoice within pre-authorised message types), explains the mismatch in plain words, proposes a resolution, and follows it until the corrected bill posts once in the ledger and payment status settles. Receivers confirm goods, AP approves variances and payments, and bank-detail changes go through SUPPLIER-002. **Acceptance evidence:** Create a price mismatch; the agent requests a corrected invoice, reads it on arrival, re-matches, and the bill syncs once and is marked paid in a sandbox ledger, with every agent step in the audit.

- **AGENT-005 — Value realisation tracking.** A request records its promised outcome (a need met by a date, a seat count used, a quoted saving). The agent collects evidence after delivery (receipts and milestones, software seat usage from the identity provider or [Auth](https://github.com/just-every/run-auth) sign-in records, supplier issues, a requester check-in at 30 and 90 days) and reports realised value against the promise, never counting an unsigned or unrealised discount as savings. Requesters confirm usefulness; the agent cannot invent evidence. **Acceptance evidence:** Approve a 50-seat software purchase promising full use; import seat-usage evidence showing 31 active seats, and see the agent's report state the shortfall with its sources and the requester's confirmation request.

- **AGENT-006 — Recurring-spend consolidation, renegotiation and cancellation proposals.** From supplier families, agreements and notice dates, price history, usage (AGENT-005) and service outcomes (SUPPLIER-005), the agent proposes which recurring spend to consolidate, renegotiate or cancel, each as a reproducible scenario showing the cash effect on commitments and forecast spend, operational risk and the notice deadline. Finance and affected owners approve; the agent then drafts the negotiation brief or cancellation notice for a person to send. **Acceptance evidence:** With overlapping subscriptions and an approaching notice date, the agent proposes consolidation with a scenario whose figures recompute from the cited records; nothing is sent or cancelled until an owner approves and sends.

- **AGENT-007 — Supplier onboarding and compliance agent.** The agent chases incomplete SUPPLIER-001 onboarding and expiring documents, checks W-9 TIN and name through an IRS TIN Matching partner, runs SUPPLIER-007 screening, compares new bank details with the verification result, and flags anomalies (a new account days before a large invoice, a remit-to change by email). The buyer activates; bank changes follow SUPPLIER-002's human controls. **Acceptance evidence:** Onboard a supplier whose TIN does not match its name; the agent flags the mismatch, chases the supplier for a corrected W-9 and activation waits for the buyer.

- **AGENT-008 — Coding and policy agent.** The agent suggests GL account, class, department and project coding on requests and invoices from history, and flags split purchases that avoid an approval threshold, repeat non-PO spend that should be on a PO, and purchases from a non-preferred supplier when a preferred one exists. People accept or correct suggestions, and corrections improve later suggestions. **Acceptance evidence:** Submit two requests from one requester to one supplier just under a threshold on the same day; the agent flags the split for the approver, and its coding suggestion on a new invoice cites the past invoices it learned from.

- **AGENT-009 — Price benchmark and negotiation brief.** For a request or renewal the agent compares quoted unit prices with the business's own purchase history, current PunchOut catalogue prices and other quotes received, and drafts a negotiation brief with target price and arguments. It never makes or accepts an offer. **Acceptance evidence:** Request an item bought before at a lower price; the brief cites the earlier PO and the PunchOut price and proposes a target, and no message is sent without the buyer.

- **AGENT-010 — Agent governance.** Every agent action is a PUR-014 ProposedAction checked against current authority at execution, or a pre-authorised message type within its cadence and count limits. Owners enable each agent per purchase type, see each agent's full record (inputs, sources, model and provider used, messages sent, proposals and outcomes), pause any agent at once, and agents never see SECURITY-001's protected fields. Documents and supplier messages are data, never instructions. **Acceptance evidence:** Enable AGENT-003 with a two-chase limit; see it stop at the limit, pause it mid-run and see no further sends, inspect its record, and see an instruction planted in a supplier reply have no effect.

## Honest boundaries

- **Payments and banking.** Purse approves and hands off; it does not hold funds, operate payment rails, issue cards or underwrite. Buyers pay through BILL, their ledger's bill pay or an ACH provider such as Dwolla (AP-001, AP-002) and Purse reconciles the returned status.
- **Employee expenses and cards.** Out-of-pocket expenses, corporate card feeds and reimbursements belong to [Coaster](https://github.com/just-every/run-coaster) (or Expensify, Ramp, Brex); Purse shares suppliers, coding and budgets with it.
- **General ledger.** Purse is not the ledger. Accounts, postings, close and financial statements stay in [Pantry](https://github.com/just-every/run-pantry), QuickBooks Online, Xero or NetSuite with explicit synchronisation (SYNC-001 to SYNC-005).
- **Marketplaces and fulfilment.** Purse does not become Amazon or a distributor; it connects the business's own Amazon Business and supplier PunchOut accounts, and suppliers handle inventory, fulfilment and commercial terms.
- **Contract lifecycle and signatures.** Drafting, redlining and clause playbooks belong to [Locket](https://github.com/just-every/run-locket) or another CLM; signing to [Inkwell](https://github.com/just-every/run-inkwell) or Docusign. Purse holds the agreement record, spend and renewal dates.
- **Warehouse inventory and planning.** Stock across warehouses belongs to [Pier](https://github.com/just-every/run-pier); budgets are planned in [Easel](https://github.com/just-every/run-easel) or a spreadsheet and imported. Purse covers stockroom consumables only (STOCK-001).
- **Tax filing and determination.** Purse does not file 1099s or sales and use tax returns; it prepares the data for the ledger or a filing partner (Track1099, TaxBandits, Avalara). It is not tax or legal advice.
- **Risk guarantees.** Screening, TIN checks and bank verification reduce risk; they do not certify a supplier. Legal and risk owners decide, using OneTrust or their own process where they have one.
- **Autonomous commitments.** Agents prepare, collect, chase and propose; they never negotiate binding terms, accept offers, commit spend or change bank details on their own.
- **US first.** Currencies other than USD stay separate and are supported for foreign suppliers, but VAT, GST, e-invoicing mandates outside the US and non-US tax forms are not in this edition.
- **Owner inputs still required.** An anonymised real purchasing case, an actual Procurify export and a current-process cost and attention baseline come from the owner; acceptance that depends on them stays open until supplied. Existing installations keep applied migrations and use the forward upgrade in `UPGRADING.md`.

## Backup and upgrade

A pre-upgrade export restores only with the Purse release that made it. Restore it
into an empty installation of that release, upgrade that installation’s source
in place, run `rer install` and `rer setup`, then export again. Keep the original release
and private export until recovery is verified. Never import an older release’s
archive directly into the current release.

## Status

Judged at commit `9f201c00eba7aecadf9239e1205f6933a0dd1cb6`. The supplied code audit was taken at `dc2ae705c3cdd9c82a2345ca35db6f6c99a60d58`; no file under `src/purse`, `src/ui` or `tests/purse.test.mjs` has changed since, and the one-line `tests/browser-journey.mjs` change (sign-in link hint) leaves every status unchanged. `P01`–`P17` name tests in `tests/purse.test.mjs`.

| Clause | Status | Evidence |
|---|---|---|
| PUR-001 | done | `src/purse/admin.ts`; `src/purse/types.ts`; `tests/purse.test.mjs` P01 |
| PUR-002 | done | `src/purse/admin.ts`; `tests/purse.test.mjs` P02 |
| PUR-003 | done | `src/purse/admin.ts`; `tests/purse.test.mjs` P03 |
| PUR-004 | done | `src/purse/requests.ts`; `tests/purse.test.mjs` P04 |
| PUR-005 | done | `src/purse/requests.ts`; `tests/purse.test.mjs` P05 |
| PUR-006 | done | `src/purse/requests.ts`; `src/purse/approval.ts`; `tests/purse.test.mjs` P06 |
| PUR-007 | done | `src/purse/admin.ts`; `src/purse/requests.ts`; `tests/purse.test.mjs` P07 |
| PUR-008 | done | `src/purse/orders.ts`; `tests/purse.test.mjs` P08 |
| PUR-009 | done | `src/purse/orders.ts`; `src/purse/requests.ts`; `tests/purse.test.mjs` P09 |
| PUR-010 | done | `src/purse/receiving.ts`; `tests/purse.test.mjs` P10 |
| PUR-011 | done | `src/purse/invoices.ts`; `src/purse/orders.ts`; `src/purse/documents.ts`; `tests/purse.test.mjs` P11 |
| PUR-012 | done | `src/ui/overview.tsx`; `tests/browser-archive.mjs` |
| PUR-013 | done | `src/purse/imports.ts`; `src/purse/import-mapping.ts`; `src/purse/import-custody.ts`; `tests/purse.test.mjs` P13 |
| PUR-014 | done | `src/purse/agents.ts`; `src/purse/api.ts`; `tests/purse.test.mjs` P14 |
| PUR-015 | done | `package.json`; `tests/runtime.mjs`; `tests/browser.mjs`; `tests/run-site.mjs` |
| PUR-016 | done | `src/purse/money.ts`; `tests/purse.test.mjs` P16 and currency-text test |
| PUR-017 | done | `src/purse/store.ts`; `src/purse/documents.ts`; `tests/purse.test.mjs` P17 |
| ACCESS-001 | partial | `src/purse/types.ts` (owner, requester, approver, buyer, receiver); `src/purse/documents.ts` (requester scoping); `tests/purse.test.mjs` P01, P17. AP, finance viewer, auditor, department scoping and custom roles absent |
| ACCESS-002 | missing | — |
| ACCESS-003 | missing | — |
| INTAKE-001 | partial | `src/ui/request-form.tsx`; `src/purse/requests.ts`; `tests/purse.test.mjs` P04. Configurable per-category forms and route preview absent |
| INTAKE-002 | missing | — |
| INTAKE-003 | missing | — |
| INTAKE-004 | missing | — |
| INTAKE-005 | missing | — |
| MOBILE-001 | done | `src/ui/requests.tsx`; `src/ui/orders.tsx`; `tests/browser-journey.mjs`; `tests/browser.mjs` (390 px) |
| MOBILE-002 | missing | — |
| SUPPLIER-001 | missing | — |
| SUPPLIER-002 | missing | — |
| SUPPLIER-003 | missing | — |
| SUPPLIER-004 | partial | `src/ui/overview.tsx` (renewal dates listed); `src/purse/admin.ts`. Expiry dates, reminders and refresh requests absent |
| SUPPLIER-005 | partial | `src/purse/admin.ts` (status/reason history); `src/purse/types.ts` (audit). Performance measures and issue records absent |
| SUPPLIER-006 | missing | — |
| SUPPLIER-007 | missing | — |
| SOURCE-001 | partial | `src/purse/requests.ts` (quote recording); `src/purse/agents.ts` (RFQ preparation); `tests/purse.test.mjs` P05, P14. Supplier invitations and responses absent |
| SOURCE-002 | partial | `src/purse/requests.ts` (quotes with evidence files); `tests/purse.test.mjs` P05. Document reading absent |
| PUNCHOUT-001 | missing | — |
| PUNCHOUT-002 | missing | — |
| STOCK-001 | missing | — |
| APPROVAL-001 | partial | `src/purse/requests.ts`; `src/purse/approval.ts`; `tests/purse.test.mjs` P06. One designated approver per policy; multi-step chains absent |
| APPROVAL-002 | missing | — (delegation is PUR-007) |
| APPROVAL-003 | partial | `src/ui/requests.tsx`; `tests/browser-journey.mjs` (web and phone width). Email, Slack, Teams and native approval absent |
| BUDGET-001 | partial | `src/purse/requests.ts` (reservations, limits); `src/purse/documents.ts`; `tests/purse.test.mjs` P06, P16. Period budgets and reserved/committed/actual/available views absent |
| BUDGET-002 | missing | — |
| PO-001 | partial | `src/purse/orders.ts` (numbered PO, issuance); `src/purse/documents.ts` (PO document); `tests/purse.test.mjs` P08, P09. Sending and acknowledgement absent |
| PO-002 | missing | — |
| PO-003 | partial | `src/ui/overview.tsx` (overdue issued orders listed). Chasing absent |
| PO-004 | partial | `src/purse/orders.ts`; `src/purse/requests.ts`; `tests/purse.test.mjs` P09 (internal amendments). Sending and re-acknowledgement absent |
| PO-005 | partial | `src/purse/receiving.ts` (service milestones); `tests/purse.test.mjs` P10. Blanket and recurring POs absent |
| PO-006 | missing | — |
| PO-007 | partial | `src/purse/requests.ts` (tax amounts on requests and quotes); `tests/purse.test.mjs` P05. Exemption certificates and use-tax flags absent |
| PO-008 | partial | `src/purse/orders.ts` (human conversion of approved lines); `tests/purse.test.mjs` P08. Automatic creation and sending absent |
| RECEIVE-001 | missing | — |
| RECEIVE-002 | partial | `src/purse/receiving.ts` (returns adjust commitments); `tests/purse.test.mjs` P10. RMAs, credit memos and balances absent |
| INVOICE-001 | missing | — |
| INVOICE-002 | missing | — |
| INVOICE-003 | partial | `src/purse/invoices.ts` (exact supplier/reference identity); `tests/purse.test.mjs` P11. Near-duplicate and fraud checks absent |
| MATCH-001 | partial | `src/purse/orders.ts` (discrepancies); `tests/purse.test.mjs` P11. Automatic matching on arrival and tolerances absent |
| MATCH-002 | partial | `src/purse/orders.ts`; `src/purse/documents.ts` (discrepancy list); `tests/purse.test.mjs` P11. Assignment and resolution workflow absent |
| INVOICE-004 | missing | — |
| AP-001 | missing | — |
| AP-002 | missing | — |
| AP-003 | missing | — |
| SYNC-001 | missing | — (CSV export is PUR-011) |
| SYNC-002 | missing | — |
| SYNC-003 | missing | — |
| SYNC-004 | missing | — |
| SYNC-005 | missing | — |
| REPORT-001 | partial | `src/ui/overview.tsx` (currency totals, coded records); `src/purse/documents.ts`. Department/project/supplier dashboards and drill-through absent |
| REPORT-002 | partial | `src/purse/documents.ts` (accounting CSV); `tests/purse.test.mjs` P11. Saved, scheduled and XLSX reports absent |
| REPORT-003 | missing | — |
| CONTRACT-001 | partial | `src/purse/admin.ts` (agreement references, renewal date); `src/ui/overview.tsx`; `tests/purse.test.mjs` P02. Notice reminders and contract spend absent |
| NOTIFY-001 | missing | — |
| API-001 | partial | `src/purse/api.ts`; `API.md`; `tests/purse.test.mjs` P17 (session-bound local API). API keys, OpenAPI and webhooks absent |
| IMPORT-001 | partial | `src/purse/imports.ts`; `public/fixtures/procurify-shape.csv`; `tests/purse.test.mjs` P13. Real Procurify export adapter absent |
| IMPORT-002 | missing | — |
| AUDIT-001 | partial | `src/purse/types.ts` (audit events); `src/purse/requests.ts` (decision history); `tests/purse.test.mjs` P07, P09. Log viewer, export and anonymisation absent |
| SECURITY-001 | missing | — |
| ERASURE-001 | missing | — |
| AGENT-001 | partial | `src/purse/agents.ts` (intake preparation with missing fields); `tests/purse.test.mjs` P14. No agent execution |
| AGENT-002 | partial | `src/purse/agents.ts` (RFQ preparation); `src/purse/requests.ts` (comparison); `tests/purse.test.mjs` P05, P14. No agent execution |
| AGENT-003 | missing | — |
| AGENT-004 | partial | `src/purse/agents.ts` (exception preparation); `tests/purse.test.mjs` P14. No agent execution |
| AGENT-005 | missing | — |
| AGENT-006 | partial | `src/purse/agents.ts` (renewal keep/change/cancel preparation); `tests/purse.test.mjs` P14. No analysis or scenarios |
| AGENT-007 | missing | — |
| AGENT-008 | missing | — |
| AGENT-009 | partial | `src/purse/agents.ts` (negotiation preparation); `tests/purse.test.mjs` P14. No benchmark or agent execution |
| AGENT-010 | partial | `src/purse/agents.ts`; `src/purse/api.ts` (ProposedAction authority recheck); `tests/purse.test.mjs` P14. Per-agent enablement, limits, pause and record absent |
