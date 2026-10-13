import type { ReactNode } from 'react'

export type SectionProps = { id: string; heading: string; body: string; drawing: ReactNode; children?: ReactNode }

/** One section: a heading and a line or two at left, its drawing at right; on a phone, heading, body, then the drawing. */
export function Section({ id, heading, body, drawing, children }: SectionProps) {
  return (
    <section id={id} className="band" aria-labelledby={`${id}-title`}>
      <div className="band-copy">
        <h2 id={`${id}-title`}>{heading}</h2>
        <p className="band-body">{body}</p>
        {children}
      </div>
      {drawing}
    </section>
  )
}
