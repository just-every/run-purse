import { Sheet, SheetTitle } from './Sheet'

/** §1.6: two supplied quotes side by side; the freight one supplier left out says Missing. */
export function QuotesDrawing() {
  return (
    <Sheet className="drawing-quotes" edge="holes" label="Quote comparison: Northside Office Supply AUD 5,148.00 with AUD 120.00 freight, delivery 2026-10-20; Deskworks AUD 4,980.00, freight missing, delivery 2026-10-27.">
      <SheetTitle>Quote comparison</SheetTitle>
      <div className="ruled ruled-quotes">
        <div className="ruled-row ruled-head"><span>Supplier</span><span>Price</span><span>Freight</span><span>Delivery</span></div>
        <div className="ruled-row ruled-filled"><span>Northside Office Supply</span><span className="num">AUD 5,148.00</span><span className="num">AUD 120.00</span><span className="num">2026-10-20</span></div>
        <div className="ruled-row ruled-filled"><span>Deskworks</span><span className="num">AUD 4,980.00</span><span className="missing-ink">Missing</span><span className="num">2026-10-27</span></div>
      </div>
    </Sheet>
  )
}
