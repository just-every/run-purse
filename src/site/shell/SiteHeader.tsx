import { repository } from './repository'
import { Wordmark } from './Wordmark'

/** The run site's header: the wordmark home, then Docs, Contract and Source, over a 1px rule the width of the content. */
export function SiteHeader({ current }: { current?: 'docs' }) {
  return (
    <header className="site-header">
      <div className="site-bar">
        <Wordmark />
        <nav aria-label="Site">
          <a href="/docs" aria-current={current === 'docs' ? 'page' : undefined}>Docs</a>
          <a href="/contract">Contract</a>
          <a href={repository}>Source</a>
        </nav>
      </div>
    </header>
  )
}
