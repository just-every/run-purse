The **Orders** tab lists every purchase order with its status, due date and amount.

## Generate a purchase order

On an approved request, a buyer chooses **Generate purchase order**. Purse allocates the approved lines once, to a numbered order (PO-000001, PO-000002 and so on), with status `prepared`. Generating the order twice can't order the lines twice.

## Download and issue it

Open the order and choose **Download purchase order** for the printable document. Send it to the supplier the way you normally do: Purse sends nothing itself.

Once it's sent, record that under **Record PO issuance**: say how it was issued in **Issuance confirmation / channel** and choose **Record PO issuance**. The status becomes `issued`, and receiving can start.

## Receive what arrived

A receiver opens the order and uses **Record receiving event**:

- **PO line**: the line the delivery is for.
- **Event**: `receive`, `reject` or `return`. Buyers can also `cancel` what's still outstanding.
- **Quantity**, up to three decimal places.
- **Reason or service milestone**: a delivery note, the reason for a rejection, or the milestone a service reached.

Choose **Record receiving event**. The lines table shows, for each line, what's **Ordered**, **Accepted**, **Cancelled** and **Outstanding**, and the events are listed under it. Purse refuses to receive more than was ordered.

Receiving releases the matching share of the commitment, so the Overview's outstanding commitments go down as deliveries land.

## When an order changes

To change the supplier, a quantity or a cost after an order is issued, amend its request. The original issued document and its history stay. Receiving pauses until the amended revision is approved and issued.

If more is returned than current authority can replace, the return is still recorded and the order shows **Replenishment held for review**: amend the request for new approval, or cancel the outstanding supply.

## Close the order

**Close order** closes the view and takes you back to the list.

Before generating a new PO, ask the owner to configure its location in Settings →
PO document profiles: legal name and bill-to logo, bill-to/ship-to details, buyer
contact, shipping terms and purchase conditions. Category-specific profiles may
override the location default. Profile and supplier postal identity are frozen at
conversion. Add line destinations, supplier notes or deposit/prepayment text on
the request when needed. Textual deposit terms do not create a deposit or payment.

The order offers both its existing HTML download and **Download purchase order
PDF**. Both retain the configured content and original terms/certificate; the PDF
also appends and embeds those originals. A quantity amendment shows the numbered
change order and previous/new values.
