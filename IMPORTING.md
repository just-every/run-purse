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

The documented shape has one line per historical request/order record. Source keys and reference fields are exact strings, including leading/trailing whitespace, scoped by source kind under `procurify`; duplicate records must agree. CSV quoting is strict: a closing quote must be followed by a delimiter, row end or end of file; malformed quotes are refused before a plan is created. A changed record under the same source key is a conflict, not a silent overwrite. Dates and original statuses remain in original custody and mapping decisions. `code` records retain their source identity and code type; owners review them before configuring native business codes. Attachments are reported missing and must be uploaded against the appropriate native record. No supplier messages, native approvals, invoice posting or payments occur on import.

The complete owner-export checklist, supplier acceptance, real multi-line export normalization and operating-cost comparison remain pilot evidence obligations. Precoro, Coupa, ERPNext and Odoo kits are later work.

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
