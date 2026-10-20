// Line-break rules for the homepage's set text, applied to the rendered HTML's text (never inside tags): a time keeps
// its am/pm, a weekday its date or time, a month its day, "10 of 12" and "3 × $1,489.00" stay whole, a number keeps its
// unit, "PO 3107" its number, a label ("this", "left", "invoice", "Marketing") its amount, and a check keeps its word.
// Each "·" separator stays with the word before it, wrapped as `.sep`, so a line can only break after it; the page's
// one script hides a separator that a break leaves at a line's end, so no line ends on a dangling "·".
const months = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
const units = 'am|pm|boxes|rolls|pallets|laptops|engineers|desks|units|requests|deliveries|teams|team|POs|bills|lines|PO|chase|catalogs|scanners|network|LED|sample-kit|hand|new|past|fall|handheld|in|each|left|GB|received'
const rules: [RegExp, string][] = [
  [new RegExp(`\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) +(?=(${months}) |\\d)`, 'g'), '$1 '],
  [new RegExp(`\\b(${months}) +(\\d)`, 'g'), '$1 $2'],
  [/ (Co\.)/g, ' $1'],
  [/(\d+) +of +(\d+)/g, '$1 of $2'],
  [/(\S) +([×=]) +(?=[\d$])/g, '$1 $2 '],
  [/(\d) +× +/g, '$1 × '],
  [/ +− +(?=\$)/g, ' − '],
  [new RegExp(`(\\d[\\d,.:]*) +(${units})\\b`, 'g'), '$1 $2'],
  [/\b(PO|Bill|GL|aisle|Q4|chase|most) +(?=\d|[a-z])/g, '$1 '],
  [/\b(this|left|actual|committed|invoice|billed|received|ordered|open|differences|Operations|Marketing|Engineering|Facilities) +(?=[\d$])/g, '$1 '],
  [/([A-Za-z:]) +(?=\$\d)/g, '$1 '],
]
// A done check never wraps alone: the word before it travels with it.
const check = /([^\s<>]+)(<svg class="check"[^]*?<\/svg>)/g
// A hyphenated word or code (re-sent, BOF-7731, 1WQK-3NVR-7HTD) never breaks at its hyphen.
const hyphenated = /[\w$@.]*\w-\w[\w-]*/g
const separator = / +· +/g
const inText = (html: string) => html.split(/(<[^>]*>)/).map(part => part.startsWith('<') ? part : rules.reduce((value, [pattern, to]) => value.replace(pattern, to), part).replace(hyphenated, word => `<span class="nb">${word}</span>`).replace(separator, '<span class="sep"> ·</span> ')).join('')

// The page's one script: after layout, on font load and on resize, a separator whose next word starts a lower line
// is hidden (it keeps its width, so hiding it never moves a word). Without script the page reads the same, with the dot.
const dropSeparators = `<script>(()=>{const seps=[...document.getElementsByClassName('sep')];const next=s=>{const w=document.createTreeWalker(document.body,5);w.currentNode=s;for(let n,i=0;(n=w.nextNode())&&i<60;i++){if(s.contains(n))continue;if(n.nodeType===1){if(n.localName==='svg')return n.getBoundingClientRect();continue}const k=n.nodeValue.search(/\\S/);if(k<0)continue;const r=document.createRange();r.setStart(n,k);r.setEnd(n,k+1);return r.getBoundingClientRect()}};const run=()=>{const ends=seps.map(s=>{const a=s.getBoundingClientRect(),b=next(s);return !!b&&b.height>0&&b.top+b.height/2>a.bottom});seps.forEach((s,i)=>s.classList.toggle('sep-end',ends[i]))};run();document.fonts.ready.then(run);addEventListener('load',run);let f=0;addEventListener('resize',()=>{cancelAnimationFrame(f);f=requestAnimationFrame(run)})})()</script>`

/** Applies the rules to the page body only, so the head's title and description stay plain text, and adds the script
 *  that drops a separator left at a line's end. */
export function keepTogether(html: string): string {
  const at = html.indexOf('<body')
  return (html.slice(0, at) + inText(html.slice(at)).replace(check, '<span class="nb">$1$2</span>')).replace('</body>', `${dropSeparators}</body>`)
}
