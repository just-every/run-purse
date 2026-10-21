import type { ReactNode } from 'react'
/** A section's eyebrow (stage · teams · date, in kingfisher caps), its two-line slab heading (line one ink, line two
 *  tangelo) and its body line. */
export function SectionHead({ id, eyebrow, line1, line2, children, className = '' }: { id: string; eyebrow: ReactNode; line1: ReactNode; line2: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={`section-head ${className}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-title`}><span className="l1">{line1}</span> <span className="l2">{line2}</span></h2>
      {children && <p className="lead">{children}</p>}
    </header>
  )
}
