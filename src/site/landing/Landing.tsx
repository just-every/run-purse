import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { Actions } from './Actions'
import { MoveInDrawing } from './drawings/MoveInDrawing'
import { Hero } from './Hero'
import { Section } from './Section'
import { sections } from './sections'
import './landing.css'
import './drawings/drawings.css'

const steps = ['Run it on your computer', 'Move in from CSV', 'Invite your team']

/** The run site's homepage (run-purse.com): the hero, the sections in order, "Try it beside what you have" with the
 *  closing band beside its drawing, and the footer. Static; no script. */
export function Landing() {
  return (
    <>
      <SiteHeader />
      <main id="top" className="landing">
        <Hero />
        {sections.map(section => <Section key={section.id} {...section} />)}
        <section id="try" className="band band-try" aria-labelledby="try-title">
          <div className="band-copy">
            <h2 id="try-title">Try it beside what you have.</h2>
            <p className="band-body">Move in from a CSV. Preview every row before it's written, and undo anything you haven't touched.</p>
            <ol className="steps">{steps.map((step, index) => <li key={step}><span className="step-disc" aria-hidden="true">{index + 1}</span>{step}</li>)}</ol>
          </div>
          <MoveInDrawing />
          <div className="closing">
            <h2>Every purchase, accounted for.</h2>
            <Actions />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
