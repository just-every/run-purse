import { docsPath } from './DocsNav'
import type { DocsPageMeta } from './types'

/** The previous and next pages in reading order, as two sheet cards. */
export function DocsPager({ previous, next }: { previous?: DocsPageMeta; next?: DocsPageMeta }) {
  if (!previous && !next) return null
  return (
    <nav className="docs-pager" aria-label="Previous and next pages">
      {previous && <a className="docs-card docs-pager-previous" href={docsPath(previous.slug)} rel="prev"><span className="docs-pager-label">← Previous</span><span className="docs-pager-title">{previous.title}</span></a>}
      {next && <a className="docs-card docs-pager-next" href={docsPath(next.slug)} rel="next"><span className="docs-pager-label">Next →</span><span className="docs-pager-title">{next.title}</span></a>}
    </nav>
  )
}
