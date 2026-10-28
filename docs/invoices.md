Purse records the supplier's invoice as evidence against the order and checks it against what was ordered and received. It doesn't pay invoices or post them to your ledger.

## Record an invoice

On an issued order, a buyer chooses **Add invoice evidence** and enters:

- **Invoice reference**, as printed on the supplier's invoice.
- **Evidence source**: where the invoice came from.
- **PO line**, **Invoice quantity** and **Invoice amount**, entered as currency text (for example, `1,250.50` for AUD 1,250.50).

Choose **Save invoice evidence**. Upload the invoice file under **Invoice evidence**.

An invoice is identified by its supplier and reference, across all orders. Entering the same invoice again changes nothing; entering a different invoice under the same reference is refused, so you can review it.

## Review the differences

**Invoice discrepancies** lists each invoiced line with three checks:

| Check | Says **Review** when |
| --- | --- |
| Price difference | The invoiced amount differs from the ordered price for the invoiced quantity |
| Quantity mismatch | More of the line is invoiced, across all its invoices, than was ordered |
| Receipt shortfall | More of the line is invoiced than has been accepted so far |

A line that matches shows `—` in all three.

## Download the accounting CSV

Buyers can choose **Download accounting CSV** at the foot of the Orders tab. The file, `purse-accounting.csv`, has one row per invoiced line:

| Column | Holds |
| --- | --- |
| invoice | The invoice reference |
| po | The order number |
| line | The order line |
| currency | The invoice currency |
| quantity | The invoiced quantity |
| amount_minor | The invoiced amount in minor units |
| price_mismatch, quantity_mismatch, receipt_shortfall | `true` or `false` for each check |

Import it into your bookkeeping the way you import any CSV.


## Reading an original (INVOICE-002)

On Orders, open a current issued PO and use **Read invoice document**. Staging retains the exact original privately for owners/buyers, without creating an invoice. Labelled text PDFs and MIME bodies produce review fields. Scans/images can be handed to an external reader you choose: prepare instructions, download the scoped original, run your reader, then upload its source-bound JSON. Purse makes no model call; declared reader execution is unverified. Never put routing/account/TIN values in prepared JSON, quotations or corrections. Remit fields contain payee/postal address only.

Review every field, source page and confidence; correct missing required fields. Values below 95% are highlighted. Map every item once, check exact line/subtotal/freight/tax/total reconciliation and explicitly confirm. Optional missing due dates, terms, sender or remit facts remain unrecorded. Confirmation passes the original, confirmed date/sender/postal remit and optional transient bank comparison to INVOICE-003; it never approves payment. Postal/bank differences hold cash planning for reasoned review. Current inclusive allocations apportion charges by subtotal with remainder cents on the first item; the document breakdown remains in the reading.


## Supplier PO flip

The owner first authorizes invoice access for the exact acknowledged supplier
link in Orders. That link shows only its own PO balances and submissions; it
cannot change bank or remit details. The supplier submits the received quantity,
invoice number, date, freight, tax and original PDF. AP reviews the private original
before payment approval is possible.

In Settings, **Supplier invoice approval** lets the current native owner consent
to automatic approval for that exact PO and live link. It starts off. Matching
requires the PO prices, accepted receipts, proportionate approved freight and tax,
and resolved source risk. A paused rule or changed owner, link or invoice-access
consent stops future approval until the owner renews it. Approval and scheduling
retain their source and rule history in the audit log and archives; restoring an
archive does not restore supplier access or execution authority.

An authorized AP member can record one native scheduled payment date for a
currently approved invoice. The supplier sees received, approved or scheduled
status from those records. Scheduling is a local payment instruction: no funds
are sent and no provider execution is claimed. Paid requires payment evidence
returned through the existing accounting connection. A later risk or matching
hold preserves historical approval but withholds its current approval status.
