import type { CSSProperties, ReactNode } from 'react'
import { Glyph, teamName, type Team } from '../parts/Glyph'
import { Done } from '../parts/icons'
import { SectionHead } from '../parts/SectionHead'
import '../styles/intake.css'

type Tick = { time: string; team: Team; channel: string; card?: { side: 'left' | 'right'; drop?: number; who: string; channel: string; lines: ReactNode[] } }

// Mon Oct 19, 9:00–11:00 am CT: the 14 requests (Operations 5, Marketing 3, Engineering 3, Facilities 3; phone 3,
// Slack 4, Teams 2, web 5). Four open into cards; `drop` lowers a card below its tick (in rows) so cards never meet.
const ticks: Tick[] = [
  { time: '9:02', team: 'operations', channel: 'phone', card: { side: 'left', who: 'Kim Nguyen, Operations', channel: 'Phone', lines: ['copied her Oct 5 glove order', 'Amazon Business · 40 boxes nitrile gloves × $24.50 = $980.00', <Done>PO 3104 sent 9:41 am</Done>] } },
  { time: '9:06', team: 'marketing', channel: 'Slack', card: { side: 'right', who: 'Ana Ruiz, Marketing', channel: 'Slack', lines: ['booth kit for the Gulf Coast Outdoor Expo', 'Lone Star Displays · $3,940.00', <span className="pill">new supplier proposed</span>] } },
  { time: '9:14', team: 'facilities', channel: 'web', card: { side: 'left', drop: 2.9, who: 'Luis Ortega, Facilities', channel: 'Web', lines: ['Austin standing desks 8 × $412.00 = $3,296.00', 'split Marketing $1,648.00 / Engineering $1,648.00'] } },
  { time: '9:21', team: 'engineering', channel: 'Teams', card: { side: 'right', drop: 3.3, who: 'Nikhil Rao, Engineering', channel: 'Teams', lines: ['3 laptops for hires starting Mon Nov 2 · $4,467.00', <Done>approved by 10:12 am</Done>] } },
  { time: '9:27', team: 'operations', channel: 'web' },
  { time: '9:33', team: 'marketing', channel: 'web' },
  { time: '9:40', team: 'engineering', channel: 'Teams' },
  { time: '9:48', team: 'facilities', channel: 'phone' },
  { time: '9:55', team: 'operations', channel: 'Slack' },
  { time: '10:08', team: 'engineering', channel: 'web' },
  { time: '10:19', team: 'marketing', channel: 'Slack' },
  { time: '10:31', team: 'operations', channel: 'phone' },
  { time: '10:44', team: 'facilities', channel: 'web' },
  { time: '10:57', team: 'operations', channel: 'Slack' },
]
const teams: Team[] = ['operations', 'marketing', 'engineering', 'facilities']

/** 02 · Intake: a kingfisher ribbon from 9:00 to 11:00 with all 14 requests at their times, four opened into cards
 *  that alternate left and right. Under 1181 px it is the 390 plan: one ribbon down the left edge, the cards in it. */
export function Intake() {
  return (
    <section id="intake" className="intake wrap" aria-labelledby="intake-title">
      <SectionHead id="intake" className="centred" eyebrow="Intake · Operations, Marketing, Engineering, Facilities · Mon Oct 19, 9–11 am CT" line1="Fourteen requests by 11 am." line2="Four teams, four ways in.">
        A phone, Slack, Teams and the web. Every request landed in one stream, coded to its team and budget.
      </SectionHead>
      <div className="intake-legend">
        <ul className="intake-teams">{teams.map(team => <li key={team}><Glyph team={team} />{teamName[team]}</li>)}</ul>
        <p className="intake-channels">phone · Slack · Teams · web</p>
      </div>
      <div className="ribbon">
        <p className="ribbon-end">9:00</p>
        <ol className="ribbon-ticks">
          {ticks.map(tick => (
            <li key={tick.time} className={tick.card ? `tick has-card card-${tick.card.side}` : 'tick'} style={tick.card?.drop ? { '--drop': tick.card.drop } as CSSProperties : undefined}>
              <span className="tick-dot" aria-hidden="true" />
              <span className="tick-label"><time>{tick.time}</time><Glyph team={tick.team} /><span>{teamName[tick.team]} · {tick.channel}</span></span>
              {tick.card && (
                <div className="intake-card card">
                  <span className="intake-lead" aria-hidden="true" />
                  <Glyph team={tick.team} className="glyph intake-glyph" />
                  <div>
                    <p className="intake-who"><b>{tick.card.channel}</b> · <b>{tick.card.who}</b></p>
                    {tick.card.lines.map((line, index) => <p key={index}>{line}</p>)}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
        <p className="ribbon-end">11:00</p>
      </div>
      <p className="intake-total card"><b>14 requests</b> · Operations 5 · Marketing 3 · Engineering 3 · Facilities 3 · <Done>first PO out 9:41 am</Done></p>
    </section>
  )
}
