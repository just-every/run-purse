import { repository } from './repository'
import { Wordmark } from './Wordmark'

/** The run site's header: the mark and wordmark home, then Docs · Contract · Source in kingfisher. */
export function SiteHeader({ current, className = 'site-header' }: { current?: 'docs'; className?: string }) {
  return (
    <header className={className}>
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
