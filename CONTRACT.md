# Purse phase 1 contract

Purse supports one business purchasing from known suppliers, from a request through exact-revision approval, PO issuance, partial receiving and invoice-evidence handoff. It runs without a provider account. No payments, posting, supplier discovery, tax determination or model execution is implied.

| ID | User-visible guarantee |
|---|---|
| PUR-001 | One business retains locations, cost centres, projects, currencies and native-session requester, approver, buyer and receiver capabilities. Setup preserves identity and data. |
| PUR-002 | Suppliers retain contacts, documents, agreements and preferred/blocked reasons. Blocked suppliers cannot enter native purchasing. |
| PUR-003 | Approved catalogue reference prices copy into request revisions; subsequent catalogue changes do not change approved terms. |
| PUR-004 | Durable drafts retain decimal quantities, project/category/need date, real attachment bytes and immutable revision history. Invalid values are refused. |
| PUR-005 | Supplied quotations compare price, freight, tax, delivery, conditions and evidence, with missing fields visible and currencies separate. |
| PUR-006 | Current amount/category/project policy binds the exact request revision. Self approval fails. Concurrent budget reservations cannot overspend. |
| PUR-007 | Approve/reject/return decisions retain reason, actor, time, revision and delegation. Scoped delegation expires. Resubmission preserves history. |
| PUR-008 | Approved lines allocate once to numbered POs with source links and downloadable documents, including concurrent conversion. |
| PUR-009 | Document generation and authorised issuance are distinct. Revisions and POs retain approved supplier identity and terms across supplier-directory edits. Supplier/quantity/cost amendments retain issued history, invalidate stale authority, reserve changes and require renewed approval before an amendment is issued. |
| PUR-010 | Partial receipts, service milestones, rejection, return and cancellation retain reasons. Events explain outstanding quantities and commitments. Physical returns exceeding current replenishment authority remain recorded with an explicit hold for review, without overspending. Overreceipt, repeat return and wrong roles fail. |
| PUR-011 | Supplier ID plus invoice reference identifies invoice evidence once across POs. Identical re-entry is idempotent; conflicting evidence is refused for review. Allocations expose price/quantity/receipt discrepancies and export accounting CSV once without posting or payment. |
| PUR-012 | Commitments remain currency-separated, overdue receiving and renewals stay visible, and complete `.rer` archive restore preserves domain links, decisions, files and import history. Corrupt/nonempty restore fails atomically. |
| PUR-013 | The documented first CSV move-in kit uses Base import-kit D1, current native-session SQL guards, exact source keys/bytes/mapping decisions, no-write preview, reviewed commit, resume, idempotence and conflict-preserving undo. Imported status never grants authority. |
| PUR-014 | Five provider-free human preparation workflows retain editable downloadable drafts, missing fields, source references and input versions. ProposedActions recheck current authority at execution. No fabricated AI result, send or binding deal. |
| PUR-015 | MIT source runs through maintained RER install/setup/dev/build/preview/verify/reset/export/import/deploy-dry-run/describe/check, with native TanStack Start/Hono/Cloudflare, shipped fonts, Purse theme and real dev personas. |
| PUR-016 | Quantities are thousandths; money is integer minor units, each line rounds half-up once. Commitment reservations/releases/amendments append to an auditable ledger. Invalid/nonfinite values fail. |
| PUR-017 | Every private API/download checks current native session, capability, business and record scope. Forged actor, role, revision and total cannot authorise. Denials preserve domain state. |

The required owner export, anonymised purchasing example, current-process cost/attention baseline are outside fixture proof. Existing installations retain applied migrations and use the forward upgrade in `UPGRADING.md`. Future Models, approved supplier Messaging and a pilot-selected accounting adapter remain preserved phase 2/3 obligations.

## Backup and upgrade

A pre-upgrade export restores only with the Purse release that made it. Restore it
into an empty installation of that release, upgrade that installation’s source
in place, run `rer install` and `rer setup`, then export again. Keep the original release
and private export until recovery is verified. Never import an older release’s
archive directly into the current release.
