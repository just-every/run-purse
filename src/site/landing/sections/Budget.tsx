import { Glyph, type Team } from '../parts/Glyph'
import { Check, Done } from '../parts/icons'
import { SectionHead } from '../parts/SectionHead'
import '../styles/budget.css'

// Each half of PO 3108 against its own Q4 line, the bar drawn to scale (actual, committed, this request, left).
const halves: { team: Team; label: string; budget: string; total: number; parts: [string, number][]; left: string; approver: string; channel: string; time: string; dot: string }[] = [
  { team: 'marketing', label: 'Marketing', budget: 'Marketing Q4 office & equipment', total: 8000, parts: [['actual', 2100], ['committed', 900], ['this', 1648]], left: '$3,352.00', approver: 'Carla Mendes', channel: 'Slack', time: '10:20 am', dot: 'tang' },
  { team: 'engineering', label: 'Engineering', budget: 'Engineering Q4 equipment', total: 40000, parts: [['actual', 18600], ['committed', 14287], ['this', 1648]], left: '$5,465.00', approver: 'Sam Okafor', channel: 'Teams', time: '10:31 am', dot: '' },
]
const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 })
const tapes = [
  { title: <>Ana’s booth kit · <span className="nb">Marketing Q4 events</span></>, sum: <>$60,000.00 − $41,200.00 − $3,940.00 = <span className="nb">$14,860.00 left<Check /></span></>, foot: <>Carla Mendes · Slack · <Done>9:58 am</Done></> },
  { title: <>Nikhil’s laptops · <span className="nb">Engineering Q4 equipment</span></>, sum: <span className="nb">$7,113.00 left<Check /></span>, foot: <>Sam Okafor · Teams · <Done>10:12 am</Done></> },
  { title: <>Kim’s gloves · <span className="nb">Columbus operating supplies</span></>, foot: <><span>Ray Dawson · phone · <Done>9:38 am</Done></span><span>PO 3104 9:41 am</span></> },
]

/** 04 · Budget & approval: Luis's desk request forks into its Marketing and Engineering halves, each checked against its
 *  own budget (bars to scale) and decided by its own head, rejoining at PO 3108; "Same morning" carries three receipt
 *  tapes of the other budgets checked that morning. Outcomes, never a walkthrough. */
export function Budget() {
  return (
    <section id="budget" className="budget wrap" aria-labelledby="budget-title">
      <aside className="budget-tapes" aria-labelledby="budget-tapes-title">
        <h3 id="budget-tapes-title">Same morning</h3>
        <ul>{tapes.map((tape, index) => <li key={index} className="tape card"><p className="tape-title">{tape.title}</p>{tape.sum && <p className="tape-sum">{tape.sum}</p>}<p className="tape-foot">{tape.foot}</p></li>)}</ul>
      </aside>
      <div className="budget-main">
        <SectionHead id="budget" className="centred" eyebrow="Budget & approval · Facilities for Marketing and Engineering · Mon Oct 19, CT" line1="Eight desks, two teams." line2="Each half on its own budget.">
          Luis split the Austin desks evenly. Each half was checked against its own team’s budget and decided by that team’s head, one in Slack and one in Teams.
        </SectionHead>
        <div className="budget-request card">
          <span className="dot" aria-hidden="true" />
          <Glyph team="facilities" />
          <div>
            <p><b className="slab">Luis Ortega</b> · <b className="slab">Facilities</b> · <b>web · 9:14 am</b></p>
            <p>Austin standing desks · Brazos Office Furniture</p>
            <p>8 × $412.00 = $3,296.00 · split equally</p>
          </div>
        </div>
        <div className="budget-fork" aria-hidden="true" />
        <div className="budget-halves">
          {halves.map(half => {
            const used = half.parts.reduce((sum, [, n]) => sum + n, 0)
            return (
              <div key={half.team} className={`half half-${half.team}`}>
                <Glyph team={half.team} className="glyph half-glyph" />
                <p className="half-label"><b>{half.label}</b> · 50% · $1,648.00 · <span className="nb">GL 6430 Furniture</span></p>
                <div className="half-budget card">
                  <p className="half-name"><span className={`dot ${half.dot}`} aria-hidden="true" /><b>{half.budget} · {money(half.total)}</b></p>
                  <div className="bar" role="img" aria-label={`${half.budget}: actual, committed, this request and what is left, to scale`}>
                    {half.parts.map(([kind, n]) => <span key={kind} className={`bar-${kind}`} style={{ width: `${(n / half.total) * 100}%` }} />)}
                    <span className="bar-left" style={{ width: `${((half.total - used) / half.total) * 100}%` }} />
                  </div>
                  <p className="half-sums">{half.parts.map(([kind, n]) => <span key={kind}>{kind} {money(n)} · </span>)}<span className="nb">left {half.left}<Check /></span></p>
                </div>
                <p className="half-approver card"><span className={`dot ${half.dot}`} aria-hidden="true" /><span><b>{half.approver}</b> · {half.channel} · <Done>{half.time}</Done></span></p>
              </div>
            )
          })}
        </div>
        <div className="budget-join" aria-hidden="true" />
        <p className="budget-po card"><span className="dot" aria-hidden="true" /><span><b>10:33 am</b> · <b>PO 3108 sent to Brazos Office Furniture</b> · <b>one line, two codings</b><Check /></span></p>
        <p className="budget-note">Each half went to its own team’s head, because the desks are coded to two departments.</p>
      </div>
    </section>
  )
}
