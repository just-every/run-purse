import { InvoiceDrawing } from './drawings/InvoiceDrawing'
import { LicenceDrawing } from './drawings/LicenceDrawing'
import { OwedDrawing } from './drawings/OwedDrawing'
import { QuotesDrawing } from './drawings/QuotesDrawing'
import { ReceivingDrawing } from './drawings/ReceivingDrawing'
import { RevisionDrawing } from './drawings/RevisionDrawing'
import type { SectionProps } from './Section'

/** The sections between the hero and "Try it beside what you have", in page order, with their exact copy (SPEC §1.2–1.7). */
export const sections: SectionProps[] = [
  { id: 'exact', heading: 'Approve the exact order.', body: 'What you approve is what gets ordered. Change the supplier, quantity or price and it becomes a new revision.', drawing: <RevisionDrawing /> },
  { id: 'free', heading: '100% free.', body: 'Free as in cost. Free as in code. MIT licensed, with every feature included.', drawing: <LicenceDrawing /> },
  { id: 'receive', heading: 'Receive what arrived.', body: "Record deliveries as they land. Every line shows what's accepted and what's still outstanding.", drawing: <ReceivingDrawing /> },
  { id: 'invoices', heading: 'Invoices\u00a0that add up.', body: "Match each invoice to its order lines and see any difference. Download the accounting CSV when it's right.", drawing: <InvoiceDrawing /> },
  { id: 'quotes', heading: 'Compare quotes side by side.', body: 'Price, freight, tax, delivery and conditions in one table. Anything a supplier left out says Missing.', drawing: <QuotesDrawing /> },
  { id: 'owed', heading: "See what's still owed.", body: 'Commitments in each currency, late deliveries and supplier renewals, on one page.', drawing: <OwedDrawing /> },
]
