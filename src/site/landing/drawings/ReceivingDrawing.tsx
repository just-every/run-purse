import { EmptyRow, Sheet, SheetTitle } from './Sheet'

/** §1.4: the order's lines as received: 12 ordered, 8 accepted, 4 outstanding. */
export function ReceivingDrawing() {
  return (
    <Sheet className="drawing-receiving" label="Receiving: standing desks, 12 ordered, 8 accepted, 4 outstanding.">
      <SheetTitle>Receiving</SheetTitle>
      <div className="ruled ruled-four">
        <div className="ruled-row ruled-head"><span>Line</span><span>Ordered</span><span>Accepted</span><span>Outstanding</span></div>
        <div className="ruled-row ruled-filled"><span>Standing desks</span><span className="num">12</span><span className="num">8</span><span className="num">4</span></div>
        {[0, 1, 2].map(row => <EmptyRow key={row} cells={4} />)}
      </div>
    </Sheet>
  )
}
