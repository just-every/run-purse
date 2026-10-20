import { Glyph, teamName, type Team } from '../parts/Glyph'
import { Arrow, Check } from '../parts/icons'
import { Plate } from '../parts/Plate'
import '../styles/scenes.css'

const teams: { team: Team; first: string; second: string }[] = [
  { team: 'marketing', first: 'Booth up in Houston ·', second: 'Thu Nov 12' },
  { team: 'engineering', first: '3 new engineers ·', second: 'laptops ready Mon Nov 2' },
  { team: 'facilities', first: '12 of 12 shelving units ·', second: '8 of 8 desks' },
  { team: 'operations', first: '40 boxes of gloves ·', second: 'on the shelves in aisle 14' },
]

/** 12 · Closing: Redbud's booth at the Gulf Coast Outdoor Expo in Houston on Thu Nov 12 (a vignette), four team cards
 *  over its fading foot with their lines at one size, the promise and the actions; the footer follows. */
export function Closing() {
  return (
    <section id="closing" className="closing" aria-labelledby="closing-title">
      <div className="scene-frame closing-frame">
        <Plate className="scene-art" name="closing" widths={[768, 1152, 1536, 2304, 3072]} sizes="(max-width: 1440px) 100vw, 1440px" width={1536} height={548} alt="Redbud’s booth at the Gulf Coast Outdoor Expo in Houston before the doors open: the curved backwall, two banner stands, tents and packs, Ana setting out catalogs." />
      </div>
      <ul className="closing-cards wrap">
        {teams.map(card => <li key={card.team} className="card"><Glyph team={card.team} /><div><p className="closing-team">{teamName[card.team]}</p><p>{card.first}</p><p>{card.second}<Check /></p></div></li>)}
      </ul>
      <div className="closing-copy wrap">
        <h2 id="closing-title"><span className="l1">Every team, supplied.</span> <span className="l2">October, closed clean.</span></h2>
        <p className="closing-free">100% free and open source. MIT licensed.</p>
        <p className="closing-actions"><a className="btn" href="/run">Run Purse <Arrow /></a><a className="text-link" href="/docs">Read the docs</a></p>
      </div>
    </section>
  )
}
