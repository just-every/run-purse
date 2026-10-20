import type { CSSProperties, ReactNode } from 'react'
import { Glyph } from '../parts/Glyph'
import { Check } from '../parts/icons'
import { SectionHead } from '../parts/SectionHead'
import '../styles/supplier.css'

// Mon Oct 19 – Wed Oct 21, CT: Lone Star Displays from Ana's Slack proposal to its acknowledged PO 3109.
const days = [
  { day: 'Mon Oct 19', events: [['9:06 am', 'Ana proposed Lone Star in Slack · no match by name, domain or website'], ['9:58 am', <>Carla Mendes approved $3,940.00<Check /></>], ['10:02 am', 'onboarding link sent to Dale Hughes'], ['3:40 pm', 'Lone Star submitted this form']] },
  { day: 'Tue Oct 20', events: [['9:10 am', <>Priya Shah called Dale back on the quote’s number<Check /></>], ['9:40 am', <>signed off by Renee Coleman and Priya Shah · active<Check /></>], ['9:41 am', <>PO 3109 sent once<Check /></>]] },
  { day: 'Wed Oct 21', events: [['8:15 am', 'Lone Star acknowledged PO 3109 · delivery Thu Oct 22']] },
] as const
const record = ['W-9 signed · EIN ••-•••4417', 'Plaid name match', 'OFAC list · no match', 'Duplicate check · none']

/** A filled, read-only field of the onboarding form as Lone Star submitted it: hairline, never a thick box. */
function Field({ label, value }: { label?: string; value: ReactNode }) {
  return <div className="field">{label && <span className="field-label">{label}</span>}<span className="field-value"><span>{value}</span><Check /></span></div>
}

/** 05 · New supplier: Lone Star's own onboarding form (the object), the three-day rail beside it and the supplier
 *  record under it. The supplier does its own paperwork; people verify it overnight. */
export function Supplier() {
  return (
    <section id="supplier" className="supplier wrap" aria-labelledby="supplier-title">
      <SectionHead id="supplier" eyebrow="New supplier · Marketing · Lone Star Displays · Mon Oct 19 – Wed Oct 21, CT" line1="New supplier on Monday." line2="Its PO out on Tuesday.">
        Ana named Lone Star Displays in Slack. Lone Star filled in its own W-9 and bank details, AP verified them, and PO 3109 went out the minute the supplier was active.
      </SectionHead>
      <div className="onboarding card" aria-label="Lone Star’s onboarding form, as submitted">
        <p className="onboarding-title">Supplier onboarding · Redbud Outdoor Co.</p>
        <p className="onboarding-sub">Invited by Jordan Ellis · filled in by Dale Hughes, Lone Star Displays · no account needed</p>
        <ol className="onboarding-steps">
          <li><p className="step-name"><span className="step-num">1</span>Business</p><Field label="Legal name" value="Lone Star Displays LLC" /><Field label="Address" value="Dallas, TX" /></li>
          <li><p className="step-name"><span className="step-num">2</span>W-9</p><Field label="EIN" value="••-•••4417" /><Field label="Tax classification" value="LLC" /><p className="certified"><span className="tick-box" aria-hidden="true"><Check /></span><span>Certified and e-signed by Dale Hughes<Check /></span></p></li>
          <li><p className="step-name"><span className="step-num">3</span>Bank for ACH remittance</p><Field value="Connected with Plaid · account holder Lone Star Displays LLC" /></li>
          <li><p className="step-name"><span className="step-num">4</span>Certificate of insurance</p><Field value={<><svg className="doc-icon" viewBox="0 0 20 24" aria-hidden="true"><path d="M3 1.5h9l5 5V22.5H3z M12 1.5v5h5 M6.5 12h7 M6.5 15.5h7 M6.5 19h4" fill="none" stroke="#3b4652" strokeWidth="1.5" strokeLinejoin="round" /></svg>COI.pdf · valid to Jun 30, 2027</>} /></li>
        </ol>
        <p className="onboarding-submit"><span className="submit-used">Submit</span><span className="done">Submitted Mon Oct 19, 3:40 pm<Check /></span></p>
      </div>
      <div className="supplier-side">
      <ol className="supplier-rail">
        {days.map(day => (
          <li key={day.day}>
            <h3>{day.day}</h3>
            <ul>{day.events.map(([time, text]) => <li key={time}><time>{time}</time> · {text}</li>)}</ul>
          </li>
        ))}
      </ol>
      <div className="supplier-record card">
        <div className="record-head">
          <span className="dot" aria-hidden="true" />
          <div>
            <p className="record-name">Lone Star Displays LLC · <span className="nb">Dallas, TX</span></p>
            <p className="record-added"><span>added Tue Oct 20 · Marketing</span><Glyph team="marketing" /></p>
          </div>
        </div>
        <ul>{[...record, 'Remit by ACH'].map((line, index) => <li key={line}><span className="ok" aria-hidden="true"><Check /></span><span>{line}{index < record.length && <Check />}</span></li>)}</ul>
      </div>
      </div>
    </section>
  )
}
