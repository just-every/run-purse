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

This is the one named exception to PUR-013 exact-source custody: sensitive cell spans in the stored original are replaced with `[REDACTED]`, preserving all other bytes, including quotes, CRLF and multiline fields. A retained `.custody.json` artifact records original SHA-256, retained SHA-256 and redacted column names. The original digest binds a review even when two differently formatted sensitive inputs redact to the same bytes. Source payloads, journal and effects retain no full TIN/account values. These inputs do not verify a bank account, validate a TIN or certify a supplier. Full sensitive storage belongs to SECURITY-001 and future SUPPLIER-001/002 and IMPORT-001/002 doors.
