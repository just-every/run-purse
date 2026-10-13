import { licenceUrl, repository } from './repository'
import { Wordmark } from './Wordmark'

/** Purse and its tagline; Docs · Source · MIT licence. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-bar">
        <div className="site-footer-brand">
          <Wordmark />
          <p>Purchasing, with a clear record.</p>
        </div>
        <nav aria-label="Footer">
          <a href="/docs">Docs</a>
          <a href={repository}>Source</a>
          <a href={licenceUrl}>MIT licence</a>
        </nav>
      </div>
    </footer>
  )
}
