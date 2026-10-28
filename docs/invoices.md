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


## Supplier invoices from an acknowledged PO

The owner authorizes invoice access for the exact supplier link on the PO.
Optionally consent to automatic approval and choose payment terms there. The
supplier submits structured quantities, prices, freight, tax and its original
PDF. AP chooses **Review supplier invoice original**, compares the submitted
facts with that private PDF and confirms them. No document extraction is needed.
Only an exact three-way match with all invoice risk flags resolved gains the
standing rule's payment approval. Receipt changes and new originals can hold
current eligibility without deleting earlier approval evidence.

In the existing bill terms area, the owner can record **Schedule supplier
invoice** with an exact invoice, date, reason and consent. This is a native
payment instruction, not a provider payment. The supplier sees approved or
scheduled on its own link. Paid appears only after authenticated payment
evidence returns through the existing connector. No bank details or remit
instructions can be edited from the supplier form.
