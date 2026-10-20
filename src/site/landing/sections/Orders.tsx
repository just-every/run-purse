import type { CSSProperties, ReactNode } from 'react'
import { Glyph, type Team } from '../parts/Glyph'
import { Arrow, Check, Done } from '../parts/icons'
import { SectionHead } from '../parts/SectionHead'
import '../styles/orders.css'

// PO 3107's email thread, Mon Oct 19 – Thu Oct 22 (CT); the tangelo slip is the agent's one chase.
const slips: { dot: string; when: ReactNode; text: ReactNode; chase?: boolean }[] = [
  { dot: '', when: 'Mon 10:14 am', text: <>sent from purchasing@redbudoutdoor.example · PDF and acknowledgment link</> },
  { dot: 'pale', when: '10:40 am', text: 'opened' },
  { dot: 'tang', when: 'Tue 10:15 am', chase: true, text: <>unacknowledged after a day · chase 1 of 3 by the agent: “Can you acknowledge PO 3107 with a delivery date? It’s needed by Wed Oct 28.”</> },
  { dot: 'pale', when: '10:58 am', text: <>Kevin Marsh, Keystone Tech: “Sorry, missed it. 3 in stock, shipping Wed by FedEx.”</> },
  { dot: 'green', when: '11:02 am', text: <>acknowledged on the link · <Done>promised Thu Oct 22</Done></> },
  { dot: '', when: '11:03 am', text: <>agent to Nikhil in Teams: “Keystone acknowledged PO 3107. Arriving Thu Oct 22.”</> },
  { dot: 'green', when: 'Wed', text: <>FedEx tracking added · Thu 1:55 pm delivered · <Done>2:10 pm received by Megan Foster</Done></> },
]
const tickets: { po: string; team: Team; for: string; lines: string[]; done: string }[] = [
  { po: 'PO 3104', team: 'operations', for: 'Operations', lines: ['Amazon Business', 'sent by cXML Mon 9:41 am'], done: 'confirmed 9:42 am' },
  { po: 'PO 3108', team: 'facilities', for: 'Facilities for Marketing and Engineering', lines: ['Brazos Office Furniture', 'acknowledged Mon 1:20 pm'], done: 'promised Thu Oct 22' },
  { po: 'PO 3109', team: 'marketing', for: 'Marketing', lines: ['Lone Star Displays', 'acknowledged Wed 8:15 am'], done: 'promised Thu Oct 22' },
  { po: 'PO 3081', team: 'facilities', for: 'Facilities', lines: ['Hartwell Supply', 'sent Tue Oct 13', 'acknowledged Wed Oct 14'], done: 'promised Thu Oct 22' },
]

/** 06 · Orders: PO 3107 as Keystone Tech receives it, its email thread clipped to its edge with the agent's one chase,
 *  and four PO tickets, one per team. POs actually sent and acknowledged; the agent follows through. */
export function Orders() {
  return (
    <section id="orders" className="orders wrap" aria-labelledby="orders-title">
      <SectionHead id="orders" eyebrow="Orders · Engineering, Operations, Marketing, Facilities · Mon Oct 19 – Thu Oct 22, CT" line1="Every PO sent and acknowledged." line2="One took a nudge.">
        Each PO went out from Redbud’s own address with a link to acknowledge it. Keystone stayed quiet on the laptops, so the agent chased once and Nikhil had a date by 11:03.
      </SectionHead>
      <article className="po-doc" aria-label="Purchase order 3107">
        <p className="po-company">Redbud Outdoor Co.</p>
        <p className="po-number"><b>Purchase order 3107</b> · Mon Oct 19</p>
        <p className="po-block"><b>To</b> Keystone Tech, order desk<br /><b>Ship to</b> Redbud Outdoor Co., Austin office</p>
        <p className="po-block">KT-L14-32 · Laptop 14-inch, 32 GB ·<br />3 × $1,489.00 = $4,467.00</p>
        <p className="po-block"><b>Need by</b> Wed Oct 28 · Net 30</p>
        <p className="po-total"><b>Total</b><b className="po-sum">$4,467.00</b></p>
        <p className="po-ack">Acknowledge this order <Arrow /></p>
      </article>
      <div className="po-thread">
        <ol>
          {slips.map((slip, index) => (
            <li key={index} className={slip.chase ? 'slip card chase' : 'slip card'}>
              <span className={`dot ${slip.dot}`} aria-hidden="true" />
              <p><b>{slip.when}</b> · {slip.text}</p>
            </li>
          ))}
        </ol>
        <p className="po-note hand">1 chase, answered by 11:02</p>
        <p className="po-settings">Chases turned on by Jordan Ellis, buyer · 1 a day, at most 3</p>
      </div>
      <ul className="po-tickets">
        {tickets.map(ticket => (
          <li key={ticket.po} className="ticket card">
            <Glyph team={ticket.team} />
            <div>
              <p className="ticket-po">{ticket.po}</p>
              <p className="ticket-for">{ticket.for}</p>
              {ticket.lines.map(line => <p key={line}>{line}</p>)}
              <p className="done">{ticket.done}<Check /></p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
