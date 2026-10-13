import { EmptyRow, Sheet, SheetTitle } from './Sheet'

/** §1.8: the reviewed import batch before anything is written, and its one action. */
export function MoveInDrawing() {
  return (
    <Sheet className="drawing-movein" edge="holes" label="Review this exact batch: 48 rows, 2 duplicates, 0 rejected; Commit reviewed batch.">
      <SheetTitle>Review this exact batch</SheetTitle>
      <p className="batch-counts num">48 rows · 2 duplicates · 0 rejected</p>
      <div className="ruled ruled-three">
        {[0, 1, 2, 3, 4, 5].map(row => <EmptyRow key={row} cells={3} />)}
      </div>
      <p className="batch-action"><span className="batch-button">Commit reviewed batch</span></p>
    </Sheet>
  )
}
