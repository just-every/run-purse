import { Bars, Sheet, SheetTitle, Stamp } from './Sheet'

/** §1.2: the revision history form; v2 carries the approval stamp. */
export function RevisionDrawing() {
  return (
    <Sheet className="drawing-revision" dups={['pink']} label="Revision history: version 1, then version 2, approved at revision 2.">
      <SheetTitle>Revision history</SheetTitle>
      <ol className="revisions">
        <li><span className="rev-dot" aria-hidden="true" /><span className="rev-name">v1</span><span className="rev-box"><Bars count={3} /></span></li>
        <li className="rev-current"><span className="rev-dot" aria-hidden="true" /><span className="rev-name">v2</span><span className="rev-box"><Bars count={3} /><Stamp>Approved · revision 2</Stamp></span></li>
      </ol>
    </Sheet>
  )
}
