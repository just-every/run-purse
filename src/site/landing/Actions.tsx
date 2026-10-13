/** "Run Purse →" (to /run) and "Read the docs", then the licence line: the hero's and the closing band's actions. */
export function Actions() {
  return (
    <>
      <div className="actions">
        <a className="btn" href="/run">Run Purse <span className="arrow" aria-hidden="true">→</span></a>
        <a className="text-link" href="/docs">Read the docs</a>
      </div>
      <p className="small-print">Free and open source, MIT licensed.</p>
    </>
  )
}
