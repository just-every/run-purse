**Requests** is everyone's home: a thread of requests as they come in, each the requester's own words with the card Purse coded from them (quantity × unit price = total, supplier, category, project, location and need-by date) and the checks Purse runs before approval: **in budget ✓** under the covering policy and **known supplier ✓**. A card that waits on you ends in your verb (**Approve** and **Ask** for an approver, **Submit** for its requester, **Raise PO** for a buyer), and **Waiting on you** counts them. Filter by team (cost centre) and by channel (web, email or an integration's name, such as Slack or Teams). Decided requests fold into **Earlier**; the last one decided stays as a grey line. When requests waiting on one policy would together overfill its budget, the thread draws that budget to scale under them, says which approvals fit, and offers the approver **Approve** for those and **Ask** for the rest. Choose **Open request** to see a request's lines, quotes, decisions and history in place.

## Draft a request

Enter prices and amounts as currency text, for example `1,250.50` for $1,250.50.

Type what you need into **Ask Purse for something to buy…** at the foot of the thread (or choose **Ask Purse** in the top bar) and send it. It opens **New purchase request** with your words as the title; fill in:

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

When the request is ready, choose **Submit** on its card or **Submit for approval** in the open request. Its status becomes `pending`, and the approver its policy names sees it.

## Approve, return or reject

The approver chooses **Approve** on the card, or **Ask** to return it to the requester with a question. For a reject, or a reason of their own, the approver opens the request, chooses a **Decision** (approved, returned or rejected), gives a **Decision reason** and chooses **Record decision**. The decision is kept with the revision it was made on, the person, the time and any delegation.

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


## Email requests (INTAKE-004)

In Requests, the owner records the business request email address and connects its Resend receiving webhook using the installation's private provider configuration. Saving the address does not create or verify a mailbox. A requester forwards a quote PDF or emails a need and receives a sign-in link to a draft whose title is the subject. The source body and exact private attachments stay available while the requester completes the ordinary supplier, lines and coding fields. Creating the purchase draft does not submit it for approval.

Unknown senders and people without current requester authority are held for the owner. The owner reviews the source and assigns it to an active requester with a reason. Provider-reported sender labels never claim verified employee authorship. Files remain private to the owner and assigned requester, including after the purchase draft is created. The installation accepts up to three 10 MB attachments; mail outcomes say what the provider recorded, and local mail is suppressed. See API.md for webhook setup and bounded source custody.

## Request again

Open a past request or purchase order and expand **Request again**. Choose
**Review copy** to see current catalog prices and anything left out because it
is no longer available. Select each evidence file you want to carry over; none
is selected automatically. Review the new draft, replace missing values and
choose **Save copied draft**. You can close the tab and reopen that saved draft
on another signed-in device. Submit it separately for a new approval.

Current catalog prices are fixed in this copy editor. Select a different catalog
item or a custom line to change what you are requesting. Earlier approvals,
quotes, receipts and invoices stay with the original purchase.
