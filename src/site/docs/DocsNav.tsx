import { docsSections } from './pages'

const path = (slug: string) => (slug ? `/docs/${slug}` : '/docs')

/** The sections and their pages, the current one marked. `idPrefix` keeps the sidebar's and the phone menu's ids apart. */
function DocsNavList({ current, idPrefix }: { current?: string; idPrefix: string }) {
  return (
    <>
      {docsSections.map((section, index) => (
        <div className="docs-nav-group" key={section.title}>
          <p className="docs-nav-section" id={`${idPrefix}-${index}`}>{section.title}</p>
          <ul aria-labelledby={`${idPrefix}-${index}`}>
            {section.pages.map(page => (
              <li key={page.slug}><a href={path(page.slug)} aria-current={page.slug === current ? 'page' : undefined}>{page.title}</a></li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

/** The section navigation beside the page on wide screens. On the docs home "All docs" is current. */
export function DocsSidebar({ current }: { current?: string }) {
  return (
    <nav className="docs-sidebar" aria-label="Docs">
      <a className="docs-sidebar-home" href="/docs" aria-current={current === undefined ? 'page' : undefined}>All docs</a>
      <DocsNavList current={current} idPrefix="docs-sidebar" />
    </nav>
  )
}

/** The same navigation on phones: one disclosure that opens the whole list (no script needed). */
export function DocsMenu({ current, label }: { current: string; label: string }) {
  return (
    <nav className="docs-menu" aria-label="Docs menu">
      <details>
        <summary><span>Docs menu</span><span className="docs-menu-current">{label}</span></summary>
        <div className="docs-menu-list"><a className="docs-sidebar-home" href="/docs">All docs</a><DocsNavList current={current} idPrefix="docs-menu" /></div>
      </details>
    </nav>
  )
}

export { path as docsPath }
