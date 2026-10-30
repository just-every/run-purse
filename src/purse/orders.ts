import { hasSupplierGroups, requireGroupable, supplierGroupFaces, requireGroupFace, supplierLineRemaining } from './po-supplier-groups';
import { checkAdoptedDisposition, settleAdoptedDisposition } from './adoption-amendments';
import { operationalOrder } from './adoption-position';
import { servicePosition, serviceInvoiceMatches, serviceReceipt } from './service-orders';
import { blanketRemaining, requireBlanketValidity } from './blanket-orders';
import { openInvoiceFlags } from './invoice-status';
import { poProfileSnapshot } from './po-profiles';
import { currentDecision } from './approval';
import { all, audit, get, put, requireThat, text, extended, uid, type Actor, type Data, type State } from './types';
import { supplier } from './admin';
import { lapsedSupplierDocuments } from './supplier-documents';
const documentHold = (s: State, id: string) => requireThat(!lapsedSupplierDocuments(s, id).length, 'Required supplier document has lapsed; refresh and review it before a new PO', 409);
import { ledger, policies, approvalAmount, reservationAvailable } from './requests';
import { invoice } from './invoices';
import { receipt, correctReceipt } from './receiving';
import { requirePermission } from './access';
import { conversionEdits, requireConversionSource } from './conversion-variance';
import { reviseForConversion } from './conversion-revision';
import { changeNeedDate } from './need-date-edit';
export function linePosition(s: State, order: string, line: Data) { if (line.service) { const p = servicePosition(s, get(s, 'order', order), line); const q = (minor: number) => line.totalMinor ? Number(BigInt(minor) * BigInt(line.q) / BigInt(line.totalMinor)) : 0; return { ...p, accepted: q(p.acceptedMinor), cancelled: q(p.cancelledMinor), closed: q(p.closedMinor), outstanding: q(p.outstandingMinor) }; } const events = all(s, 'receipt').filter(e => e.order === order && e.line === line.id); const accepted = (line.carriedAccepted ?? 0) + events.reduce((n, e) => n + (e.event === 'receive' ? e.q : e.event === 'return' ? -e.q : 0), 0), cancelled = (line.carriedCancelled ?? 0) + events.filter(e => e.event === 'cancel').reduce((n, e) => n + e.q, 0); const closed = all(s, 'orderClosure').filter(c => c.order === order && c.active).flatMap(c => c.lines).filter((c: Data) => c.line === line.id).reduce((n: number, c: Data) => n + c.q, 0); return { accepted, cancelled, closed, outstanding: line.q - accepted - cancelled - closed }; }
export function commitment(s: State, r: Data) { return all(s, 'commitment').filter(e => e.request === r.id).reduce((n, e) => n + e.amountMinor, 0); }
export function remainingValue(s: State, o: Data) { if(o.supplierGroup)return o.lines.reduce((sum:number,line:Data)=>sum+supplierLineRemaining(o,line,linePosition(s,o.id,line).outstanding),0); if(o.poDetails?.blanket) return blanketRemaining(s,o,l => { const p=linePosition(s,o.id,l);return p.cancelled+p.closed; }); const remaining = o.lines.reduce((n: number, l: Data) => n + (l.service ? servicePosition(s,o,l).outstandingMinor : extended(linePosition(s, o.id, l).outstanding, l.unitMinor)), 0); const base = o.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0); const any = o.lines.some((l: Data) => linePosition(s, o.id, l).outstanding > 0); return base ? Number((BigInt(o.totalMinor) * BigInt(remaining) + BigInt(base) / 2n) / BigInt(base)) : (any ? o.totalMinor : 0); }
/** A source request owns one outstanding ledger even when several suppliers fulfil it. */
export function requestRemainingValue(s: State, order: Data) {
    if(!order.supplierGroup)return remainingValue(s,order);
    return all(s,'order').filter(candidate=>candidate.request===order.request&&candidate.supplierGroup?.key===order.supplierGroup.key&&candidate.issuedAt&&!candidate.amendedBy).reduce((sum,candidate)=>sum+remainingValue(s,candidate),0);
}
export function orders(s: State, a: Actor, op: string, b: Data, issuingGroup = false): Data | undefined {
    if (op === 'need-date-edit') return changeNeedDate(s,a,b);
    if (op === 'convert') {
        let r = get(s, 'request', b.id);
        requirePermission(s, a, 'po.convert', r);
        requireThat(r.revision === b.revision && r.status === 'approved' && !r.imported, 'Exact current revision must have native approval', 409);
        supplier(s, r.supplier);
        documentHold(s, r.supplier);
        requireThat(r.supplierSnapshot?.id === r.supplier, 'Supplier identity missing; amend the request and renew approval', 409);
        currentDecision(s, r);
        for(const line of r.lines)if(line.supplier){supplier(s,line.supplier);documentHold(s,line.supplier);}
        checkAdoptedDisposition(s, r);
        requireThat(!all(s, 'order').some(o => o.request === r.id && o.revision === r.revision), 'Approved lines already allocated to a PO', 409);
        requireThat(all(s, 'decision').some(d => d.request === r.id && d.revision === r.revision && d.decision === 'approved'), 'Approval decision missing', 409);
        requireThat(!r.poDetails?.deposit || !hasSupplierGroups(r) && !b.conversionEdits, 'Deposit conversion retains the approved exact terms; amend and renew approval for changes', 409);
        const edit = conversionEdits(s, a, r, b.conversionEdits);
        if(edit) {
            r=reviseForConversion(s,a,r,edit);
            if(r.status!=='approved')return {...r,conversionRouted:true};
        }
        if(hasSupplierGroups(r))requireGroupable(s,r);
        const created:Data[]=[];
        for(const face of supplierGroupFaces(r)) {
        const approval=currentDecision(s,r);
        const conversionVariance = r.buyerConversion ? {...r.buyerConversion, approvalRenewed:r.buyerConversion.routing!=='carried'} : undefined;
        const id = uid();
        let sequence = all(s, 'order').reduce((n, o) => Math.max(n, o.sequence || 0), 0) + 1;
        const occupied = new Set(all(s, 'order').map(order => order.number));
        while (occupied.has(`PO-${String(sequence).padStart(6, '0')}`)) sequence++;
        const o = { id, sequence, documentProfile: poProfileSnapshot(s, face, a), ...(r.poDetails ? { poDetails: structuredClone(r.poDetails) } : {}), ...(r.entity ? { entity: r.entity } : {}), location: r.location, costCentre: r.costCentre, approvalActor:approval.actor,approvalVersion:approval.operatorVersion,...(approval.chainProofs ? {approvalProofs:approval.chainProofs} : {}), number: `PO-${String(sequence).padStart(6, '0')}`, request: r.id, policy:r.policy, revision: r.revision, supplier: face.supplier, supplierSnapshot: structuredClone(face.supplierSnapshot), ...(face.supplierGroup ? {supplierGroup:face.supplierGroup}: {}), currency: r.currency, lines: face.lines.map((l: Data) => ({ ...l, sourceLine: l.id })), freightMinor: face.freightMinor, taxMinor: face.taxMinor, totalMinor: face.totalMinor, terms: r.terms, needDate: r.needDate, status: 'prepared', generatedAt: new Date().toISOString(), issuedAt: null, ...(conversionVariance ? { conversionVariance } : {}), ...(face.charges ? {charges:structuredClone(face.charges),otherChargesMinor:face.otherChargesMinor??0} : {}) };
        for (const field of ['glAccount','intakeForm','intakeFormVersion','intakeFormSnapshot','answers','customFields']) if (r[field] !== undefined) (o as Data)[field] = structuredClone(r[field]);
        if (r.cancellation) (o as Data).cancellation = structuredClone(r.cancellation);
        if (r.adoptedDisposition) (o as Data).adoptedDisposition = structuredClone(r.adoptedDisposition);
        if(Object.hasOwn(r,'valuePromise')) (o as Data).valuePromise=structuredClone(r.valuePromise);
        put(s, 'order', id, o);
        if (conversionVariance) audit(s, a, 'buyer-conversion-edit', id, { request: r.id, ...conversionVariance });
        audit(s, a, op, id, { request: r.id, revision: r.revision });
        created.push(o);
        }
        if(b.issue===true)return orders(s,a,'issue',{id:created[0].id,revision:r.revision,reason:edit?.variance.reason??'Issue approved conversion'});
        return created.length===1?created[0]:{...created[0],supplierOrders:created};
    }
    if (op === 'issue') {
        const o = get(s, 'order', b.id), r = get(s, 'request', o.request);
        if(o.supplierGroup && !issuingGroup) {
            const siblings=requireGroupFace(s,o);
            const issued=siblings.map(sibling=>orders(s,a,'issue',{...b,id:sibling.id},true)!);
            return {...issued[0],supplierOrders:issued};
        }
        if(o.supplierGroup)requireGroupFace(s,o);
        requirePermission(s, a, 'po.issue', r); requirePermission(s, a, 'po.issue', o);
        supplier(s, o.supplier);
        documentHold(s, o.supplier);
        requireThat(o.supplierSnapshot?.id === o.supplier, 'Approved supplier identity is missing; amend the request and renew approval', 409);
        requireThat(o.status === 'prepared' && r.status === 'approved' && r.revision === o.revision && b.revision === o.revision && !o.imported, 'PO document or authority is stale', 409);
        requireThat(policies(s, r).some(p => p.id === r.policy), 'Approval policy changed', 409);
        currentDecision(s, r);
        checkAdoptedDisposition(s, r);
        let conversionSource=o;const ancestry=new Set<string>();
        while(!conversionSource.conversionVariance&&conversionSource.needDateChange){requireThat(!ancestry.has(conversionSource.id),'Invalid date-correction ancestry',409);ancestry.add(conversionSource.id);conversionSource=get(s,'order',conversionSource.needDateChange.priorOrder);}
        const conversionLimit = conversionSource.conversionVariance ? requireConversionSource(s, a, r, conversionSource) : undefined;
        const issuedFace = o.supplierGroup ? r : o.conversionVariance ? { ...r, lines: o.lines, freightMinor:o.freightMinor,taxMinor:o.taxMinor,totalMinor: o.totalMinor } : r;
        if (o.conversionVariance) requireThat(policies(s, issuedFace).some(p => p.id === r.policy), 'Edited PO exceeds current approval policy; amend and renew approval', 409);
        if(o.supplierGroup)requireThat(reservationAvailable(s,r,0), 'Current budget no longer authorizes this supplier group; renew approval',409);
        requireBlanketValidity(s, o);
        if (r.amends) {
            const prior = get(s, 'order', r.amends);
            requireThat(prior.status === 'amendment-pending', 'Prior order changed', 409);
            put(s, 'order', prior.id, { ...prior, status: 'amended', amendedBy: o.id, ...(prior.replenishmentStatus === 'held' ? { replenishmentStatus: 'reviewed', replenishmentMinor: 0 } : {}) });
            const groups=new Map<string,Data>();for(const e of all(s,'commitment').filter(e=>e.request===r.id)){const k=e.policy+':'+e.currency;const g=groups.get(k)??{policy:e.policy,currency:e.currency,amount:0};g.amount+=e.amountMinor;groups.set(k,g)}for(const g of groups.values())if(g.amount&&(g.policy!==r.policy||g.currency!==r.currency))ledger(s,a,{...r,policy:g.policy,currency:g.currency},-g.amount,'amendment-policy-release');const target = approvalAmount(issuedFace,s), current = commitment(s, r);
            if (target !== current)
                ledger(s, a, r, target - current, 'amendment-issued-adjustment');
        }
        else if (o.conversionVariance) {
            const delta = approvalAmount(issuedFace, s) - commitment(s, r);
            if (delta) ledger(s, a, issuedFace, delta, 'conversion-issued-adjustment');
        }
        put(s, 'order', o.id, { ...o, status: 'issued', issuedAt: new Date().toISOString(), issuedBy: a.id, issueReason: text(b.reason, 'Issue confirmation') });
        settleAdoptedDisposition(s, a, r, get(s, 'order', o.id));
        audit(s, a, op, o.id, { revision: o.revision, ...(o.conversionVariance ? { conversionLimit:conversionLimit??null, conversionSourceRevision:o.conversionVariance.sourceRevision, conversionApprovalRenewed:o.conversionVariance.approvalRenewed } : {}) });
        return get(s, 'order', o.id);
    }
    if (op === 'service-receipt') return serviceReceipt(s, a, b);
    if (op === 'receipt') return receipt(s, a, b);
    if (op === 'receipt-correction') return correctReceipt(s, a, b);
    if (op === 'invoice') return invoice(s, a, b);
}
// An issued amendment continues the same request-line purchase. Earlier orders
// remain immutable evidence; their invoice quantities still consume this line.
export function discrepancies(s: State) {
    const invoices = all(s, 'invoice').sort((a, b) => (a.entrySequence ?? 0) - (b.entrySequence ?? 0)
        || (a.at ?? '').localeCompare(b.at ?? '') || a.id.localeCompare(b.id)), orders = all(s, 'order');
    return invoices.flatMap((i, index) => (i.depositKind === 'deposit' ? [] : i.allocations).map((x: Data) => {
        const o = get(s, 'order', i.order), l = o.lines.find((l: Data) => l.id === x.line);
        const lineage = orders.filter(p => p.request === o.request && operationalOrder(s, p) && p.lines.some((z: Data) => z.id === l.id));
        const current = lineage.reduce((latest, p) => p.revision > latest.revision ? p : latest, o);
        const currentLine = current.lines.find((z: Data) => z.id === l.id);
        const orderIds = new Set(lineage.map(p => p.id));
        const service = Boolean(currentLine.service), valueMatch = service ? serviceInvoiceMatches(s, current, currentLine).has(i.id) : false;
        // Later evidence consumes the remaining balance; it cannot retroactively
        // hold an earlier bill. Current returns and closures still apply to each
        // bill's cumulative position across issued amendments.
        const totalInvoiced = invoices.slice(0, index + 1).filter(z => orderIds.has(z.order)).flatMap(z => z.allocations).filter((z: Data) => z.line === l.id).reduce((n: number, z: Data) => n + z.q, 0);
        return { invoiceId: i.id, orderId: o.id, lineId: l.id, invoice: i.reference, exception: i.exception ?? (openInvoiceFlags(i).length ? 'Unresolved invoice risk flags' : service && !valueMatch ? 'Invoice exceeds received service value' : null), order: o.number, line: l.description, currency: i.currency, invoiceMinor: x.amountMinor, expectedMinor: x.orderedMinor, priceMismatch: service ? false : x.amountMinor !== x.orderedMinor, closedBalance: linePosition(s, current.id, currentLine).closed > 0 && totalInvoiced > currentLine.q - linePosition(s, current.id, currentLine).closed, quantityMismatch: service ? false : totalInvoiced > currentLine.q, receiptShortfall: service ? !valueMatch : totalInvoiced > linePosition(s, current.id, currentLine).accepted };
    }));
}
