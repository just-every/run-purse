import type { ReactNode } from 'react'

type Dup = 'pink' | 'cream'

/**
 * One drawing: a printed form sheet with its duplicate copies offset beneath. `edge` is the order book's perforated top,
 * a punched left margin, or a plain sheet. The figure carries the drawing's accessible label; every string is real text.
 */
export function Sheet({ label, className, dups = ['pink', 'cream'], edge = 'perforated', children }: { label: string; className: string; dups?: Dup[]; edge?: 'perforated' | 'holes' | 'plain'; children: ReactNode }) {
  return (
    <figure className={`drawing ${className}`} aria-label={label}>
      <div className="stack">
        {dups.map(dup => <span key={dup} className={`dup dup-${dup}`} aria-hidden="true" />)}
        <div className={`sheet sheet-${edge}`}>{children}</div>
      </div>
    </figure>
  )
}

/** The form's title row: the form name in spaced rose capitals, and its number at right. */
export function SheetTitle({ children, number }: { children: string; number?: string }) {
  return <p className="sheet-title"><span>{children}</span>{number ? <span className="sheet-no">{number}</span> : null}</p>
}

/** The rose approval stamp. */
export function Stamp({ children }: { children: string }) {
  return <span className="stamp">{children}</span>
}

/** Grey bars standing in for an empty ruled row's text. */
export function Bars({ count }: { count: number }) {
  return <>{Array.from({ length: count }, (_, i) => <i key={i} className="bar" aria-hidden="true" />)}</>
}

/** An empty ruled row: one grey bar per column. */
export function EmptyRow({ cells }: { cells: number }) {
  return <div className="ruled-row ruled-empty" aria-hidden="true">{Array.from({ length: cells }, (_, i) => <span key={i}><i className="bar" /></span>)}</div>
}
