import { orderSourceFace, orderSources, requireOrderSources } from './po-combination-sources';
import { requirePermission } from './access';
import { canonicalSupplier } from './supplier-identity';
import { all, audit, can, get, put, quantity, requireThat, text, uid, type Actor, type Data, type State } from './types';
import { commitment, linePosition, remainingValue } from './orders';
import { ledger } from './requests';
import { currentDecision } from './approval';
import { supplier } from './admin';

/** Closing changes local receiving authority; it never cancels supplier terms. */
export function orderClosure(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['close-order', 'reopen-order'].includes(op)) return;
    can(s, a, 'buyer');
    const o = get(s,'order',b.id),r=get(s,'request',o.request);
    requirePermission(s,a,'procurement.manage',o);
    const before=o.sources?orderSources(o).map(source=>({request:source.request,remaining:remainingValue(s,orderSourceFace(o,source.request)!)})):[];
    requireThat(o.issuedAt && !o.imported && ['issued', 'closed'].includes(o.status), 'An issued current PO is required', 409);
    requireThat(b.version === (o.closureVersion ?? 0), 'PO closure changed; reload', 409);
    const reason = text(b.reason, op === 'close-order' ? 'Closure reason' : 'Reopen reason');
    if (op === 'close-order') {
        requireThat(o.status === 'issued', 'PO is already closed', 409);
        const selected = b.line ? o.lines.filter((l: Data) => l.id === b.line) : o.lines;
        requireThat(selected.length, 'PO line not found', 404);
        requireThat(!b.quantity || b.line, 'Choose a line for a partial balance');
        const lines = selected.map((l: Data) => {
            const outstanding = linePosition(s, o.id, l).outstanding;
            const q = b.quantity ? quantity(b.quantity) : outstanding;
            requireThat(q >= 0 && q <= outstanding, 'Closure exceeds the outstanding balance', 409);
            return { line: l.id, q };
        }).filter((l: Data) => l.q > 0);
        requireThat(lines.length, 'No outstanding balance to close', 409);
        const id = uid();
        put(s, 'orderClosure', id, { order: o.id, lines, reason, actor: a.id, at: new Date().toISOString(), active: true });
        audit(s, a, op, o.id, { closure: id, reason, lines });
    } else {
        requireThat(r.status === 'approved' && r.revision === o.revision, 'Current request approval required', 409);
        supplier(s, canonicalSupplier(s, o.supplier));
        const approval = o.sources?requireOrderSources(s,a,o)[0]:currentDecision(s,r);
        requireThat(o.replenishmentStatus !== 'held', 'Replenishment is held; renew approval', 409);
        const closures = all(s, 'orderClosure').filter(c => c.order === o.id && c.active && (!b.closure || c.id === b.closure));
        requireThat(closures.length, 'No closed balance to reopen', 409);
        for (const c of closures) put(s, 'orderClosure', c.id, { ...c, active: false, reopenedBy: a.id, reopenedAt: new Date().toISOString(), reopenReason: reason });
        put(s, 'order', o.id, { ...o, approvalActor: approval.actor, approvalVersion: approval.operatorVersion, reopenedAt: new Date().toISOString(), reopenedBy: a.id });
        audit(s, a, op, o.id, { closures: closures.map(c => c.id), reason });
    }
    if(o.sources)for(const source of before){const face=orderSourceFace(o,source.request)!,request=get(s,'request',source.request),delta=remainingValue(s,face)-source.remaining;if(delta)ledger(s,a,request,delta,op==='close-order'?'close-release':'reopen-reservation');}
    else {const delta=remainingValue(s,o)-commitment(s,r);if(delta)ledger(s,a,r,delta,op==='close-order'?'close-release':'reopen-reservation');}
    const current = get(s, 'order', o.id);
    put(s, 'order', o.id, { ...current, closureVersion: (o.closureVersion ?? 0) + 1,
        status: o.lines.some((l: Data) => linePosition(s, o.id, l).outstanding > 0) ? 'issued' : 'closed' });
    return get(s, 'order', o.id);
}
