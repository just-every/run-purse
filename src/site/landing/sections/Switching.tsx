import { Glyph } from '../parts/Glyph'
import { Check } from '../parts/icons'
import { SectionHead } from '../parts/SectionHead'
import '../styles/switching.css'

// The one start line every Run Edit Run page shows, and the alternative for people who already have Node.
const START = 'curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-purse'
const ALTERNATIVE = 'Already have Node 22 or later? npx -y @runeditrun/rer dev just-every/run-purse'

/** A command that wraps only between words, keeping the installer's `install.sh | sh` together. */
function command(line: string) {
  return line.split(/(\S*install\.sh \| sh|\S+)/).map((part, index) => {
    const pipe = /^(.*\/)(install\.sh \| sh)$/.exec(part)
    if (pipe) return <span key={index}><span className="nb">{pipe[1]}</span><wbr /><span className="nb">{pipe[2]}</span></span>
    return part.trim() ? <span key={index} className="nb">{part}</span> : part
  })
}

const before = [<>Tue Sep 22<br />issued in Procurify</>, <>Wed Sep 23<br />acknowledged</>, <>Tue Sep 29<br />8 of 20 received</>]
const after = [<>Thu Oct 8 · 12 received at Columbus in Purse · <span className="nb">20 of 20<Check /></span></>, <>Fri Oct 9 · Uline invoice 7719320, $4,380.00, matched to <span className="nb">PO 3052<Check /></span></>, <>Bill linked to the QuickBooks PO Procurify had synced · one PO in <span className="nb">QuickBooks<Check /></span></>]

/** 11 · Switching: PO 3052's life as one strip crossing the dashed Sat Oct 3 line, grey in Procurify and kingfisher in
 *  Purse; what came over, the other sources, and the one-line start in the page's only dark card. */
export function Switching() {
  return (
    <section id="switching" className="switching wrap" aria-labelledby="switching-title">
      <SectionHead id="switching" eyebrow="Switching · Operations and the controller · Sat Oct 3, CT" line1="Switched mid-order from Procurify." line2="Open POs kept their numbers.">
        Renee moved Redbud on a Saturday with 31 POs still open. Each kept its number and its QuickBooks link, and no supplier got an order twice.
      </SectionHead>
      <div className="switch">
        <p className="switch-label"><b>Sat Oct 3 · switched to Purse</b></p>
        <p className="switch-po card"><Glyph team="operations" /><span><b>PO 3052 · Operations · Uline</b> · 20 hand trucks × $219.00 = $4,380.00</span></p>
        <p className="switch-adopted">Adopted Sat Oct 3 · same number · not re-sent · 12 still to come</p>
        <div className="switch-line">
          <div className="switch-side was"><p className="switch-side-name">in Procurify</p><ol>{before.map((event, index) => <li key={index}>{event}</li>)}</ol></div>
          <div className="switch-side now"><p className="switch-side-name">in Purse</p><ol>{after.map((event, index) => <li key={index}>{event}</li>)}</ol></div>
        </div>
      </div>
      <div className="switch-foot">
        <p><span className="dot" aria-hidden="true" /><span>Came over: 31 open POs, none re-sent · suppliers, approval routes, Q4 budgets and their history · Purse numbering began at 3061, Mon Oct 5</span></p>
        <p><span className="dot tang" aria-hidden="true" /><span>Also moves in from Coupa, Precoro and spreadsheets.</span></p>
        <div className="terminal" aria-label="Start Purse on your computer">
          <span className="terminal-lights" aria-hidden="true"><i /><i /><i /></span>
          <pre><code><span className="prompt" aria-hidden="true">$ </span>{command(START)}{'\n'}<span className="comment"><span aria-hidden="true"># </span>{command(ALTERNATIVE)}</span>{'\n'}<span className="ready">✓ Purse is ready</span></code></pre>
        </div>
      </div>
    </section>
  )
}
