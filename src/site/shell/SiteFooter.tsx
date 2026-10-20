import { licenceUrl, repository } from './repository'
import { Wordmark } from './Wordmark'

/** The set-type footer: the mark, "Purse" and its line; Docs, Contract, Source and the MIT licence. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-bar">
        <div className="site-footer-brand">
          <Wordmark />
          <p>Free, open source procurement software</p>
        </div>
        <nav aria-label="Footer">
          <a href="/docs">Docs</a>
          <a href="/contract">Contract</a>
          <a href={repository}>Source</a>
          <a className="site-footer-licence" href={licenceUrl}>MIT licensed</a>
        </nav>
      </div>
    </footer>
  )
}
