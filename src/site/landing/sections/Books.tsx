import type { CSSProperties, ReactNode } from 'react'
import { Glyph, type Team } from '../parts/Glyph'
import { Check } from '../parts/icons'
import { SectionHead } from '../parts/SectionHead'
import '../styles/books.css'

const bills: { team: Team; purse: ReactNode; qbo: ReactNode; note?: string }[] = [
  { team: 'operations', purse: <><p>Amazon Business · invoice 1WQK-3NVR-7HTD</p><p>PO 3104 · Operations · $980.00 · matched Thu Oct 22</p></>, qbo: <>Bill 4812 · PO 3104 · PDF attached</>, note: 'Fri Oct 23, 8:10 am · the same invoice arrived again as a PDF · not entered twice' },
  { team: 'facilities', purse: <><p>Brazos Office Furniture · BOF-7731 · PO 3108 · $3,296.00</p><p className="split"><span className="nb"><Glyph team="marketing" />Marketing $1,648.00</span> · <span className="nb"><Glyph team="engineering" />Engineering $1,648.00</span></p><p>matched Fri Oct 23</p></>, qbo: <>Bill 4813 · 2 lines, coded to each department</> },
  { team: 'engineering', purse: <><p>Keystone Tech · K-55120 · PO 3107</p><p>Engineering · $4,467.00 · matched Fri Oct 23</p></>, qbo: <>Bill 4815 · PO 3107 · PDF attached</> },
  { team: 'facilities', purse: <><p>Hartwell Supply · HS-88412 · PO 3081</p><p>Facilities · $2,364.00 · matched Tue Oct 27</p></>, qbo: <>Bill 4821 · paid by ACH Fri Oct 30</>, note: 'Tue 10:45 am · QuickBooks timed out · retried 10:46 · still one bill' },
]

/** 10 · Books: four Purse bills zipped to their QuickBooks Online bills with grey side notes for the repeat PDF and the
 *  timeout, the October tie-out bar and the received-not-billed accrual. */
export function Books() {
  return (
    <section id="books" className="books wrap" aria-labelledby="books-title">
      <SectionHead id="books" eyebrow="Books · AP and the controller · Thu Oct 22 – Fri Oct 30, CT" line1="Each bill in QuickBooks once." line2="October ties out.">
        Matched bills synced with their POs and PDFs. A repeat invoice never got in, a timeout never made a second bill, and Priya’s tie-out found nothing to fix.
      </SectionHead>
      <div className="zipper">
        <p className="zip-col">Purse</p>
        <p className="zip-col zip-col-qbo">QuickBooks Online</p>
        {bills.map((bill, index) => (
          <div key={index} className="zip-row">
            <div className="zip-purse card"><span className="dot tang" aria-hidden="true" /><Glyph team={bill.team} /><div>{bill.purse}</div></div>
            <span className="zip-tie" aria-hidden="true" />
            <p className="zip-qbo card"><span className="dot green" aria-hidden="true" /><span>{bill.qbo}<Check /></span></p>
            {bill.note && <p className="zip-note">{bill.note}</p>}
          </div>
        ))}
      </div>
      <p className="tieout card"><span className="dot green" aria-hidden="true" /><span><b>October tie-out</b> · run by Priya Shah · Fri Oct 30, 4:30 pm · 143 bills · Purse $186,420.55 · QuickBooks Online $186,420.55 · <span className="nb">differences 0<Check /></span></span></p>
      <div className="accrual card"><span className="dot" aria-hidden="true" /><div><p>Received, not billed at Sat Oct 31 · 6 PO lines · $11,284.40 · largest: PO 3109, Lone Star Displays, booth kit $3,940.00, received Thu Oct 22</p><p>Posted to QuickBooks by Renee Coleman, Fri Oct 30, 4:40 pm · journal dated Sat Oct 31, <span className="nb">reversing Sun Nov 1<Check /></span></p></div></div>
    </section>
  )
}
