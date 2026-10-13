/** A numbered rose disc joined to its target by a rose line ending in a dot. Decorative: the figure's label says it all. */
export function Callout({ n, side = 'left' }: { n: number; side?: 'left' | 'right' }) {
  return (
    <span className={`callout callout-${side}`} aria-hidden="true">
      <span className="callout-disc">{n}</span>
      <span className="callout-line" />
    </span>
  )
}
