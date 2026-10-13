import { Bars, Sheet, SheetTitle } from './Sheet'

/** §1.3: the printed MIT licence, its grant highlighted. */
export function LicenceDrawing() {
  return (
    <Sheet className="drawing-licence" dups={['cream']} edge="plain" label="The MIT License: permission is hereby granted, free of charge.">
      <div className="licence-frame">
        <SheetTitle>MIT License</SheetTitle>
        <div className="licence-lines"><Bars count={3} /></div>
        <p className="licence-grant">Permission is hereby granted, free of charge</p>
        <div className="licence-lines"><Bars count={2} /></div>
      </div>
    </Sheet>
  )
}
