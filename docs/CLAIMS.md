<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Purse homepage claims

A claim is done when every clause behind it is done, missing when every one is missing, and partial otherwise.

| # | Claim | Clauses | Status |
| --- | --- | --- | --- |
| 1 | 100% free and open source, MIT licensed; one line starts it on your computer | `PUR-015` partial | partial |
| 2 | Requests held to budget, POs sent and chased, invoices matched to order and delivery | `BUDGET-001` partial; `PO-001` partial; `PO-003` done; `MATCH-001` partial | partial |
| 3 | Each matched bill synced to QuickBooks Online once | `SYNC-001` missing; `SYNC-005` missing | missing |
| 4 | Requests from a phone and the web | `MOBILE-001` done; `INTAKE-001` partial | partial |
| 5 | Requests from Slack and Microsoft Teams | `INTAKE-002` missing; `INTAKE-003` missing | missing |
| 6 | Copy a past order into a new request | `INTAKE-001` partial | partial |
| 7 | Every request coded to its team and budget | `CODING-001` missing; `BUDGET-001` partial | partial |
| 8 | The agent finds the catalog item and past orders, codes the line and drafts the request; the requester submits | `AGENT-001` partial; `CATALOG-001` done | partial |
| 9 | Budget check and who decides, by team and amount | `BUDGET-001` partial; `APPROVAL-001` partial; `PUR-006` done | partial |
| 10 | Approvals given in Slack or Teams | `APPROVAL-003` partial | partial |
| 11 | One line split across two departments, each half checked and approved on its own budget | `CODING-001` missing; `APPROVAL-001` partial | partial |
| 12 | POs created and sent after approval; lines from two requests combined on one PO | `PO-008` partial | partial |
| 13 | A new supplier proposed in a request; the supplier fills in its own W-9, bank and insurance through a link | `SUPPLIER-008` missing; `SUPPLIER-001` missing | missing |
| 14 | Bank details checked by call-back and a second approver; account name matched with Plaid | `SUPPLIER-002` missing | missing |
| 15 | OFAC screening and the duplicate-supplier check | `SUPPLIER-007` done; `SUPPLIER-003` done | done |
| 16 | Insurance certificate kept with its expiry | `SUPPLIER-004` partial | partial |
| 17 | EIN and bank details masked | `SECURITY-001` partial | partial |
| 18 | Each PO emailed from the business's own address with an acknowledgment link | `PO-001` partial; `PO-002` partial | partial |
| 19 | PO document with lines, need date, terms and total | `PO-009` partial | partial |
| 20 | Unacknowledged POs chased on a set schedule (1 a day, at most 3) | `PO-003` done; `AGENT-003` partial | partial |
| 21 | Amazon Business orders by cXML PunchOut | `PUNCHOUT-001` missing | missing |
| 22 | Carrier tracking on the PO | `PO-006` missing | missing |
| 23 | The requester told in Teams when the PO is acknowledged | `NOTIFY-001` missing; `INTAKE-003` missing | missing |
| 24 | Receivers prompted for the day's deliveries; partial receipts keep the rest open on the PO | `RECEIVE-001` partial; `PUR-010` partial | partial |
| 25 | Scanning deliveries at the dock on a phone | `MOBILE-002` missing | missing |
| 26 | An invoice billed for more than was received is held until the rest arrives, then matched | `RECEIVE-001` partial; `MATCH-001` partial | partial |
| 27 | Invoices arriving at an AP address | `INVOICE-001` partial | partial |
| 28 | Invoice fields read with confidence and confirmed by AP | `INVOICE-002` partial | partial |
| 29 | The agent asks the supplier for the back-order date and records the answer on the PO | `AGENT-003` partial | partial |
| 30 | Paid by ACH in QuickBooks, with the status back in Purse | `AP-002` missing | missing |
| 31 | A repeated invoice never entered twice | `INVOICE-003` partial; `PUR-011` partial | partial |
| 32 | A sync timeout retried without a second bill; the month's tie-out against QuickBooks | `SYNC-005` missing | missing |
| 33 | Received-not-billed accrual posted as a reversing journal | `REPORT-004` missing | missing |
| 34 | Moved from Procurify with open POs adopted under their own numbers, not re-sent | `IMPORT-001` partial; `IMPORT-003` partial | partial |
| 35 | Suppliers, approval routes, budgets and history brought over; bills linked to the POs already in QuickBooks | `IMPORT-001` partial; `BUDGET-002` missing; `IMPORT-004` missing | partial |
| 36 | Also moves in from Coupa, Precoro and spreadsheets | `IMPORT-002` missing; `PUR-013` partial | partial |

Claims: 36; 1 done, 24 partial, 11 missing.
