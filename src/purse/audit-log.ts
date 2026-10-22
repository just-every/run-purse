import { projectApprovalEdit } from './approval-edit-view';
import { auditEventAllowed } from './access-audit';
import { allowed, requirePermission } from './access';
import { all, can, date, get, type Actor, type Data, type State } from './types';
function context(s: State, event: Data, a:Actor,permission:string) {
    const detail: Data = {};
    if (['request', 'amend', 'submit', 'decision','approver-edit'].includes(event.action) && event.revision) {
        const revision = s.get('revision:' + event.record + ':' + event.revision)?.value;
        if (revision) detail.revision = projectApprovalEdit(s,a,revision,permission);
        if (['amend','approver-edit'].includes(event.action)){const before=s.get('revision:' + event.record + ':' + (event.revision - 1))?.value;detail.before=before?projectApprovalEdit(s,a,before,permission):null;}
    }
    if (event.action === 'decision') {
        const decision = event.decisionId ? s.get('decision:' + event.decisionId)?.value : all(s, 'decision').find(d => d.request === event.record && d.revision === event.revision && d.actor === event.actor && d.decision === event.decision);
        const policyVisible=decision&&['request','revision','decision','commitment'].flatMap(kind=>all(s,kind)).filter(record=>record.policy===decision.policy).every(record=>allowed(s,a,permission,record));
        if (decision) detail.approval = { decision: decision.id, policy: decision.policy, policyVersion: decision.policyVersion, policySnapshot: policyVisible?decision.policySnapshot ?? null:null, snapshotBasis: !policyVisible?'Whole-policy snapshot outside your audit scope':decision.policySnapshot ? 'Policy retained at decision' : 'Historical policy snapshot unavailable', delegation: decision.delegation, reason: decision.reason };
    }
    return { ...projectApprovalEdit(s,a,event,permission), evidence: detail };
}
export function auditLog(s: State, a: Actor, filters: Data = {}, permission='audit.read') {
    requirePermission(s,a,permission);
    const subject = String(filters.subject ?? '').trim(), action = String(filters.action ?? '').trim();
    const from = filters.from ? date(filters.from, 'From date') : '', through = filters.through ? date(filters.through, 'Through date') : '';
    const subjects = new Set([subject]);
    const order = all(s, 'order').find(o => o.id === subject || o.number === subject);
    if (order) {
        subjects.add(order.id); subjects.add(order.request);
        for (const i of all(s, 'invoice').filter(i => i.order === order.id)) subjects.add(i.id);
        for (const c of all(s, 'orderClosure').filter(c => c.order === order.id)) subjects.add(c.id);
    }
    return all(s, 'audit').filter(e=>auditEventAllowed(s,a,e,permission)).filter(e => (!subject || subjects.has(e.record)) && (!action || e.action === action) && (!from || (e.at ?? '').slice(0, 10) >= from) && (!through || (e.at ?? '').slice(0, 10) <= through))
        .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '') || a.id.localeCompare(b.id)).map(e => context(s, e,a,permission));
}
export function auditCsv(events: Data[]) {
    const cell = (v: unknown) => '"' + String(v ?? '').replace(/^[\s]*[=+@-]/, "' $&").replace(/"/g, '""') + '"';
    const rows = [['event', 'time_utc', 'actor', 'email', 'action', 'subject', 'reason', 'details_json'], ...events.map(e => [e.id, e.at, e.actor, e.email, e.action, e.record, e.reason, JSON.stringify(e)])];
    return new Response(rows.map(row => row.map(cell).join(',')).join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="purse-audit.csv"' } });
}
