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
