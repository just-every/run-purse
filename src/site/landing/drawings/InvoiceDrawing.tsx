import { Sheet, SheetTitle } from './Sheet'

const checks = ['Price difference', 'Quantity mismatch', 'Receipt shortfall']

/** §1.5: an invoice matched to its order lines with no difference, and the accounting CSV ready to download. */
export function InvoiceDrawing() {
  return (
    <Sheet className="drawing-invoice" edge="plain" label="Invoice matched: no price difference, no quantity mismatch, no receipt shortfall; purse-accounting.csv.">
      <SheetTitle>INVOICE DISCREPANCIES</SheetTitle>
      <dl className="checks">
        {checks.map(check => <div key={check}><dt>{check}</dt><dd>—</dd></div>)}
      </dl>
      <p className="file-tag">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16.5h12" /></svg>
        purse-accounting.csv
      </p>
    </Sheet>
  )
}
