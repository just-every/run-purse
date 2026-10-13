import { Actions } from './Actions'
import { HeroOrder } from './drawings/HeroOrder'

/** The hero (SPEC §1.1): headline, subhead, the "100% free" line, the actions, and the purchase order drawing. */
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title">Every purchase, accounted for.</h1>
        <p className="hero-sub">Follow every purchase from request to invoice. Know what's approved, ordered and still to arrive.</p>
        <p className="hero-free">100% free, open source alternative to <strong>Procurify</strong>, <strong>Precoro</strong> and <strong>Coupa</strong></p>
        <Actions />
      </div>
      <HeroOrder />
    </section>
  )
}
