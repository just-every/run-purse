import type { ReactNode } from 'react'
// The page's two drawn symbols, so they match at every size whatever the text face carries: the done check (kelly
// green, beside "received", "matched" and the like) and the arrow on actions and strips. Decorative: the words carry it.
export function Check({ className = 'check' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.6 8.6 6.2 12 13.6 3.8" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
export function Arrow({ className = 'arrow' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 10h12.5M11 4.8 16.2 10 11 15.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
/** A done fact: green text with its check, kept on one line with the last word. */
export function Done({ children }: { children: ReactNode }) {
  return <span className="done">{children}<Check /></span>
}
