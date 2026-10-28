# Purse rulings

### RL-101 — PO-002: Supplier messaging on the PO

Date: 2026-10-28 · Ruled by: ct · Governs: PO-002

Question: May exact buyer-consented PO email use an expiring reply route without treating its sender as verified identity?

Adopted/proposed default: Exact PO/revision/contact consent, hashed 30-day reply alias, signed/hydrated mail and unverified sender label.

Outcome: **adopt with rider**. Approve exact current-buyer recipient/content consent, bounded revocable reply capability, trusted provider-hydrated nominated-address admission, private source custody and inert replay/restore; preserve the unverified identity label and require explicit renewed routing after expiry.

Why: Procurify explicitly sends selected content/PDF to vendor recipients. No common norm is established by the reviewed sources for a thirty-day reply alias, so bounded renewal is the safe local default. A signed provider event proves the provider’s receipt, not the human sender’s legal identity or consent.

- [Source 1](https://success.procurify.com/en/articles/9002229-how-to-send-purchase-orders-to-vendors): Buyers choose vendor recipients and message; an explicit PO email attaches the PDF and selected files.

Main evidence: `CONTRACT.md:149` at `abe82a2114a9e7dce0493fb646aa8540b896a4f9`.

Placement: PO-002 owns reply-route custody; cite PO-001/004 for shared frozen-document/send lineage.

Engineering/proof retained: The rejected Resend credential and actual inbox/attachment receipt are qualification failures, not new policy. No permanent conversation guarantee or commercial acknowledgment is inferred.

### RL-102 — PO-004: Change orders and cancellations sent

Date: 2026-10-28 · Ruled by: ct · Governs: PO-004

Question: Does the native change-order send boundary still need ct approval?

Adopted/proposed default: Exact buyer/contact consent, bounded document-only link, unverified acknowledgment and claim-once native attempt.

Outcome: **resolved**. The 23 October ct floor ruling already resolves this question and additionally requires explicit resend/link reissue and later delivery/reply behavior.

Why: The current Gap repeats pending wording but also records the approved floor; the later dated ruling governs.

- [Source 1](https://github.com/just-every/run-purse/commit/b9a81b63437b4378605eabff445302219aa68e65): Main adopts the 23 October change-order floor and retains explicit resend, cancellation, reply and delivery obligations.

Main evidence: `CONTRACT.md:153` at `abe82a2114a9e7dce0493fb646aa8540b896a4f9`.

Resolving commit: `b9a81b63437b4378605eabff445302219aa68e65`. Exact resolving text:

> PO-004 send boundary (ct 23 Oct 2026). The adopted boundary is approved as the floor:

Engineering/proof retained: Already ruled; actual mailbox delivery, resend/reissue and broader initial-send behavior remain required.

### RL-103 — SYNC-004: Pantry

Date: 2026-10-28 · Ruled by: ct · Governs: SYNC-004

Question: Does the owner-confirmed USD Pantry sync floor still need ct approval?

Adopted/proposed default: Manual exact-bill posting, no automatic retry or originals transfer, payment-evidenced Paid and unknown reconciliation.

Outcome: **resolved**. The 23 October ct ruling approves the interim floor and retains scoped AP standing posting, readback reconciliation and scheduled status return as target.

Why: Main’s later explicit approval resolves the stale pending sentence; repeating a new rule would obscure its required target extensions.

- [Source 1](https://github.com/just-every/run-purse/commit/b9a81b63437b4378605eabff445302219aa68e65): Main approves the Pantry interim floor and records scoped standing posting and reconciled retry as the target.

Main evidence: `CONTRACT.md:215` at `abe82a2114a9e7dce0493fb646aa8540b896a4f9`.

Resolving commit: `b9a81b63437b4378605eabff445302219aa68e65`. Exact resolving text:

> SYNC-004 boundary (ct 23 Oct 2026). The following are approved as the interim floor:

Engineering/proof retained: Already ruled; credits, PO/source and 1099 transport depend on Pantry INTEG-001; remaining reconciliation and non-PO qualification are engineering.

### RL-1 — Legacy invoice evidence

Date: 2026-10-22 · Ruled by: ct · Governs: SECURITY-001, SECURITY-004

Legacy invoice evidence(ct, 22 Oct 2026). Invoice-evidence hashes made under the shared matching root (representation legacy-root-v1) are preserved byte for byte and never recomputed into, replaced by or relabelled as new evidence; new evidence uses a new independently random invoice-evidence key (v2), the old root keeps only its matching use and leaves default archives, and no default archive holds a bank-derived value with the key that derived it. A one-time audited migration gives every legacy hash exactly one state, shown wherever invoice evidence is shown: attested-at-migration when recomputed from retained records (no bank input, or a bank input equal to a retained supplier baseline), labelled "Checked at migration on <date> from retained records. Later checks verify this migration record, not the original submission."; unavailable-source when it binds a bank input no retained record reproduces, labelled "Original bank input not retained – legacy evidence not verified."; did-not-verify when every bound input is retained and recomputation fails, labelled "Legacy evidence did not verify." Only the current native owner re-enters the original bank input, one invoice per no-store POST with reason, evidence reference, native reauthentication within ten minutes and current revision; a match sets verified-by-reentry ("Verified by owner re-entry on <date>. Later checks verify this re-entry record."), a mismatch answers did not verify and writes only a digit-free audit event, and an absent old root returns 503 without fallback. Re-entered digits are discarded; invoices, audit, receipts, logs and archives never hold bank digits, suffixes or bank fingerprints. Each attestation is an HMAC under the invoice-evidence key over the exact legacy hash, representation, retained-field digest, state, event, actor and time. No state claims bank or supplier verification or changes INVOICE-003 flags, reviews, comparisons or holds. Restore writes nothing and names the invoice when a v2 hash does not recompute, an attestation does not bind the stored hash, a state is unsupported by its fields, a migrated archive holds an unmigrated legacy hash, or an invoice carries a bank-derived field; a pre-migration archive is migrated on import by the same rules and refused when a retained-input hash does not recompute. Unavailable-source rows are preserved history and are never counted as verified. The migration receipt counts each state and states that archives exported before migration still carry the old root.

### RL-2 — Erasure and fresh-destination restore

Date: 2026-10-23 · Ruled by: ct · Governs: ERASURE-001

 The following are approved: native-owner explicit inventory/review/consent with fresh proof; resumable withdrawal and deletion of opaque originals; anonymous financial chronology without automatic destruction; encrypted, reveal-restricted retained TIN and bank values; honest verification labels; installation-checkpoint or supplied-journal fencing. **Fresh-destination restores.** A fresh destination given no later journal restores only after the native owner acknowledges "erasure history unverified: supply your latest archive as the journal". The report records that acknowledgment, the archive time and that no journal was supplied. **Retention.** Retained protected values follow an owner retention period in whole years (default 7, minimum 1, IRS Pub. 583 warning below 7) counted from the latest supported payable. Expired values are listed and erased only on owner confirmation. **Coverage.** Order-send acknowledgment names and recipients, travel identities, Pantry-held contact fields and scenario consents are in the reviewed inventory. **Legal adequacy.** None is asserted. **Exact native semantics.** The fresh-destination acknowledgment is a native-owner door in Settings of the empty installation with fresh native reauthentication; it and the restore report (acknowledgment, archive time, no journal supplied) live in an installation-local table that never enters an archive, and a restore that supplies a later journal needs none and is labelled journal-supplied. The unverified label stays on a restored installation; only a restore that supplies the journal clears it. Retention counts whole years from the latest invoice date entered against any order of the supplier; Ready to erase lists protected TIN and bank values and W-9 originals, a supplier with no payable has no clock, and an invoice whose bank binding lost its source value says so. Every refused erasure door of a configured business appends one value-free audit row, and agents cannot propose erasure. A link holder's stated acknowledgment name is erased with its recipient, a sole proprietor's name in a synced Pantry bill source is erased with its contact, and a departed member's scenario consent actor and email are erased with the member.

### RL-3 — Recurring-spend scenario boundary

Date: 2026-10-23 · Ruled by: ct · Governs: AGENT-006

 The native owner assigns agreement ownership to an active native member through audited agreement confirmation. Each current assigned agreement owner consents under their own current grant to the same source hash. Finance approval is independent of affected agreement and budget owners and requires current payable approval and cash access over linked purchases. Every budget whose recorded allocated commitment changes also consents through its configured budget owner, or the policy approver where no separate budget owner is recorded. Procurement and finance prepare only within current source scope. Forecasts use recorded value, auto-renewal, recorded renewal months or inclusive term duration, and recorded increase caps; they are labelled "forecast from recorded terms; not issued, not realized". Missing recorded value or term remains unknown. Renewal assumptions show the hypothetical proposed total separately from issued obligations and commitments.

  Scheduled discovery runs inside each agreement's recorded reminder lead window through its notice deadline. It records source-exact proposals and in-app notices for current finance approvers and assigned owners, deduplicated by source and notice window. It grants no consent, draft, send or purchasing authority. After all exact consents, the native owner requests a nonbinding draft and separately consents to send its exact hash to an explicit recipient through PO-004's native send boundary. The claim precedes the existing native mail adapter; it is consumed once and an uncertain outcome is never retried automatically. The send is recorded against the agreements and notice deadlines. A separate native-owner-approved agreement disposition records cancellation or non-renewal after an accepted notice attempt; the person separately ends future recurring orders and records outstanding PO cancellation through their existing authorized doors. The scenario itself cancels nothing. Drafting and sending recheck current sources, policies, grants and native consent identity versions. Historical archives preserve source facts and accountability without restoring authority. Assigned owners receive safe agreement terms and the curated affected scenario, with no original, protected-data or general invoice read grant. New recipient and actor stores inherit ERASURE-001. Erased source values retain their original hashes as labelled anonymous history under sealed erasure evidence; monetary arithmetic still recomputes, and erased scenarios cannot approve, draft, send or authorize a disposition. AGENT-005, AGENT-010 and future proposal or sending capabilities inherit this whole source, scope, protected-context and explicit-current-authority boundary before shipping. **Legal.** Notice drafts cite recorded notice terms and say "verify the notice method your agreement requires"; no notice effectiveness or legal adequacy is claimed.
