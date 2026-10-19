The **Requests** tab lists every request with its need-by date, status and amount. Open one to see its lines, quotes, decisions and history.

## Draft a request

Enter prices and amounts as currency text, for example `1,250.50` for AUD 1,250.50.

Choose **New purchase request** and fill in:

- **Request title**, **Supplier**, **Currency** and **Need date**.
- **Location** and **Cost centre**, from your business codes.
- One or more lines: pick an approved **Catalogue item** to copy its description and reference price, or describe a custom item. Each line has a **Quantity** (up to three decimal places), a **Unit price**, a **Category** and a **Project**.
- **Freight** and **Supplied tax**, as the supplier gave them.
- **Supplier-supplied terms**.

Choose **Save request draft**. The request is saved as a draft at revision 1. Blocked suppliers can't be chosen.

## Attach evidence and quotes

Open the request. Under **Evidence files**, upload the supplier's quote or any other file; Purse keeps the file exactly as uploaded.

To compare suppliers, choose **Add supplied quotation** for each one. The **Quote comparison** puts price, freight, supplied tax, delivery and conditions side by side. Anything a supplier left out says **Missing**. Quotes in different currencies are compared in separate tables.

## Submit for approval

When the request is ready, choose **Submit for approval**. Its status becomes `pending`, and the approver its policy names sees it.

## Approve, return or reject

The approver opens the request, chooses a **Decision** (approved, returned or rejected), gives a **Decision reason** and chooses **Record decision**. The decision is kept with the revision it was made on, the person, the time and any delegation.

A returned or rejected request can be revised and submitted again. Its earlier decisions stay in the **Decision history**.

## Revisions

Choose **Revise or amend request** to change a request. Change the supplier, a quantity or a cost and Purse saves a new revision with your **Amendment reason**; that revision needs approval again. **Revision history** lists every version with its supplier, total and lines.

Approval binds the exact revision. Nothing changes after approval without a new revision and a new decision.

## Next

When a request is approved, a buyer chooses **Generate purchase order**. See [Purchase orders and receiving](/docs/orders).


## Supplier requests for quotation (SOURCE-001)

A buyer opens an editable request and prepares a supplier RFQ with the exact source revision, scope, quantities, nominated suppliers, questions, reminder time and response deadline. Choose times in your browser time zone; the API requires an explicit offset or UTC and stores UTC instants. Supplier pages show the installation's time zone. The deadline is at most 30 days away and the reminder is at least one hour before it. The first hourly tick at or after the reminder time attempts one reminder for an invited supplier who has not responded, only before the deadline; actual outcomes are retained. A missed deadline is recorded without a late reminder.

Send each invitation or explicitly reissue its private supplier link. A reissue invalidates the old link immediately; the new link expires at the same deadline. The supplier sees only requirements and questions, can submit original quote files and can revise until the deadline. Each response stays in history; the latest version counts in comparison. Supplier originals are buyer/owner-only and links never travel in archives. Mail outcomes describe the actual transport result; local mail is suppressed.

Compare each currency separately. The savings baseline is the first recorded RFQ offer in the awarded currency, including across nominated suppliers. Select the exact latest winning response and record an award reason. Awarding the baseline itself is allowed and creates zero negotiated savings. The selected supplier, prices and terms enter a new ordinary request draft, keeping real supplier/response provenance. Submit that exact revision for fresh approval. Later supplier responses cannot rewrite an already recorded award or approved terms. Only approved awards and received, cash-planning-approved invoice evidence enter the labelled savings report.
