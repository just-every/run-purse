import { Sheet } from './Sheet'

/** §1.7: the Overview's three cards on one sheet. */
export function OwedDrawing() {
  return (
    <Sheet className="drawing-owed" edge="plain" label="Outstanding commitments AUD 18,420.00; awaiting approval 3; overdue receiving PO-000011.">
      <dl className="owed">
        <div className="owed-card owed-main"><dt>Outstanding commitments</dt><dd className="num">AUD 18,420.00</dd></div>
        <div className="owed-card"><dt>Awaiting approval</dt><dd className="num">3</dd></div>
        <div className="owed-card"><dt>Overdue receiving</dt><dd className="num">PO-000011</dd></div>
      </dl>
    </Sheet>
  )
}
