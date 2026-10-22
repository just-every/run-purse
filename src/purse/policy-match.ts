import { extended, type Data } from './types';
import { budgetCoding, budgetScopeMatches, selectBudgetPolicy } from './budget-dimensions';
/** Select dated financial custody by specificity, then amount authority. Legacy
 * undated policies retain their limit order. Shared by submission and reads. */
export function coveringPolicies(list: Data[], r: Data) {
 const candidates=list.filter(p => p.active && p.currency===r.currency && p.limitMinor>=r.totalMinor
  && r.lines.every((line:Data)=>budgetScopeMatches(p,r,{...budgetCoding(r,line),costCentre:r.costCentre})
   && (p.project==='*'||(line.allocations??[]).every((split:Data)=>split.project===p.project))));
 const dated=candidates.filter(policy=>policy.budgetPeriod), primary=selectBudgetPolicy(dated);
 return [...(primary?[primary]:[]),...candidates.filter(policy=>policy!==primary).sort((a,b)=>a.limitMinor-b.limitMinor||a.id.localeCompare(b.id))];
}
/** What approving the current revision reserves: the total, less lines already received or cancelled. A blanket
 * PO's total is a cap that invoices draw down instead: the cap less cancelled lines and the billedMinor already invoiced. */
export function approvalAmount(r: Data, billedMinor = 0) { if (r.poDetails?.blanket) return Math.max(0, blanketCap(r) - billedMinor); const base = r.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0), remaining = r.lines.reduce((n: number, l: Data) => n + (l.service ? Math.max(0, l.totalMinor - (l.carriedAcceptedMinor ?? 0) - (l.carriedCancelledMinor ?? 0)) : extended(l.q - (l.carriedAccepted ?? 0) - (l.carriedCancelled ?? 0), l.unitMinor)), 0); return base ? Number((BigInt(r.totalMinor) * BigInt(remaining) + BigInt(base) / 2n) / BigInt(base)) : (r.lines.some((l:Data)=>l.q>(l.carriedAccepted??0)+(l.carriedCancelled??0))?r.totalMinor:0); }
/** A blanket PO's cap net of cancelled lines, in proportion to its total (each line's carried cancellations unless given). */
export function blanketCap(r: Data, cancelled: (line: Data) => number = (l: Data) => l.carriedCancelled ?? 0) { const base = r.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0), cancelledMinor = r.lines.reduce((n: number, l: Data) => n + extended(cancelled(l), l.unitMinor), 0); return base ? Number((BigInt(r.totalMinor) * BigInt(Math.max(0, base - cancelledMinor)) + BigInt(base) / 2n) / BigInt(base)) : r.totalMinor; }
