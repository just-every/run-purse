import { Glyph } from '../parts/Glyph'
import { Arrow, Check } from '../parts/icons'
import { SectionHead } from '../parts/SectionHead'
import '../styles/match.css'

const rail = [
  { tone: '', text: <>Thu 12:55 pm · HS-88412 arrived at ap@redbudoutdoor.example · read and confirmed by Priya 1:02 pm</> },
  { tone: 'cerise', text: <>1:02 pm · held: billed 12, received 10 · $378.00 not yet received</> },
  { tone: '', text: <>1:05 pm · agent asked Hartwell for the date of the last 2</> },
  { tone: '', text: <>2:30 pm · Gina Torres, Hartwell: “The last 2 ship Mon Oct 26 and arrive Tue Oct 27.” · on the PO, Luis told 2:31 pm</> },
  { tone: 'green', text: <>Tue Oct 27, 10:40 am · Tasha received 2 · invoice released<Check /></> },
]
const results = ['10:41 am · $2,364.00 matched to PO and receipts', '10:46 am · bill synced to QuickBooks Online once', 'Fri Oct 30 · ACH paid in QuickBooks · status back in Purse']

/** A cursor pill: who is looking at this line. */
function Cursor({ who, className }: { who: string; className: string }) {
  return <span className={`cursor ${className}`}><svg viewBox="0 0 20 22" aria-hidden="true" focusable="false"><path d="M2 2 17 9.5 10.5 11.5 7.5 19z" fill="#0b3d82" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" /></svg><span className="cursor-pill">{who}</span></span>
}

/** 08 · Three-way match: the page's one failure (cerise) and its recovery (green). The event rail; PO 3081 (other teams'
 *  POs fanned behind it), its receipts and Hartwell's invoice, tied by exactly four kingfisher ties (PO quantity →
 *  10 of 12; 12 of 12 → invoice quantity; PO freight → invoice freight; PO total → invoice total); then the result row.
 *  Under 1280 px: the 390 plan, the three documents stacked with each matched line on a pale kingfisher band. */
export function Match() {
  return (
    <section id="match" className="match wrap" aria-labelledby="match-title">
      <SectionHead id="match" className="centred" eyebrow="Three-way match · Facilities and AP · Hartwell Supply · Thu Oct 22 – Fri Oct 30, CT" line1="Billed for 12, received 10." line2="Held until the last 2 came.">
        Hartwell’s invoice arrived before the back-order. Purse held it, the agent got the date for the last two, and Tuesday’s receipt released it to match.
      </SectionHead>
      <ol className="match-rail">{rail.map((event, index) => <li key={index} className={event.tone}><span className={`dot ${event.tone}`} aria-hidden="true" /><p>{event.text}</p></li>)}</ol>
      <div className="match-docs">
        <svg className="ties" viewBox="0 0 1000 440" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M276 259 H330 V127 H384" />
          <path d="M661 258 H670 V163 H700" />
          <path d="M276 301 H681 V223 H700" />
          <path d="M276 351 H692 V273 H700" />
        </svg>
        <span className="fan" aria-hidden="true"><span>3109</span><span>3107</span><span>3104</span></span>
        <article className="mdoc mdoc-po card" aria-label="PO 3081">
          <p className="mdoc-team"><Glyph team="facilities" />Facilities</p>
          <p className="mdoc-title">PO 3081</p>
          <p className="mdoc-meta">Hartwell Supply · sent Tue Oct 13 · <span className="nb">acknowledged Wed Oct 14<Check /></span></p>
          <p className="mrow mrow-line">Wire shelving unit 48 in ·{' '}<br />12 × $189.00 = $2,268.00<span className="tie-end" /></p>
          <p className="mrow mrow-freight"><span>Freight</span><span>$96.00</span><span className="tie-end" /></p>
          <p className="mrow mrow-total"><b>Total</b><b>$2,364.00</b><span className="tie-end" /></p>
          <p className="mdoc-foot">Facilities · Columbus distribution center</p>
        </article>
        <article className="mdoc mdoc-receipts card" aria-label="Receipts for PO 3081">
          <p className="mdoc-title">Receipts</p>
          <Cursor who="Luis · Facilities" className="cursor-luis" />
          <p className="mrow mrow-r1"><span>Thu Oct 22, 10:30 am · Tasha Green ·</span><span className="r-count"><span className="ringed">10 of 12</span><span className="hand note-back">2 back-ordered</span></span></p>
          <p className="mrow mrow-r2"><span>Tue Oct 27, 10:40 am · Tasha Green ·</span><span className="r-count"><span className="r-two">2</span><span className="hand note-last">last 2 in<Check /></span></span></p>
          <p className="mrow mrow-r3"><b>12 of 12</b><Check /><span className="tie-start" /></p>
        </article>
        <article className="mdoc mdoc-invoice card" aria-label="Invoice HS-88412">
          <p className="mdoc-title">Invoice HS-88412</p>
          <p className="mdoc-meta">Hartwell Supply · Wed Oct 21 · PO 3081</p>
          <p className="mrow mrow-line"><span className="tie-in" />Wire shelving unit 48 in ·{' '}<br />12 × $189.00 = $2,268.00</p>
          <p className="mrow mrow-freight"><span className="tie-in" /><span>Freight</span><span>$96.00</span></p>
          <p className="mrow mrow-total"><span className="tie-in" /><b>Total</b><b>$2,364.00</b><Cursor who="Priya · AP" className="cursor-priya" /></p>
          <p className="mdoc-due">Due on receipt</p>
          <p className="read-chips"><span>PO number · read 0.97</span><span>Total · read 0.97</span></p>
        </article>
      </div>
      <ol className="match-results">{results.map((result, index) => <li key={index} className="card">{index > 0 && <Arrow className="arrow result-arrow" />}<span className="ok" aria-hidden="true"><Check /></span><span>{result}<Check /></span></li>)}</ol>
    </section>
  )
}
