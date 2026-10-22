import { blanketCap } from './policy-match';
import { supplier } from './admin';
import { lapsedSupplierDocuments } from './supplier-documents';
import { all, audit, date, get, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';
import { moneyInput } from './money';
import { requireBlanketValidity } from './blanket-orders';

export function currentBlanket(s: State, order: Data) {
    return all(s, 'order').filter(o => o.request === order.request && o.currency === order.currency && o.issuedAt).sort((a,b) => b.revision - a.revision)[0] ?? order;
}
export function releaseBilled(s: State, release: Data) {
    return all(s, 'invoice').filter(i => i.release === release.id).reduce((n,i) => n + i.totalMinor, 0);
}
export function releasePosition(s: State, order: Data) {
    const current = currentBlanket(s, order), releases = all(s, 'blanketRelease').filter(r => r.request === order.request);
    const releasedMinor = releases.reduce((n,r) => n + (r.closed ? releaseBilled(s,r) : Math.max(r.amountMinor,releaseBilled(s,r))),0);
    const unreleasedBilledMinor = all(s,'invoice').filter(i => !i.release && get(s,'order',i.order).request === order.request).reduce((n,i) => n+i.totalMinor,0);
    const capMinor=blanketCap(current, line => (line.carriedCancelled ?? 0) + all(s,'receipt').filter(r=>r.order===current.id&&r.line===line.id&&r.event==='cancel').reduce((n,r)=>n+r.q,0) + all(s,'orderClosure').filter(c=>c.order===current.id&&c.active).flatMap(c=>c.lines).filter((l:Data)=>l.line===line.id).reduce((n:number,l:Data)=>n+l.q,0));
    return { currentOrder:current.id, releasedMinor, unreleasedBilledMinor, availableMinor: Math.max(0,capMinor-releasedMinor-unreleasedBilledMinor),
        releases: releases.map(r => ({...r,billedMinor:releaseBilled(s,r),remainingMinor:r.closed?0:Math.max(0,r.amountMinor-releaseBilled(s,r))})) };
}
export function blanketReleases(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['blanket-release','close-blanket-release'].includes(op)) return;
    const prior = op === 'close-blanket-release' ? get(s,'blanketRelease',b.id) : undefined;
    const order = get(s,'order',prior?.order ?? b.order), current = currentBlanket(s,order);
    requirePermission(s,a,'procurement.manage',current);
    requireThat(!current.imported && current.status === 'issued' && current.poDetails?.blanket, 'Current issued native blanket PO required',409);
    requireThat(b.revision === current.revision && current.id === (prior ? current.id : order.id), 'Blanket revision changed; reload',409);
    const reason=text(b.reason,'Release reason');
    if(prior) {
        requireThat(!prior.closed,'Release is already closed',409);
        put(s,'blanketRelease',prior.id,{...prior,closed:true,closedAt:new Date().toISOString(),closedBy:a.id,closeReason:reason});
        audit(s,a,op,current.id,{release:prior.id,reason});return get(s,'blanketRelease',prior.id);
    }
    requireBlanketValidity(s,current);
    supplier(s,current.supplier);requireThat(!lapsedSupplierDocuments(s,current.supplier).length,'Supplier required document has lapsed',409);
    const amountMinor=moneyInput(b,'amount','amountMinor','Release amount'), needDate=date(b.needDate,'Release need date');
    requireThat(amountMinor>0 && amountMinor<=releasePosition(s,current).availableMinor,'Release exceeds unallocated blanket authority',409);
    requireThat(needDate>=current.poDetails.blanket.validFrom && needDate<=current.poDetails.blanket.validThrough,'Release date falls outside blanket validity',409);
    const reference=text(b.reference,'Release reference',200);
    requireThat(!all(s,'blanketRelease').some(r=>r.request===current.request && r.reference===reference),'Release reference already exists',409);
    const id=uid();
    put(s,'blanketRelease',id,{order:current.id,request:current.request,revision:current.revision,currency:current.currency,reference,amountMinor,needDate,reason,actor:a.id,at:new Date().toISOString(),closed:false});
    audit(s,a,op,current.id,{release:id,amountMinor,reference,reason});return get(s,'blanketRelease',id);
}
export function releaseInvoiceRisk(s: State, order: Data, candidate: Data) {
    requireThat(!candidate.release || order.poDetails?.blanket, 'A release can be selected only on its blanket PO',409);
    if(!order.poDetails?.blanket)return [];
    if(candidate.release) {
        const release=get(s,'blanketRelease',candidate.release);
        requireThat(release.request===order.request && release.currency===order.currency,'Release belongs to another purchase',409);
        const billed=all(s,'invoice').filter(i=>i.release===release.id&&i.id!==candidate.id).reduce((n,i)=>n+i.totalMinor,0);
        return release.closed || billed+candidate.totalMinor>release.amountMinor ? [{code:'release-balance',reason:'Invoice exceeds the current release balance or refers to a closed release'}] : [];
    }
    const position=releasePosition(s,order);
    return candidate.totalMinor>position.availableMinor ? [{code:'release-allocation',reason:'Invoice without a release exceeds unallocated blanket authority; select its release or amend the approved cap'}] : [];
}
