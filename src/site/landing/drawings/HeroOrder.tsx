import { Callout } from './Callout'
import { EmptyRow, Sheet, SheetTitle, Stamp } from './Sheet'

/** The hero drawing (SPEC §1.1): purchase order PO-000014 torn from a numbered order book, with three callouts. */
export function HeroOrder() {
  return (
    <Sheet className="drawing-hero" label="Purchase order PO-000014: standing desks times 12, AUD 5,148.00, approved at revision 2, 12 accepted, 0 outstanding.">
      <SheetTitle number="PO-000014">Purchase order</SheetTitle>
      <div className="ruled ruled-hero">
        <div className="ruled-row ruled-head"><span>Description</span><span>Quantity</span><span /></div>
        <div className="ruled-row ruled-filled">
          <span className="callout-anchor">Standing desks ×&nbsp;12<Callout n={1} /></span>
          <span className="num">12</span>
          <span className="num">AUD 5,148.00</span>
        </div>
        {[0, 1, 2, 3].map(row => <EmptyRow key={row} cells={3} />)}
      </div>
      <div className="hero-foot">
        <div className="hero-box hero-box-stamp callout-anchor"><Callout n={2} /><Stamp>Approved · revision 2</Stamp></div>
        <dl className="hero-box hero-box-received">
          <div><dt>Accepted</dt><dd className="num">12</dd></div>
          <div className="callout-anchor"><dt>Outstanding</dt><dd className="num heaviest">0</dd><Callout n={3} side="right" /></div>
        </dl>
      </div>
    </Sheet>
  )
}
