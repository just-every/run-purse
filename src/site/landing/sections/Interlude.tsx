import { Check } from '../parts/icons'
import { Plate } from '../parts/Plate'
import '../styles/scenes.css'

/** 09 · Interlude: inside the Columbus distribution center on Tue Oct 27, the shelving finished; a vignette that fades
 *  to white on every side, with its one tag set as HTML. */
export function Interlude() {
  return (
    <section id="interlude" className="interlude" aria-label="Tue Oct 27 in Columbus, aisle 14">
      <div className="scene-frame">
        <Plate className="scene-art" name="interlude" widths={[768, 1152, 1536, 2304, 3072]} sizes="(max-width: 1440px) 100vw, 1440px" width={1536} height={1024} alt="Inside Redbud’s Columbus distribution center: a Facilities technician tightens a new wire shelving unit while an Operations picker stocks the shelves." />
        <p className="scene-tag card"><span className="dot" aria-hidden="true" /><span>Tue Oct 27 · Columbus · aisle 14 · <span className="nb">12 of 12 shelving units up<Check /></span></span></p>
      </div>
    </section>
  )
}
