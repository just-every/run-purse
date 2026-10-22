import { approvalAmount, coveringPolicies } from '../purse/policy-match';
import type { D } from './shared';

/** How a request came in: the integration that posted it (named by the owner), email intake, or the web. */
export const channelOf = (r: D) => r.integration?.name || (r.emailIntake ? 'email' : 'web');
export const isStaff = (actor: D) => actor.permissions.some((permission:string)=>['access.manage','request.approve','procurement.manage','receive'].includes(permission));
export const mine = (actor: D, r: D) => r.requester === actor.id || r.requesterEmail === actor.email;
const issuedStatuses = ['issued', 'amendment-pending', 'closed'];

export function personName(data: D, email?: string) { if (!email) return ''; const p = (data.people ?? []).find((m: D) => m.email.toLowerCase() === email.toLowerCase()); return p?.name || email; }
export function firstName(name: string) { return name.includes('@') ? name.split('@')[0] : name.split(' ')[0]; }
export function initials(name: string) { const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean); return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() || '·'; }
/** Initials avatars are kingfisher, tangelo or ink only, steady per person. */
export function tone(email: string) { let n = 0; for (const c of email) n = (n * 31 + c.charCodeAt(0)) % 997; return ['blue', 'tangelo', 'ink'][n % 3]; }

/** When each record was first asked for: its earliest audit entry. */
export function askedTimes(data: D) { const first = new Map<string, string>(); for (const e of data.audit ?? []) if (e.record && e.at && (!first.has(e.record) || e.at < first.get(e.record)!)) first.set(e.record, e.at); return first; }
export const orderOf = (data: D, r: D) => data.order.filter((o: D) => o.request === r.id && o.status !== 'superseded').sort((a: D, b: D) => b.revision - a.revision)[0];
export const decisionOf = (data: D, r: D) => data.decision.filter((d: D) => d.request === r.id && d.revision === r.revision).sort((a: D, b: D) => b.at.localeCompare(a.at))[0];
/** A request is decided when no one has a next step on it: approved with its PO raised, declined, or imported history. */
export const isDecided = (data: D, r: D) => Boolean(r.imported || r.status === 'rejected' || (r.status === 'approved' && orderOf(data, r)));
export const policyOf = (data: D, r: D) => r.policy ? data.policy.find((p: D) => p.id === r.policy) : coveringPolicies(data.policy, r)[0];

export function holdsAuthority(_data: D, actor: D, r: D) {
    return r.status === 'pending' && !r.imported && !mine(actor, r) && r.mayApprove === true;
}

/** The viewer's own next step on a request, if it waits on them. */
export function verbFor(data: D, actor: D, r: D): 'approve' | 'submit' | 'convert' | null {
    if (r.imported) return null;
    if (holdsAuthority(data, actor, r)) return 'approve';
    if (['draft', 'returned'].includes(r.status) && r.mayEdit && (mine(actor,r)||actor.roles.includes('owner'))) return 'submit';
    if (r.status === 'approved' && !orderOf(data, r) && r.mayConvert) return 'convert';
    return null;
}
/** Who owns the next step, named for the card. */
export function nextStep(data: D, actor: D, r: D) {
    const you = (email: string) => email === actor.email ? 'You' : personName(data, email);
    if (['draft', 'returned'].includes(r.status)) return `${you(r.requesterEmail)} ${r.requesterEmail === actor.email ? 'submit' : 'submits'}`;
    if (r.status === 'pending') {
        if (r.approvalNeedsReassignment) return 'Needs reassignment · held in the native owner queue';
        if ((r.approvalTransferred || r.approvalRoute) && r.approvalHolder) return `${you(r.approvalHolder)} ${r.approvalHolder === actor.email ? 'decide' : 'decides'} · transferred approval`;
        const p = data.policy.find((x: D) => x.id === r.policy);
        if (!p) return 'Approver to confirm';
        const eligible = (email: string) => email.toLowerCase() !== r.requesterEmail?.toLowerCase() && !(r.requester === actor.id && email === actor.email);
        const delegates = data.delegation.filter((d: D) => d.policy === p.id && d.from === p.approver && d.active && Date.parse(d.expires) > Date.now() && eligible(d.delegate));
        const emails: string[] = [...new Set<string>([...(eligible(p.approver) ? [p.approver] : []), ...delegates.map((d: D) => d.delegate)])];
        return emails.length ? emails.map(email => `${you(email)} ${email === actor.email ? 'decide' : 'decides'}`).join(' · ') : 'Needs another approver · self-approval refused';
    }
    if (r.status === 'approved' && !orderOf(data, r) && r.mayConvert) return 'You raise the PO';
    if (r.status === 'approved' && !orderOf(data, r)) { const buyers = (data.people ?? []).filter((m: D) => m.roles.includes('buyer')); return buyers.length === 1 ? `${you(buyers[0].email)} ${buyers[0].email === actor.email ? 'raise' : 'raises'} the PO` : 'A buyer raises the PO'; }
    return '';
}

/** Invoice value already drawn against a blanket request's cap, from its order's blanket balance. */
const billed = (data: D, r: D) => r.poDetails?.blanket ? data.order.find((o: D) => o.request === r.id && o.currency === r.currency && o.blanketPosition)?.blanketPosition.billedMinor ?? 0 : 0;
const balance = (data: D, policy: string, request?: string) => data.commitment.filter((e: D) => e.policy === policy && (!request || e.request === request)).reduce((n: number, e: D) => n + e.amountMinor, 0);
/** The checks Purse runs before approval, as chips: budget room under the covering policy, and the supplier's standing. */
export function checks(data: D, actor: D, r: D) {
    const out: { label: string; tone: 'ok' | 'warn' }[] = [];
    if (r.imported) return out;
    if (isStaff(actor) && ['draft', 'returned', 'pending'].includes(r.status)) {
        const p = policyOf(data, r);
        if (!p) out.push({ label: 'no policy covers this', tone: 'warn' });
        else { const need = Math.max(0, approvalAmount(r, billed(data, r)) - balance(data, p.id, r.id)); out.push(balance(data, p.id) + need <= p.budgetMinor ? { label: 'in budget ✓', tone: 'ok' } : { label: 'over budget', tone: 'warn' }); }
    }
    const s = data.supplier.find((x: D) => x.id === r.supplier);
    if (s && !r.imported) out.push(s.status === 'preferred' ? { label: 'preferred supplier ✓', tone: 'ok' } : s.status === 'active' && !s.mergedInto ? { label: 'known supplier ✓', tone: 'ok' } : { label: s.mergedInto ? 'supplier merged' : s.status === 'blocked' ? 'supplier blocked' : 'supplier in review', tone: 'warn' });
    return out;
}

/** A budget that the requests waiting on it would overfill together: the one exception the thread draws. */
export type Exception = { policy: D; requests: D[]; fits: D[]; rest: D[]; onOrderMinor: number; approvedMinor: number; pendingMinor: number; overMinor: number; underIfFitsMinor: number };
export function exceptions(data: D, actor: D, pending: D[]): Exception[] {
    if (!isStaff(actor)) return [];
    const out: Exception[] = [];
    for (const p of data.policy) {
        const requests = pending.filter(r => r.policy === p.id && r.status === 'pending' && !r.imported);
        if (requests.length < 2) continue;
        const outstanding = balance(data, p.id), needs = requests.map(r => Math.max(0, approvalAmount(r, billed(data, r)) - balance(data, p.id, r.id))), pendingMinor = needs.reduce((n, x) => n + x, 0);
        if (outstanding + pendingMinor <= p.budgetMinor || requests.some((r, i) => outstanding + needs[i] > p.budgetMinor)) continue;
        let onOrderMinor = 0;
        for (const id of new Set<string>(data.commitment.filter((e: D) => e.policy === p.id).map((e: D) => e.request))) {
            const issued = data.order.some((o: D) => o.request === id && o.issuedAt && issuedStatuses.includes(o.status));
            if (issued) onOrderMinor += balance(data, p.id, id);
        }
        const fits: D[] = [], rest: D[] = []; let used = outstanding;
        requests.forEach((r, i) => { if (used + needs[i] <= p.budgetMinor) { fits.push(r); used += needs[i]; } else rest.push(r); });
        out.push({ policy: p, requests, fits, rest, onOrderMinor, approvedMinor: outstanding - onOrderMinor, pendingMinor, overMinor: outstanding + pendingMinor - p.budgetMinor, underIfFitsMinor: p.budgetMinor - used });
    }
    return out;
}

/** "9:48 am" today on the business clock, "Mon Oct 19 · 4:12 pm" on another day. */
export function askedLabel(iso: string | undefined, timeZone: string) {
    if (!iso) return '';
    const day = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const date = new Date(iso), time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(date).replace(' AM', ' am').replace(' PM', ' pm');
    if (day(date) === day(new Date())) return time;
    return `${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(date).replace(',', '')} · ${time}`;
}
