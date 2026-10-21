import { Glyph } from '../parts/Glyph'
import { Arrow, Check } from '../parts/icons'
import { SectionHead } from '../parts/SectionHead'
import '../styles/request.css'

const thread = [
  { time: '9:16 am', who: 'Nikhil Rao', text: 'Need laptops for three new engineers starting Mon Nov 2.' },
  { time: '9:16 am', who: 'Purse agent', text: 'Engineering’s catalog laptop is the Keystone Tech 14-inch, 32 GB at $1,489.00, the one on Engineering’s last 4 orders. Same one? Monitors too?' },
  { time: '9:17 am', who: 'Nikhil Rao', text: 'Same laptop. They have monitors.' },
  { time: '9:18 am', who: 'Purse agent', text: 'Draft ready. Review and submit when it looks right.' },
]

/** 03 · Request: Nikhil's Teams thread at left, the agent's draft at right with the three sources that back its
 *  fields in the gutter, each tied by a leader to its row, and the 9:21 → 10:12 → 10:14 strip. The agent finds, codes and drafts; Nikhil submits. */
export function Request() {
  return (
    <section id="request" className="request wrap" aria-labelledby="request-title">
      <SectionHead id="request" className="request-head" eyebrow="Request · Engineering · Mon Oct 19, 9:16–9:21 am CT" line1="“Laptops for three new engineers.”" line2="A draft in two minutes.">
        Nikhil asked in Teams. The agent found the laptop Engineering always buys, coded it and showed who would decide. Nikhil submitted.
      </SectionHead>
      <div className="request-thread card" aria-label="Microsoft Teams thread">
        <p className="request-thread-head"><Glyph team="engineering" /><span><b>Engineering</b> · Teams · Nikhil Rao</span></p>
        <ol>
          {thread.map((message, index) => (
            <li key={index} className={message.who === 'Purse agent' ? 'bubble agent' : 'bubble'}>
              <p className="bubble-meta">{message.time} · {message.who}</p>
              <p>{message.text}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="request-draft card">
        <p className="draft-title"><Glyph team="engineering" /><span>Draft · <span className="nb">Nikhil Rao · Engineering</span></span></p>
        <p className="draft-row draft-line"><span className="draft-tie" aria-hidden="true" />3 × Laptop 14-inch, 32 GB · KT-L14-32 · Keystone Tech · <span className="nb">$1,489.00 each = <b>$4,467.00</b></span><span className="src src-above"><span className="dot" aria-hidden="true" /><span>catalog item KT-L14-32</span></span><span className="src src-below"><span className="dot" aria-hidden="true" /><span>4 past orders, Aug 3 – Oct 5</span></span></p>
        <p className="draft-row">GL 6420 Computer equipment · <span className="nb"><Glyph team="engineering" /> Engineering</span> · Austin office</p>
        <p className="draft-row draft-need"><span className="draft-tie" aria-hidden="true" />Need by Wed Oct 28 · ship to Austin office<span className="src src-mid"><span className="dot" aria-hidden="true" /><span>start date in your message, Mon Nov 2</span></span></p>
        <p className="draft-row">Budget: <span className="nb"><Glyph team="engineering" /> Engineering Q4 equipment</span> · <span className="nb">fits<Check /></span></p>
        <p className="draft-row">Decides: Sam Okafor · <span className="nb"><Glyph team="engineering" /> Engineering,</span> under $5,000</p>
      </div>
      <ol className="request-strip">
        <li className="card"><span className="dot green" aria-hidden="true" /><span>9:21 am · submitted by Nikhil<Check /></span></li>
        <li className="card"><Arrow className="arrow strip-arrow" /><span className="dot green" aria-hidden="true" /><span>10:12 am · Sam Okafor approved in Teams<Check /></span></li>
        <li className="card"><Arrow className="arrow strip-arrow" /><span className="dot pale" aria-hidden="true" /><span>10:14 am · PO 3107 sent to Keystone Tech</span></li>
      </ol>
    </section>
  )
}
