import { Bay, type Delivery } from '../drawings/Bay'
import { Glyph, teamName, type Team } from '../parts/Glyph'
import { Check, Done } from '../parts/icons'
import { SectionHead } from '../parts/SectionHead'
import '../styles/receiving.css'

// The Columbus dock, Thu Oct 22 (CT): nine POs, Operations 3, Marketing 2, Engineering 2, Facilities 2.
const bays: { po: string; team: Team; supplier: string; what: string; time: string; kind: Delivery; open?: string }[] = [
  { po: '3099', team: 'operations', supplier: 'Central Ohio Pallet', what: '120 pallets', time: '7:05 am', kind: 'pallets' },
  { po: '3104', team: 'operations', supplier: 'Amazon Business', what: '40 boxes nitrile gloves', time: '7:20 am', kind: 'gloves' },
  { po: '3105', team: 'operations', supplier: 'Uline', what: '24 rolls stretch wrap, 10 rolls pallet labels', time: '8:10 am', kind: 'wrap' },
  { po: '3090', team: 'marketing', supplier: 'Buckeye Print Co.', what: '2,000 fall catalogs', time: '8:45 am', kind: 'catalogs' },
  { po: '3093', team: 'engineering', supplier: 'Midwest Barcode Supply', what: '6 handheld scanners', time: '9:15 am', kind: 'scanners' },
  { po: '3106', team: 'engineering', supplier: 'Midwest Network Supply', what: '1 network switch', time: '9:50 am', kind: 'switch' },
  { po: '3081', team: 'facilities', supplier: 'Hartwell Supply', what: 'shelving 10 of 12', time: '10:30 am', kind: 'shelving', open: '2 back-ordered' },
  { po: '3096', team: 'facilities', supplier: 'Scioto Electric Supply', what: '24 LED high-bay lights', time: '12:40 pm', kind: 'lights' },
  { po: '3102', team: 'marketing', supplier: 'Packwell', what: '1,500 sample-kit mailers', time: '1:25 pm', kind: 'mailers' },
]

/** 07 · Receiving: Tasha's 7:00 am prompt, a strict 3 × 3 grid of yellow-marked dock bays (one delivery each, drawn as
 *  it arrives, over its shipping label), the receive card for PO 3081 and the Austin strip. */
export function Receiving() {
  return (
    <section id="receiving" className="receiving wrap" aria-labelledby="receiving-title">
      <SectionHead id="receiving" eyebrow="Receiving · Columbus dock and Austin office · Thu Oct 22, CT" line1="Nine deliveries, four teams." line2="Checked in at one dock.">
        Tasha scanned each delivery against its PO at the Columbus dock. Hartwell’s truck brought 10 of 12 shelving units, and Purse kept the last 2 open on the PO.
      </SectionHead>
      <p className="dock-prompt card"><span className="dot" aria-hidden="true" /><b>7:00 am · Tasha Green prompted: 9 POs due at Columbus today</b></p>
      <ol className="dock-bays">
        {bays.map(bay => (
          <li key={bay.po} className="bay">
            <Bay kind={bay.kind} />
            <div className="bay-label card">
              <Glyph team={bay.team} />
              <div>
                <p><b>PO {bay.po} · {teamName[bay.team]}</b></p>
                <p>{bay.supplier}</p>
                <p>{bay.what} · {bay.open ? <span className="nb">{bay.time}</span> : <Done>{bay.time}</Done>}</p>
                {bay.open && <p><span className="pill">{bay.open}</span></p>}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="receive-card card" aria-label="Receive PO 3081">
        <p className="receive-title"><Glyph team="facilities" /><span>Receive · PO 3081 · <span className="nb">Hartwell Supply</span></span></p>
        <p>Wire shelving unit 48 in · ordered 12</p>
        <p>Scanned 10 boxes · received 10 · open 2</p>
        <p className="done receive-saved">Saved 10:32 am<Check /></p>
      </div>
      <div className="dock-foot card">
        <p><span className="dot" aria-hidden="true" /><b>Austin office</b> · Megan Foster · PO 3108 desks 8 of 8 <Done>11:05 am</Done> · PO 3109 booth kit <Done>1:30 pm</Done> · PO 3107 laptops 3 of 3 <Done>2:10 pm</Done></p>
        <p className="dock-total">Columbus 9 of 9 deliveries checked in · <span className="nb">Austin 3 of 3<Check /></span></p>
      </div>
    </section>
  )
}
