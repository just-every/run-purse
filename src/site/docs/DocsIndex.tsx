import { DocsFrame } from './DocsFrame'
import { docsPath } from './DocsNav'
import { docsLead, docsSections } from './pages'

/** The docs home at /docs: the title, a short lead, and each section's pages as form-sheet cards in reading order. */
export function DocsIndex() {
  return (
    <DocsFrame>
      <header className="docs-page-head">
        <p className="docs-eyebrow">Purse</p>
        <h1 className="docs-title">Docs</h1>
        <p className="docs-lead">{docsLead}</p>
      </header>
      {docsSections.map((section, index) => (
        <section className="docs-index-section" key={section.title} aria-labelledby={`docs-section-${index}`}>
          <h2 className="docs-index-title" id={`docs-section-${index}`}>{section.title}</h2>
          <ul className="docs-index-grid">
            {section.pages.map(page => (
              <li key={page.slug}>
                <a className="docs-card" href={docsPath(page.slug)}><span className="docs-card-title">{page.title}{'\u00a0'}<span aria-hidden="true">→</span></span><span className="docs-card-summary">{page.summary}</span></a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </DocsFrame>
  )
}
