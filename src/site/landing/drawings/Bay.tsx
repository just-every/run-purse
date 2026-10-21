import type { ReactNode } from 'react'

// One dock bay of 07 as a ligne-claire drawing: a grey floor marked in safety yellow, and the delivery in the form it
// arrives, drawn in oblique projection (front face, top receding up and right). One ink line, flat kraft fills.
export type Delivery = 'pallets' | 'gloves' | 'wrap' | 'catalogs' | 'scanners' | 'switch' | 'shelving' | 'lights' | 'mailers'

const INK = '#1d2126'
const KRAFT = { front: '#d8a467', top: '#ebc58f', side: '#c08a4c' }
const DX = 0.55, DY = 0.42

/** A box with its front-bottom-left corner at (x, y): width w, height h, depth d. */
function box(key: string, x: number, y: number, w: number, h: number, d: number, opts: { ghost?: boolean; label?: boolean; fill?: typeof KRAFT; tape?: boolean } = {}): ReactNode {
  const dx = d * DX, dy = d * DY, f = opts.fill ?? KRAFT
  const stroke = opts.ghost ? { stroke: '#5b636b', strokeDasharray: '4 3', fill: 'rgba(255,255,255,0.65)' } : { stroke: INK }
  const pt = (points: number[][]) => points.map(p => p.join(',')).join(' ')
  return (
    <g key={key} strokeWidth="1.4" strokeLinejoin="round">
      <polygon points={pt([[x, y - h], [x + w, y - h], [x + w + dx, y - h - dy], [x + dx, y - h - dy]])} fill={opts.ghost ? stroke.fill : f.top} stroke={stroke.stroke} strokeDasharray={stroke.strokeDasharray} />
      <polygon points={pt([[x + w, y], [x + w + dx, y - dy], [x + w + dx, y - h - dy], [x + w, y - h]])} fill={opts.ghost ? stroke.fill : f.side} stroke={stroke.stroke} strokeDasharray={stroke.strokeDasharray} />
      <rect x={x} y={y - h} width={w} height={h} fill={opts.ghost ? stroke.fill : f.front} stroke={stroke.stroke} strokeDasharray={stroke.strokeDasharray} />
      {opts.tape && !opts.ghost && <path d={`M${x + w / 2 + dx / 2} ${y - h - dy / 2}l${-dx / 2} ${dy / 2}`} stroke="#f6dfb8" strokeWidth="3" />}
      {opts.label && !opts.ghost && h > 14 && <g><rect x={x + w * 0.62} y={y - h + h * 0.18} width={Math.min(14, w * 0.28)} height={Math.min(16, h * 0.5)} fill="#fff" stroke={INK} strokeWidth="0.8" /><path d={`M${x + w * 0.62 + 3} ${y - h + h * 0.18 + 4}v${Math.min(16, h * 0.5) - 7}m3 0v${-(Math.min(16, h * 0.5) - 7)}m2 0v${Math.min(16, h * 0.5) - 7}m3 0v${-(Math.min(16, h * 0.5) - 7)}`} stroke={INK} strokeWidth="1" /></g>}
    </g>
  )
}
/** A wooden pallet: a thin slatted box. */
function pallet(key: string, x: number, y: number, w: number, d: number): ReactNode {
  const wood = { front: '#c99559', top: '#e3b77c', side: '#b07e45' }
  return <g key={key}>{box(key + 'p', x, y, w, 6, d, { fill: wood })}<path d={`M${x + w * 0.18} ${y - 1}v-4M${x + w / 2} ${y - 1}v-4M${x + w * 0.82} ${y - 1}v-4`} stroke={INK} strokeWidth="2.4" /></g>
}
/** A roll of stretch wrap standing on end. */
function roll(key: string, cx: number, y: number, r: number, h: number): ReactNode {
  const ry = r * 0.42
  return (
    <g key={key} stroke={INK} strokeWidth="1.4">
      <path d={`M${cx - r} ${y - h}v${h}a${r} ${ry} 0 0 0 ${2 * r} 0v${-h}`} fill="#f4f6f8" />
      <path d={`M${cx - r * 0.55} ${y - h + ry * 0.8}v${h - ry}`} stroke="#d0d6dc" strokeWidth="3" />
      <ellipse cx={cx} cy={y - h} rx={r} ry={ry} fill="#fff" />
      <ellipse cx={cx} cy={y - h} rx={r * 0.32} ry={ry * 0.32} fill="#f0a35e" />
    </g>
  )
}

const floor = (
  <g>
    <polygon points="14,150 286,150 250,92 50,92" fill="#d7dbe0" />
    <polygon points="14,150 286,150 250,92 50,92" fill="none" stroke="#fccb17" strokeWidth="5" strokeLinejoin="round" />
  </g>
)

function load(kind: Delivery): ReactNode[] {
  switch (kind) {
    case 'pallets': return [0, 1, 2].flatMap(s => Array.from({ length: s === 1 ? 11 : 10 }, (_, i) => pallet(`p${s}-${i}`, 52 + s * 66 - (s === 1 ? 4 : 0), 138 - (s === 1 ? 8 : 0) - i * 8, 58, 44)))
    case 'gloves': return [box('g1', 112, 140, 72, 40, 46, { label: true, tape: true }), box('g2', 112, 100, 72, 40, 46, { label: true, tape: true })]
    case 'wrap': return [roll('r1', 88, 130, 15, 72), roll('r2', 120, 130, 15, 72), roll('r3', 104, 140, 15, 72), roll('r4', 136, 140, 15, 72), box('w5', 170, 140, 50, 40, 36, { label: true, tape: true })]
    case 'catalogs': return [0, 1, 2].flatMap(row => [box(`c${row}a`, 92, 140 - row * 32, 54, 32, 40, { label: true }), box(`c${row}b`, 146, 140 - row * 32, 54, 32, 40, { label: true })])
    case 'scanners': return [box('s1', 108, 140, 82, 62, 52, { label: true, tape: true })]
    case 'switch': return [box('n1', 96, 136, 104, 24, 48, { label: true })]
    case 'shelving': return [
      pallet('sp1', 30, 140, 116, 50), pallet('sp2', 150, 140, 116, 50),
      ...[0, 1, 2, 3, 4].map(i => box(`sa${i}`, 30, 134 - i * 11, 116, 11, 50)),
      ...[0, 1, 2, 3, 4].map(i => box(`sb${i}`, 150, 134 - i * 11, 116, 11, 50)),
      box('sga', 30, 79, 116, 11, 50, { ghost: true }), box('sgb', 150, 79, 116, 11, 50, { ghost: true }),
    ]
    case 'lights': return [box('l1', 92, 140, 56, 38, 42, { label: true }), box('l2', 148, 140, 56, 38, 42, { label: true }), box('l3', 92, 102, 56, 38, 42, { label: true }), box('l4', 148, 102, 56, 38, 42, { label: true })]
    case 'mailers': return [0, 1, 2].map(i => box(`m${i}`, 96, 140 - i * 26, 110, 26, 46, { label: true }))
  }
}

/** The bay drawing, decorative: the label card under it names the delivery. */
export function Bay({ kind }: { kind: Delivery }) {
  return <svg className="bay-art" viewBox="0 0 300 160" aria-hidden="true" focusable="false">{floor}{load(kind)}</svg>
}
