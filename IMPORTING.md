# Moving purchasing history into Purse

This first kit accepts the documented CSV shape in `public/fixtures/procurify-shape.csv`. It is fixture-qualified, not a tested Procurify export adapter: the owner has not supplied an actual export. Preserve the original vendor archive outside Purse as well.

Before moving a department:

1. Select the intended full period. Procurify's documented exporter defaults to the last 30 days; verify dates, all locations and all people rather than accepting that default.
2. Export known suppliers and codes first, followed by requests, purchase orders and receipts. Obtain quotation, agreement, invoice and attachment files separately. This CSV mapping does not invent missing attachments or approval history.
3. Configure field-to-column mappings, `.` or `,` decimal convention, `YYYY-MM-DD` or `DD/MM/YYYY` date convention, and each original status's meaning. The browser accepts a file and field/header mappings. The authenticated API accepts the same exact CSV text and mapping object.
4. Review counts, duplicates, currencies, unresolved references, every status mapping and missing attachments. Preview performs no writes. Enable source currencies in Settings; unlike currencies never merge.
5. Commit the reviewed fingerprint. Changed bytes (including a final newline), mapping, actor or permission require a new review. A batch is bound to the actor's current native session. Resume retains its source and mapping and makes no external calls.
6. Reconcile IDs, dates, decimal values, links and source statuses against the retained bytes and custody report (TIN/bank cells use the SUPPLIER-003 redaction exception below). Imported approvals, orders and receipts are inert historical records, never purchasing authority. Raise a native request for a new commitment.
7. Undo untouched imports in reverse order. A native edit or a downstream record referring to an imported target prevents removal; the conflict is visible and preserves the target and decisions. Undo never issues a cancellation. Retained original bytes (redacted under SUPPLIER-003 where applicable) and import history remain after undo.
8. Export a complete `.rer` archive and restore into an empty installation. Compare request, decision, order, receipt, attachment and import history counts before switching.

The original documented shape keeps one line per historical request or order record. The multi-line extension below preserves that path. Source keys and reference fields are exact strings, including leading and trailing whitespace, scoped by source kind under `procurify`; duplicate records must agree. CSV quoting is strict: a closing quote must be followed by a delimiter, row end or end of file; malformed quotes are refused before a plan is created. A changed record under the same source key is a conflict, not a silent overwrite. Dates and original statuses remain in original custody and mapping decisions. `code` records retain their source identity and code type; owners review them before configuring native business codes. Attachments are reported missing and must be uploaded against the appropriate native record. No supplier messages, native approvals, invoice posting or payments occur on import.

The complete owner-export checklist, supplier acceptance, actual Procurify export normalization and operating-cost comparison remain pilot evidence obligations. Precoro, Coupa, ERPNext and Odoo kits are later work.

After restore, native accounts and sessions are new. In Imports, choose **Take
custody of restored batch** for each batch you need to continue. Only a current
native owner can do this, and only for a job proven to belong to a completed
archive restore in this installation. The first claimant owns that continuation;
other owners cannot read its originals, resume it or undo it. Ordinary jobs in
the same installation remain bound to their importing owner and cannot be
claimed. The original principal, source bytes, mapping and job fingerprint stay
unchanged. An audit event records the original principal, new owner and completed
restore. The local custody grant is excluded from subsequent archives; a new
installation requires its own explicit claim.

A restored historical decision does not give a newly created account the old
operator's authority. Prepared POs with old approval identities must be amended,
submitted and approved under current policy and current native identities before
issuance. The owner can edit/amend restored requests and invite the appropriate
approver; issued documents and earlier decisions remain historical evidence.

Restore validates purchasing references, revision/PO terms, receipt and invoice
allocations, monetary arithmetic and attachment bytes in staging before Base's
atomic apply. A checksum-consistent archive with broken domain links is refused
without changing any destination business/import records. This complements the
archive checksum and SQL constraints; it does not prove that a supplied archive
is truthful or make a historical approval into a current native grant.

## SUPPLIER-003 matching and sensitive-source custody

Supplier rows in the current CSV kit accept `dba`, `email`, `contactName`, `address` and `phone`. Preview shows possible duplicates against the register and other rows in this batch; reviewed commit retains those source identities for a buyer to merge. A merge never rewrites an approved supplier snapshot, PO or invoice link. Source drafts must be amended to the surviving supplier and approved again.

TIN and bank columns are accepted for matching only. Common TIN/tax-ID/EIN/SSN and bank routing/account header spellings are recognized; `mapping.columns.tin`, `bankRouting` and `bankAccount` name nonstandard headers. A routing/account pair is required together. Values become keyed HMAC-SHA-256 fingerprints using the installation's private portable matching key. The full structured values are never stored. An older workspace without a matching key can initialize it explicitly from Imports or with `supplier-matching-setup`; preview itself remains no-write.

This is the one named exception to PUR-013 exact-source custody: sensitive cell spans in the stored original are replaced with `[REDACTED]`, preserving all other bytes, including quotes, CRLF and multiline fields. File digests remain in owner-bound import custody, outside ordinary supplier state. A retained `.custody.json` artifact records original SHA-256, retained SHA-256 and redacted column names. The original digest binds a review even when two differently formatted sensitive inputs redact to the same bytes. Source payloads, journal and effects retain no full TIN/account values. These inputs do not verify a bank account, validate a TIN or certify a supplier. Full sensitive storage belongs to SECURITY-001 and future SUPPLIER-001/002 and IMPORT-001/002 doors.

## Erasure and later backups

Owner-reviewed personal-data erasure withdraws opaque source originals on the
affected lineage and scrubs personal fields in retained purchasing, audit,
RFQ, email and import copies. The receipt names removed fields and retained
financial history. Import replay receipts survive without authorizing another
capture. Original links report that the source was erased; they never serve
replacement bytes as an original. An unfinished file deletion blocks export.

Keep the newest completed `.rer` archive as the erasure journal. When restoring
an older backup into a fresh installation, supply that archive with
`rer import --input older.rer --journal newest.rer --yes`: Base refuses an older
redaction epoch before applying business records. A fresh offline installation
cannot discover a later erasure without its journal, so a restore with no
journal is held until the current native owner acknowledges, in Settings of the
empty installation and with fresh native reauthentication, the sentence
“erasure history unverified: supply your latest archive as the journal”. The
restore then succeeds and Settings shows that label, the archive time, the
acknowledgment and that no journal was supplied. A restore that supplies the
journal needs no acknowledgment. Existing exports and
external provider copies are outside the installation's deletion scope and
remain under the owner's custody. Post-erasure archives retain anonymized
financial chronology and the sealed field journal; they reject restored erased
values or source objects. A protected include must match the same erasure
checkpoint, preventing older encrypted metadata from restoring identity.

Owners set a retention period in whole years (default 7, minimum 1; below 7
shows an IRS Pub. 583 warning to acknowledge) in Settings. It counts from each
supplier's latest supported payable, the newest invoice date entered against one
of its orders. Settings then lists expired TIN and bank values and W-9 originals
under Ready to erase. Nothing is removed until the owner confirms the selected
values with consent and fresh native reauthentication. Invoices, totals,
evidence hashes and attestations stay, and an invoice whose bank binding lost
its source value says so. A supplier with no payable has no clock yet. This
states a retention default, not legal advice.

## Reviewed open-PO adoption (IMPORT-003 native door)

The documented fixture CSV also accepts `invoice` and `deposit` rows. This is a
synthetic-format qualification, not a claim of a real incumbent export adapter.
Source IDs remain exact strings under the existing source namespace. A `budget`
row retains its `sourceId`, `name`, `currency`, `amount` and optional `location`,
`costCentre` and `project`. It stays inert until the adopting owner reviews its
exact source mapping to a current native policy budget. The first adoption
transfers the source budget amount once, preserving native approver/limits;
repeated adoptions reuse the same mapping and cannot duplicate budget capacity.

- An invoice references `orderId`, uses `number` for its original supplier invoice
  reference, `currency`, `quantity`, `unitPrice` and optional `amount` (currency
  text, default quantity × price). `date` is the actual source invoice date;
  blank stays not recorded. Optional `email` and postal `remitTo` retain supplied
  provenance without claiming sender authentication or bank verification.
  `approvalEvidence` retains historical approval evidence. Optional `paidDate`
  requires `paymentEvidence`; this is historical payment evidence, never a payment
  made by Purse. `documentName`, `documentMediaType` and `documentBase64` retain
  the exact original, within the existing 1 MB CSV and 1 MB document limits.
- A deposit references `orderId`, `number`, `currency`, `amount`, `appliedAmount`
  (zero when absent), and required `paymentEvidence`. These are imported prepaid
  balances. Purse neither posts nor pays them. Applied value cannot exceed the
  deposit and deposits together cannot exceed the PO face.
- Request/order rows may retain source `location`, `costCentre`, `budget` and
  `approvalEvidence`. An owner explicitly maps configured coding and an existing
  budget during adoption. Imported source budgets must map exactly; this native
  CSV source door does not implement BUDGET-002 ownership, alerts or provider pulls.

In Orders, open an imported PO, screen/review its supplier and choose **Adopt this
imported open PO**. Select its budget, configured location/department and a current
scoped receiver. Review ordered, received, billed, deposit and remaining commitment
figures, then confirm with a reason. A changed source or mapping needs another
review. Adoption retains the original number and source request, freezes the
supplier snapshot and creates an operational request with no native approval.
It sends no supplier mail and never records a native issuance timestamp.

For ten ordered, four received and two billed, adoption commits six units of
remaining receiving value; receiving three more leaves three. Bills still consume
the same purchase across subsequent approved amendments. An imported bill requires
explicit source-bound confirmation through Invoice document review before any new
cash-planning terms or approval. **Review retained historical original** stages
its retained exact bytes. Missing originals require the actual original; dates
and verification are never invented from source status. Source approvals remain
historical evidence. Risk dispositions cannot bypass quantity/receipt matching.

Imported prepaid balances show separately. An authorized invoice capture may
explicitly apply a deposit credit up to the current unapplied balance and invoice
gross amount. Allocations retain gross three-way evidence; cash planning uses the
net bill. The deposit appears once in source spend, and its credit reduces the
later bill once. Native deposit creation, provider prepayment posting and automatic
matching remain PO-011/MATCH-001 work. Supplied paid-history bills are excluded from
current unpaid bills only after current source confirmation and planning review.

Later amendments use the operational request and ordinary native submit/approval/
conversion/issuance. Direct unapproved cancellation is refused. **Propose cancellation for native
approval** creates a normal amendment draft; submit, independent approval,
conversion and issuance settle its cancellation quantities without sending mail.
**Replace the unreceived remainder** is the explicit supplier/currency change:
only unreceived supply moves to a fresh native purchase after approval, while old
received liabilities, bills and prepaid credits stay with the original supplier
and currency. Changed source balances require a fresh disposition proposal. Chasing stays disabled on adopted history.
Original import undo retains adopted targets and their downstream source links;
complete archive restore preserves adoption, opening balances, originals and
reviews without restoring historical authority.


## Trip expense exports

On an approved trip, open **Return final expense report**. Select Coaster for its native claim-detail JSON, or Expensify, Navan, Ramp or Brex for a complete independently approved UTF-8 CSV export. Configure the provider export template to include a distinct expense ID, expense date, amount, currency, traveler email, Purse approval reference and description. Preserve the original file. Choose the exact column headers in the form; its defaults are editable starting selections, not a claim that every provider has a fixed export schema.

| Source | Starting headers, in the order above |
|---|---|
| Expensify | Expense ID; Date; Amount; Currency; Submitter Email; Purse Reference; Description |
| Navan | Transaction ID; Transaction Date; Amount; Currency; Employee Email; Purse Reference; Description |
| Ramp | External ID; Transaction Date; Original Currency Amount; Original Currency Code; User Email; Accounting Purse Reference; Merchant Name |
| Brex | Expense ID; Date; Amount; Currency; Employee Email; Purse Reference; Memo |

Review the complete final report in the source system and enter its workspace or account, report ID, title, total, approved status, independent approver and approval date. The source approver must differ from the traveler. Purse labels this as manually reviewed source metadata; it does not independently authenticate the provider. Each original row must already carry the exact Purse reference. Exports without it are refused. Dates use YYYY-MM-DD and amounts are unsigned decimal values with no currency symbol or thousands separators. A file has one currency, a unique header, and 1–500 unique expense rows, up to 1 MB. Quoted fields, commas, embedded newlines, UTF-8 BOM and CRLF are supported without rewriting the retained bytes.

Expensify provides [custom export templates](https://integrations.expensify.com/Integration-Server/doc/export_report_template.html); Ramp documents its [CSV accounting export fields](https://support.ramp.com/exporting-your-data-to-csv/). Brex documents [customizable accounting exports](https://www.brex.com/support/brex-dashboard-accounting-page). Navan and Brex header labels depend on the selected report template, so review the original header before confirmation.

The current native owner or scoped finance with payable approval may confirm the return. Only the current native owner downloads its retained original. Repeating the same source cannot repeat actual spend or reservation release. An over-estimate report requires renewed trip approval. Import never fetches a URL or performs booking or payment.

## Native budget CSV

In Settings, open Budget import and owners. Create the dated approval policies
first. The current native owner reads a UTF-8 CSV, explicitly maps its columns,
budget references, department, location, project, GL account and active member
owners, then previews each amount and confirms the exact reviewed import.
The source currency and mapped coding must match the selected policy. Imports
change its budget amount and alert assignment; they preserve approval limits,
chains, periods and over-budget authority. Assignment adds no approval grant.

Typical columns are `budget`, `amount`, `currency`, `department`, `location`,
`project`, `glAccount`, `owner` and `thresholds`. Column names are configurable.
Amounts use decimal currency text with at most two fractional digits. Each row
targets one dated budget, with a separate currency. Thresholds are whole
percentages separated by semicolons; an empty cell disables native alerts.

Preview persists nothing. Changing the bytes, mapping, native session or current
state requires another preview. An unchanged reviewed re-import changes no
product records or audit events. Each dated budget creates at most one native
notification per configured threshold when reserved, committed and recorded
actual exposure reaches it. Owners see notifications and complete budget totals
only while their current report grant covers that budget. Private purchases
retain anonymous sums and acquire no new drill-through access. Notifications
appear in the signed-in workspace; this door sends no email or provider message.
Only the source digest and mapping digest are retained, with before and after
amounts and assignments in the audit. CSV originals are not retained. Spreadsheet,
Easel and ledger budget qualification remain unproved in BUDGET-002.


## Hosted catalogue prices

In Settings, open Hosted catalogue CSV. An unrestricted catalogue manager can
preview and explicitly commit 1–500 UTF-8 rows, within 1 MB. Preview writes
nothing. Commit binds the exact bytes, reviewing session and current purchasing
state; changed bytes, supplier eligibility or state require a fresh preview.
Prices are approved only by the reviewed commit. This imports catalogue items,
never requests, approvals, orders or supplier connections.

Required columns are `supplierId`, `sku`, `currency`, `description`, `unit`,
`unitPrice`, `category`, `validFrom` and `validUntil`. Optional columns are
`project`, `location` and `costCentre`; any supplied coding must already be
configured. Use both ISO dates and nonnegative currency text with a decimal
point and at most two decimal places. An expired row refuses the entire batch.
A future price is retained but cannot be selected for a request before its start.

Use the exact supplier ID shown in Settings and a nonempty exact SKU; neither
case nor surrounding whitespace is normalized for identity. Supplier ID, SKU
and currency together identify an item. The supplier must already be active or
preferred, screened and unmerged. Duplicate source identities or ambiguous
existing identities refuse the batch. Different currencies remain separate
items. Existing access restrictions and required attachment filenames remain.
An identical reviewed re-import writes nothing, including no new audit event.
Changed terms update only the catalogue: approved revisions and POs retain their
frozen lines and prices. Catalogue items and change audit continue in ordinary
portable archives; a restored installation requires a new current-session review.
Replaying source bytes whose imported terms were erased is refused. Reintroducing
a previously erased item field is also refused after a formatting change; submit
a corrected file with personal data removed.

This native CSV door does not connect a PunchOut supplier, return carts, transmit
POs or receive supplier confirmations. PUNCHOUT-002 retains those qualifications.


## Fixture-qualified multi-line history

`public/fixtures/procurify-multiline.csv` extends the synthetic format. It is not
an actual Procurify Export Data layout or API adapter. Keep the vendor archive
and reconcile the intended full period before switching.

Use repeated `request`, `order` or `invoice` rows with the same exact `sourceId`
and a distinct, nonempty `lineId` on every row. Identity includes spaces and
case. Repeated header attributes must agree exactly, including supplier,
currency, source status, dates, terms, charges, approval evidence, original
invoice metadata and header custom values. A duplicate line is refused, even
when its bytes agree. Legacy rows without `lineId` retain their original IDs.
A source key cannot mix explicit lines with the legacy format.

Each order row names its source `requestId` and exact `requestLineId`. Each
invoice row names `orderId` and exact `orderLineId`, with its own `lineId`.
Receipts use `orderId` and `orderLineId`. References must resolve to an actual
source line, either in this batch or in retained history. Broken references
cannot commit. `quantity`, `unitPrice`, description, category and project belong
to the line. Freight and tax are repeated header values counted once per
request or PO. Invoice `amount` is a line amount, defaulting to quantity times
unit price; the invoice total sums its source lines. Invoice originals and
source payment evidence remain header facts, retained once.

A `field` row declares a source-only definition: `sourceId`, `name`, explicit
`status`, `recordKind` (request, order or invoice), `fieldScope` (header or line),
`fieldType` (text, choice, number, date or boolean), and `fieldOptions` (a JSON
array for choice fields). Names, choice strings and definition identities are
retained exactly. `headerFields` and `lineFields` are JSON objects whose keys
are exact definition IDs and whose values use the declared JSON types. Header
values repeat unchanged across a header's lines. Missing definitions, wrong
scope, invalid values and unsupported protected definitions are refused.
Definitions can refer only to historical records, never native intake forms.
Operational field adoption, ledger mappings and full protected-value storage
remain unimplemented. Supplier matching inputs still use only the existing
sensitive-column redaction exception; arbitrary free text is not universally
redacted.

Preview shows distinct header and line counts and totals separately by record
kind, supplier, department, currency and source month. Departments use the source
`costCentre`; invoices and deposits without one inherit the source PO department. Missing
departments stay explicitly unrecorded, never guessed from current configuration. Requests and POs use need-date months;
invoices use invoice-date months and deposits use their recorded source dates,
with missing dates explicitly unrecorded.
Currencies and record kinds never combine into a misleading grand total. The
example independently reconciles an Operations USD request face of 125000 minor
units (60000 plus 40000 plus a declined 20000 item, 2000 freight and 3000 tax),
its PO face of 105000, and invoices of 40000. Research retains a separate USD
request of 50000 and EUR request and PO faces of 3000 with invoices of 1500.
A source request face includes declined items as history; it is never a native
spending authorization. Reopening a batch retains the same sorted reconciliation.

Review exact header and line identities, custom values and logical CSV row
numbers in the source disclosure. Retained rows include their payload digests;
original bytes and reviewed mappings stay in Base import-kit custody. Selecting
a new file clears its previous browser review. A retained batch reopens with
its current reconciliation and values. Resume is bounded and idempotent, and
undo preserves edited records and any surviving dependent source history.
Native approval, issuance, commitment, configuration and member authority never
come from historical statuses, field definitions or approval evidence. Open-PO
adoption still needs IMPORT-003's separate owner review.

Archive restoration preserves this history and the original batch identity;
a current owner must explicitly claim batch custody before reading its originals,
resuming or undoing it. Custody grants no purchasing or member authority. Personal
erasure removes matching source values, withdraws affected original custody and
prevents replay of erased values; a sanitized resumed batch cannot restore them.
Actual Procurify exports, API access, real attachment and deposit qualification, comments, travel,
approval pools, split allocations, vendor routing, pending vendors, purchaser
variance and item decisions retain the IMPORT-001 Gap.


### Historical item decisions and account splits

The multi-line fixture also accepts `lineDecision` (approved, declined or pending),
`lineDecisionReason` and `lineDecisionEvidence`. A declined item needs its exact
source reason. These facts remain in `sourceDecision`, separate from native
request approval. A PO line must point to an exact source request line with the
same supplier and currency, and a declined source line cannot enter a historical
PO or be adopted into purchasing. The remaining historical request stays inert;
imported approval never makes its other lines natively convertible.

`lineAllocations` is an optional JSON array with exact `sourceId`,
`accountCodeId` and decimal-string `amount` per source split. It requires imported
`code` rows with `codeType` set to `gl`. The split identities are unique within
the line, referenced codes must exist, and amounts must sum to that source line
amount using the reviewed decimal convention. They are retained as
`historicalAllocations`, with their source identities and exact minor-unit
amounts. For example, the first USD invoice line retains three 10000-minor-unit
splits and the second retains 2500, 2500 and 5000. Preview and retained-batch
review show quantities, line amounts, source decisions and every account split.

These source splits do not configure native business codes, provide operational
CODING-001 allocations or ledger mappings, or change budgets. Source-approved
items do not grant purchase, payment or member authority. Current native owners
still use the separate IMPORT-003 adoption review for open POs. Native field
adoption, operational split mapping, partial-request adoption with native
approval, and actual Procurify export and API qualification remain open. Restore
preserves this source history and validates its links and sums before applying
records; it restores no importing-owner custody grant or approval authority.


The extended fixture retains one private original for the two-line USD invoice,
not one copy per allocation. Its original download remains subject to current
invoice access and is preserved by archive restoration. Matching personal erasure
withdraws affected opaque originals under the existing erasure rules.

The fixture's USD source deposit records 30000 minor units, with 10000 applied
and 20000 unapplied. A separate EUR deposit records 500 minor units unapplied
and an unrecorded date. Deposit reconciliation retains supplier, department,
currency, source period and both balances separately from request, PO and invoice
faces. A deposit in a different currency from its PO is refused, as is an applied
balance larger than its source amount. Import records these source facts only;
it does not create a payment, confirm a bill, or qualify a ledger deposit. The
separate IMPORT-003 owner review retains its existing source-balance checks.
