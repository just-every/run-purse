import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index';
import { canonicalSupplier, supplierPublicValue } from './supplier-identity';
import { all, audit, can, get, key, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

function mergeReview(s: State, sourceId: string, targetId: string) {
    requireThat(sourceId !== targetId, 'Choose two different suppliers');
    const source = get(s, 'supplier', sourceId), target = get(s, 'supplier', targetId);
    requireThat(!source.mergedInto && !target.mergedInto, 'Choose surviving supplier records; this merge has already changed', 409);
    for (const supplier of [source, target]) requireThat(['active', 'preferred'].includes(supplier.status) && supplier.screenings?.length, 'Resolve supplier blocking and compliance holds before merging', 409);
    const family = all(s, 'supplier').filter(v => canonicalSupplier(s, v.id) === source.id || canonicalSupplier(s, v.id) === target.id);
    const ids = new Set(family.map(v => v.id));
    const links = Object.fromEntries(['request', 'order', 'invoice', 'catalogue'].map(kind => [kind, all(s, kind).filter(r => ids.has(r.supplier)).map(r => ({ id: r.id, supplier: r.supplier, number: r.number ?? r.reference ?? r.title ?? r.description, status: r.status ?? null }))]));
    return { source: supplierPublicValue(source), target: supplierPublicValue(target), family: family.map(supplierPublicValue), links,
        fingerprint: sha256(canonicalJson({ source: s.get(key('supplier', sourceId))!.revision, target: s.get(key('supplier', targetId))!.revision, family: family.map(v => [v.id, s.get(key('supplier', v.id))!.revision]), links })) };
}
export function supplierMerge(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'preview-supplier-merge' && op !== 'merge-suppliers') return;
    can(s, a, 'buyer');
    const review = mergeReview(s, b.source, b.target);
    if (op === 'preview-supplier-merge') return review;
    requireThat(b.fingerprint === review.fingerprint, 'Supplier merge changed; preview the current records again', 409);
    const reason = text(b.reason, 'Supplier merge reason'), id = uid(), at = new Date().toISOString();
    const source = get(s, 'supplier', b.source);
    put(s, 'supplier', source.id, { ...source, status: 'merged', mergedInto: b.target, mergedAt: at });
    put(s, 'supplierMerge', id, { source: b.source, target: b.target, reason, at, actor: a.id, family: review.family.map(v => v.id), links: review.links });
    audit(s, a, op, b.target, { merge: id, source: b.source, target: b.target, reason, links: review.links });
    return { id, source: b.source, target: b.target };
}
export function supplierFamilies(s: State) {
    return all(s, 'supplier').filter(v => !v.mergedInto).map(target => {
        const members = all(s, 'supplier').filter(v => canonicalSupplier(s, v.id) === target.id), ids = new Set(members.map(v => v.id));
        const orders = all(s, 'order').filter(o => ids.has(o.supplier)), orderIds = new Set(orders.map(o => o.id));
        return { supplier: target.id, members: members.map(supplierPublicValue),
            requests: all(s, 'request').filter(r => ids.has(r.supplier)), orders,
            invoices: all(s, 'invoice').filter(i => ids.has(i.supplier) || orderIds.has(i.order)),
            attachments: all(s, 'attachment').filter(f => f.kind === 'supplier' && ids.has(f.record)).map(({ base64, ...value }) => value),
            audit: all(s, 'audit').filter(e => ids.has(e.record) || e.source && ids.has(e.source) || e.target && ids.has(e.target)),
            merges: all(s, 'supplierMerge').filter(m => ids.has(m.source) || ids.has(m.target)) };
    });
}
