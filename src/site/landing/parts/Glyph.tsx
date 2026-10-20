import type { ReactNode } from 'react'
// The four team glyphs, the desk's cut SVG set (imggen/struct-purse/glyphs) drawn inline: a cuffed tangelo glove for
// Operations, a roll-up banner stand for Marketing, a kingfisher microchip for Engineering, a pale-blue wire shelf for
// Facilities. Every team mark on the page is one of these; the team is always named beside it.
export type Team = 'operations' | 'marketing' | 'engineering' | 'facilities'
export const teamName: Record<Team, string> = { operations: 'Operations', marketing: 'Marketing', engineering: 'Engineering', facilities: 'Facilities' }

const art: Record<Team, ReactNode> = {
  operations: (
    <g stroke="#111" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
      <path fill="#fc5a00" d="M17 47 L17 37 L10 29 A3.6 3.6 0 0 1 15.6 24.4 L18 27 L18 13 A4 4 0 0 1 26 13 L26 20 L26 8 A4 4 0 0 1 34 8 L34 20 L34 10 A4 4 0 0 1 42 10 L42 21 L42 17 A3.5 3.5 0 0 1 49 17 L49 41 Q49 47 44 47 Z" />
      <path fill="#fc5a00" d="M14 46 H50 L52 59 H12 Z" />
      <path d="M13.2 52.5 H50.8" fill="none" strokeWidth="2.5" />
    </g>
  ),
  marketing: (
    <>
      <g stroke="#111" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        <rect fill="#fc5a00" x="19" y="7" width="26" height="45" />
        <path d="M16 6 H48" fill="none" />
        <rect fill="#d9dde3" x="13" y="52" width="38" height="7" rx="2" />
      </g>
      <circle cx="32" cy="22" r="6" fill="#fdf1dc" stroke="#111" strokeWidth="2" />
      <path d="M21 50 L32 34 L43 50 Z" fill="#0065dc" stroke="#111" strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  engineering: (
    <>
      <path d="M24 6 V14 M32 6 V14 M40 6 V14 M24 50 V58 M32 50 V58 M40 50 V58 M6 24 H14 M6 32 H14 M6 40 H14 M50 24 H58 M50 32 H58 M50 40 H58" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
      <rect x="14" y="14" width="36" height="36" rx="4" fill="#0065dc" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
      <rect x="23" y="23" width="18" height="18" rx="2" fill="#8fc0f5" stroke="#111" strokeWidth="2.5" />
    </>
  ),
  facilities: (
    <g stroke="#111" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 4 V52 M56 4 V52" strokeWidth="3" fill="none" />
      <g strokeWidth="2.5" fill="#8fc0f5">
        <path d="M8 18 L44 18 L56 11 L20 11 Z" />
        <path d="M8 36 L44 36 L56 29 L20 29 Z" />
        <path d="M8 54 L44 54 L56 47 L20 47 Z" />
      </g>
      <g strokeWidth="1.3" fill="none">
        <path d="M17 18 L29 11 M26 18 L38 11 M35 18 L47 11" />
        <path d="M17 36 L29 29 M26 36 L38 29 M35 36 L47 29" />
        <path d="M17 54 L29 47 M26 54 L38 47 M35 54 L47 47" />
      </g>
      <path d="M8 10 V61 M44 10 V61" strokeWidth="3" fill="none" />
    </g>
  ),
}

/** One team glyph; decorative, because the team is named in the text beside it. */
export function Glyph({ team, className = 'glyph' }: { team: Team; className?: string }) {
  return <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">{art[team]}</svg>
}
