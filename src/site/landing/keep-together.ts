// Line-break rules for the homepage's set text, applied to the rendered HTML's text (never inside tags): a time keeps
// its am/pm, a month its day, "10 of 12" and "3 × $1,489.00" stay whole, a number keeps its unit, "PO 3107" its number,
// a "·" separator never starts a line (it stays at the end of the line before), and a check keeps its word.
const months = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
const units = 'am|pm|boxes|rolls|pallets|laptops|engineers|desks|units|requests|deliveries|teams|team|POs|bills|lines|PO|chase|catalogs|scanners|network|LED|sample-kit|hand|new|past|fall|handheld|in|each|left|GB'
const rules: [RegExp, string][] = [
  [/ +·/g, ' ·'],
  [new RegExp(`\\b(${months}) +(\\d)`, 'g'), '$1 $2'],
  [/ (Co\.)/g, '\u00a0$1'],
  [/(\d+) +of +(\d+)/g, '$1 of $2'],
  [/(\d) +([×=]) +(?=[\d$])/g, '$1 $2 '],
  [new RegExp(`(\\d[\\d,.:]*) +(${units})\\b`, 'g'), '$1 $2'],
  [/\b(PO|Bill|GL|aisle|Q4|chase|most) +(?=\d|[a-z])/g, '$1 '],
]
// A done check never wraps alone: the word before it travels with it.
const check = /([^\s<>]+)(<svg class="check"[^]*?<\/svg>)/g
// A hyphenated word or code (re-sent, BOF-7731, 1WQK-3NVR-7HTD) never breaks at its hyphen.
const hyphenated = /[\w$@.]*\w-\w[\w-]*/g
const inText = (html: string) => html.split(/(<[^>]*>)/).map(part => part.startsWith('<') ? part : rules.reduce((value, [pattern, to]) => value.replace(pattern, to), part).replace(hyphenated, word => `<span class="nb">${word}</span>`)).join('')
/** Applies the rules to the page body only, so the head's title and description stay plain text. */
export function keepTogether(html: string): string {
  const at = html.indexOf('<body')
  return html.slice(0, at) + inText(html.slice(at)).replace(check, '<span class="nb">$1$2</span>')
}
