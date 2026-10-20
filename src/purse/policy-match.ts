import { extended, type Data } from './types';
/** The authority policies that cover a request, cheapest limit first: the server's
 * submit and approval rule, also read by the request thread's budget chips. */
export function coveringPolicies(list: Data[], r: Data) { return list.filter(p => p.active && p.currency === r.currency && p.limitMinor >= r.totalMinor && r.lines.every((l: Data) => (p.category === '*' || p.category === l.category) && (p.project === '*' || p.project === l.project))).sort((a, b) => a.limitMinor - b.limitMinor || a.id.localeCompare(b.id)); }
/** What approving the current revision reserves: the total, less lines already received or cancelled. */
export function approvalAmount(r: Data) { const base = r.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0), remaining = r.lines.reduce((n: number, l: Data) => n + extended(l.q - (l.carriedAccepted ?? 0) - (l.carriedCancelled ?? 0), l.unitMinor), 0); return base ? Number((BigInt(r.totalMinor) * BigInt(remaining) + BigInt(base) / 2n) / BigInt(base)) : (r.lines.some((l:Data)=>l.q>(l.carriedAccepted??0)+(l.carriedCancelled??0))?r.totalMinor:0); }
