import { SiteFooter } from '../shell/SiteFooter'
import './styles/base.css'
import { Books } from './sections/Books'
import { Budget } from './sections/Budget'
import { Closing } from './sections/Closing'
import { Hero } from './sections/Hero'
import { Intake } from './sections/Intake'
import { Interlude } from './sections/Interlude'
import { Match } from './sections/Match'
import { Orders } from './sections/Orders'
import { Receiving } from './sections/Receiving'
import { Request } from './sections/Request'
import { Supplier } from './sections/Supplier'
import { Switching } from './sections/Switching'

/** The run site's homepage (run-purse.com), page-s1: Redbud Outdoor Co.'s four teams through two weeks of buying,
 *  one stage per section (intake, request, budget, new supplier, orders, receiving, the match and hold, the interlude,
 *  the books, the switch), the closing and the footer. Static; no script. */
export function Landing() {
  return (
    <>
      <main id="top" className="landing">
        <Hero />
        <Intake />
        <Request />
        <Budget />
        <Supplier />
        <Orders />
        <Receiving />
        <Match />
        <Interlude />
        <Books />
        <Switching />
        <Closing />
      </main>
      <SiteFooter />
    </>
  )
}
