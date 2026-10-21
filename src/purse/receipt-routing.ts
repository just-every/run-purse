import { accessGrants, allowed, all, audit, get, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';
import { discrepancies, linePosition } from './orders';

const memberActor = (email: string): Actor => ({ id: '', email, owner: false, dev: false, session: '', version: 0 });
export const activeReceiver = (s: State, email: string, order: Data) => allowed(s, memberActor(email), 'receive', order);
const unrestrictedProcurement = (s: State, a: Actor) => accessGrants(s,a).some(grant => grant.permissions.includes('procurement.manage') && Object.keys(grant.scope).length === 0 && Object.keys(grant.roleScope ?? {}).length === 0);
const category = (o: Data) => new Set(o.lines.map((l: Data) => l.category)).size === 1 ? o.lines[0].category : '*';
export function receiptAssignment(s: State, order: Data): { email: string; explicit: boolean } {
    const rules = all(s, 'receiptRule').filter(r => r.active && (r.order ? r.order === order.id : (r.location === '*' || r.location === order.location) && (r.purchaseType === '*' || r.purchaseType === category(order))));
    const score = (r: Data) => r.order ? 4 : r.location !== '*' && r.purchaseType !== '*' ? 3 : r.purchaseType !== '*' ? 2 : 1;
    const selected = rules.sort((a,b) => score(b) - score(a))[0];
    return selected ? { email: selected.receiver, explicit: true } : { email: get(s, 'request', order.request).requesterEmail, explicit: false };
}
export function mayReceive(s: State, a: Actor, o: Data): boolean {
    if (a.owner) return true;
    const assigned = receiptAssignment(s, o);
    return assigned.explicit ? assigned.email?.toLowerCase() === a.email.toLowerCase() && allowed(s, a, 'receive', o)
        : allowed(s, a, 'receive', o) || assigned.email?.toLowerCase() === a.email.toLowerCase() && allowed(s, a, 'request.edit', o);
}
/** A native owner requester is finally checked against native auth at send.
 * Every member recipient must still hold current permission on this PO.
 */
export function receiptRecipient(s: State, email: string, order: Data) {
    if (!email) return false;
    const assigned = receiptAssignment(s, order), a = memberActor(email);
    if (assigned.email?.toLowerCase() !== email.toLowerCase()) return false;
    if (assigned.explicit) return activeReceiver(s, email, order);
    const request = get(s, 'request', order.request);
    return allowed(s, a, 'receive', order) || allowed(s, a, 'request.edit', order)
        || request.requesterOwner === true && request.requesterEmail.toLowerCase() === email.toLowerCase();
}
export function receiptVersion(s: State, o: Data): string {
    return [s.get('order:'+o.id)?.revision, ...[...s.values()].filter(r => ['receiptRule','member','accessRole'].includes(r.kind) || ['receipt','orderClosure'].includes(r.kind) && r.value.order === o.id).map(r => r.revision).sort()].join(':');
}
export function receiptRouting(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['receipt-rule','reassign-receipt'].includes(op)) return;
    const previous = b.id ? get(s, 'receiptRule', b.id) : undefined;
    requireThat(b.version === (previous?.version ?? 0), 'Receiver assignment changed; reload', 409);
    const order = b.order ? get(s, 'order', b.order) : undefined;
    if (op === 'reassign-receipt') {
        requireThat(order?.status === 'issued' && mayReceive(s,a,order), 'Only the current receiver may reassign this PO', 403);
        requirePermission(s,a,'receive',order);
    } else if (order) requirePermission(s,a,'procurement.manage',order);
    else requireThat(unrestrictedProcurement(s,a), 'Unrestricted procurement permission required for receiver rules',403);
    if (order) requireThat(!order.imported && ['prepared','issued','closed'].includes(order.status), 'Choose a current native PO', 409);
    const location = order ? '*' : text(b.location || '*', 'Location'), purchaseType = order ? '*' : text(b.purchaseType || '*', 'Purchase category');
    requireThat(order || location !== '*' || purchaseType !== '*', 'Choose a location or purchase category');
    requireThat(location === '*' || get(s,'business','main').locations.includes(location), 'Unknown location');
    const receiver = text(b.receiver, 'Receiver email', 254).toLowerCase();
    requireThat(activeReceiver(s,receiver,order ?? (location === '*' ? {} : {location})), 'Choose an active member with receiver capability in this scope');
    const duplicate = all(s,'receiptRule').find(r => r.id !== previous?.id && r.order === (order?.id ?? null) && r.location === location && r.purchaseType === purchaseType);
    requireThat(!duplicate, 'This receiver rule exists; edit its current version',409);
    requireThat(!previous || previous.order === (order?.id ?? null) && previous.location === location && previous.purchaseType === purchaseType, 'Rule scope is immutable; deactivate it and add another',409);
    const id = previous?.id ?? uid(), entry = { version:(previous?.version ?? 0)+1, receiver, active:b.active !== false, reason:text(b.reason,'Assignment reason'),actor:a.id,at:new Date().toISOString() };
    put(s,'receiptRule',id,{order:order?.id ?? null,location,purchaseType,...entry,history:[...(previous?.history ?? []),entry]});
    audit(s,a,op,order?.id ?? id,{rule:id,...entry});
    return get(s,'receiptRule',id);
}
export function receiptPrompts(s: State, now = Date.now()): Data[] {
    const today = receiptDay(s,now), short = new Set(discrepancies(s).filter(d=>d.receiptShortfall).map(d=>get(s,'order',d.orderId).request));
    return all(s,'order').filter(o=>!o.imported && o.status==='issued' && !o.amendedBy && o.lines.some((l:Data)=>linePosition(s,o.id,l).outstanding>0)).flatMap(o=>{
        const assignment=receiptAssignment(s,o);
        if(!receiptRecipient(s,assignment.email,o))return [];
        if(!short.has(o.request) && o.needDate>today)return [];
        return [{order:o.id,number:o.number,receiver:assignment.email,reason:short.has(o.request)?'invoice-waiting':'delivery-due',needDate:o.needDate}];
    });
}
export function receiptMatch(s: State, invoice: Data) {
    const rows = discrepancies(s).filter(d=>d.invoiceId===invoice.id);
    return rows.some(d=>d.receiptShortfall) ? 'Held for receipt' : rows.some(d=>d.priceMismatch||d.quantityMismatch||d.closedBalance||d.exception) ? 'Matching exception' : 'Ready for matching';
}

/** Operational receiving state only; invoice identities and evidence stay private. */
export function receiptMatchingStatus(s: State, order: Data) {
    const matches = all(s, 'invoice').filter(invoice => !invoice.imported && invoice.order === order.id).map(invoice => receiptMatch(s, invoice));
    if (!matches.length) return;
    return matches.includes('Held for receipt') ? 'Held for receipt' : matches.includes('Matching exception') ? 'Matching exception' : 'Ready for matching';
}

export function receiptDay(s: State, now: number): string {
 const zone=s.get('business:main')?.value.timezone || 'America/New_York';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(name:string)=>parts.find(p=>p.type===name)!.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
