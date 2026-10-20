import type { CSSProperties } from 'react'
import { Arrow, Done } from '../parts/icons'
import { Plate } from '../parts/Plate'
import { SiteHeader } from '../../shell/SiteHeader'
import '../styles/hero.css'

/** The two shelf pictograms on PO 3081's card: the units that came, and the two still to come (dashed). */
function Shelves() {
  const shelf = (dashed: boolean) => (
    <svg viewBox="0 0 30 44" aria-hidden="true" focusable="false"><g fill="none" stroke="#8a9097" strokeWidth="1.6" strokeDasharray={dashed ? '3 2.2' : undefined} strokeLinecap="round"><path d="M3 2v40M27 2v40M3 6h24M3 17h24M3 28h24M3 39h24" /><path d="M7 6 11 2M13 6l4-4M19 6l4-4" /></g></svg>
  )
  return <span className="hero-shelves">{shelf(false)}{shelf(true)}</span>
}

// The phone crops of each scene (canvas units of its plate, 640 or 578 × 1024): the dock as two crops, so its painted
// carton labels ("Operations / nitrile gloves", "Facilities / wire shelving") draw at 13 px or more at 390.
const crops = {
  dock: { width: 640, boxes: [[18, 300, 316, 286], [176, 726, 316, 286]] },
  office: { width: 578, boxes: [[96, 84, 482, 560]] },
} as const

const cards = [
  { id: 'dock', scene: 'dock', dot: '', lines: [<><b>Columbus dock</b> · <b>Thu Oct 22</b></>, '9 deliveries for 4 teams'] },
  { id: 'gloves', scene: 'dock', dot: 'tang', lines: [<><b>PO 3104</b> · <b>Operations</b></>, <b className="soft">Amazon Business</b>, <>40 boxes nitrile gloves ×</>, '$24.50 = $980.00', <Done>received</Done>] },
  { id: 'shelving', scene: 'dock', dot: 'pale', lines: [<><b>PO 3081</b> · <b>Facilities</b></>, 'Hartwell Supply', 'shelving 10 of 12', <span className="pill">2 back-ordered</span>], extra: <Shelves /> },
  { id: 'booth', scene: 'office', dot: 'tang', lines: [<><b>PO 3109</b> · <b>Marketing</b></>, 'Lone Star Displays', 'booth kit $3,940.00', <Done>received</Done>] },
  { id: 'laptops', scene: 'office', dot: '', lines: [<><b>PO 3107</b> · <b>Engineering</b></>, 'Keystone Tech', '3 laptops × $1,489.00 = $4,467.00', <span className="chased">unacknowledged <Arrow /> chased Tue Oct 20 <Arrow /></span>, <Done>received</Done>] },
] as const

function HeroCard({ card }: { card: (typeof cards)[number] }) {
  return (
    <li className={`hero-card card hc-${card.id}`}>
      <span className={`dot ${card.dot}`} aria-hidden="true" />
      <span className="hero-card-text">{card.lines.map((line, index) => <span key={index} className="hero-card-line">{line}</span>)}</span>
      {'extra' in card && card.extra}
    </li>
  )
}

/**
 * The approved hero B: the Columbus dock and the Austin office on Thu Oct 22 around the white centre column. The plate
 * is 12ui's clean redraw of hero-1536.png (no text); the header, headline, subhead, the free line, the actions and the
 * five cards are HTML. From 1280 px the section is the image's own 1536 × 1024 canvas (--u is one canvas pixel) with
 * every piece at its drawn place; narrower, the copy comes first and the two scenes follow, each with its own cards; phones show the scenes as
 * full-width crops under the cards.
 */
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-canvas">
        <Plate className="hero-plate" name="hero" widths={[768, 1152, 1536, 2304, 3072]} sizes="100vw" width={1536} height={1024} eager />
        <SiteHeader className="site-header hero-header" />
        <div className="hero-copy">
          <h1 id="hero-title"><span>Every team’s</span> <span>purchases,</span> <span className="l2">request to payment.</span></h1>
          <p className="hero-sub">Purse takes every team’s requests, holds them to budget, sends and chases each PO, and matches every invoice to its order and delivery before syncing it to your books.</p>
          <p className="hero-free">100% free, open source alternative to <span className="names"><strong>Procurify</strong>, <strong>Coupa</strong> and <strong>Precoro</strong></span></p>
          <div className="hero-actions">
            <a className="btn" href="/run">Run Purse <Arrow /></a>
            <span className="hero-links">
              <a className="text-link" href="https://demo.run-purse.com/">Try the demo</a>
              <a className="text-link" href="/docs">Read the docs</a>
            </span>
          </div>
        </div>
        {(['dock', 'office'] as const).map(scene => (
          <div key={scene} className={`hero-scene hero-scene-${scene}`}>
            <Plate className="hero-scene-art" name={`hero-${scene}`} widths={scene === 'dock' ? [400, 640, 960, 1280] : [400, 580, 870, 1156]} sizes="46vw" width={scene === 'dock' ? 640 : 578} height={1024} />
            {crops[scene].boxes.map(([x, y, w, h]) => (
              <div key={y} className="hero-crop" style={{ '--iw': crops[scene].width, '--x': x, '--y': y, '--w': w, '--h': h } as CSSProperties}>
                <Plate name={`hero-${scene}`} widths={scene === 'dock' ? [400, 640, 960, 1280] : [400, 580, 870, 1156]} sizes={`${Math.ceil(crops[scene].width / w * 100)}vw`} width={crops[scene].width} height={1024} />
              </div>
            ))}
            <ul className="hero-cards" aria-label={scene === 'dock' ? 'Columbus dock, Thu Oct 22' : 'Austin office, Thu Oct 22'}>
              {cards.filter(card => card.scene === scene).map(card => <HeroCard key={card.id} card={card} />)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
