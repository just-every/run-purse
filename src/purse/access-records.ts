import { codingAgentRunVisible } from './coding-agent';
import { accessGrants, allowed, grantAllows, resolvedPermissions } from './access';
import { all, get, requireThat, type Actor, type Data, type State } from './types';
import { performanceAgreementSources } from './access-agreement-sources';

export function unrestrictedPermission(s: State, a: Actor, permission: string) {
    return accessGrants(s, a).some(grant => grant.permissions.includes(permission)
        && Object.keys(grant.scope).length === 0 && Object.keys(grant.roleScope ?? {}).length === 0);
}
function relatedInvoiceRead(s: State, a: Actor, supplier: Data) {
    return all(s, 'invoice').some(invoice => (invoice.supplier === supplier.id
        || s.get('order:' + invoice.order)?.value.supplier === supplier.id) && allowed(s, a, 'invoice.read', invoice));
}
/** Mask eligibility concerns the exact supplier row, including after a merge. */
export function mayReadProtectedSupplier(s: State, a: Actor, supplier: Data) {
    if (a.owner || unrestrictedPermission(s,a,'request.read') || unrestrictedPermission(s,a,'invoice.read')) return true;
    return all(s, 'request').some(request => request.supplier === supplier.id && allowed(s, a, 'request.read', request))
        || relatedInvoiceRead(s, a, supplier);
}
export function mayReadPrivateSupplier(s: State, a: Actor, supplier: Data) {
    return unrestrictedPermission(s, a, 'procurement.manage') || relatedInvoiceRead(s, a, supplier);
}

/** Byte doors use the same permission as their actual parent, never a UI role. */
export function canReadRecord(s: State, a: Actor, kind: string, record: Data, visited = new Set<string>()): boolean {
    if (!resolvedPermissions(s, a).length) return false;
    const identity = kind + ':' + record.id;
    if (visited.has(identity)) return false;
    visited.add(identity);
    if (kind === 'intakeDraft') return record.requester === a.id && record.requesterEmail === a.email && allowed(s,a,'request.create');
    if (kind === 'travelExpense') return a.owner && allowed(s,a,'request.read',get(s,'request',record.request));
    if (kind === 'quote') return allowed(s,a,'request.read',record);
    if (kind === 'request') return allowed(s, a, 'request.read', record);
    if (kind === 'order') return allowed(s, a, 'po.read', record);
    if (['supplierInvoiceSubmission','invoice', 'invoiceSource', 'invoiceReading', 'invoiceReadingEvent'].includes(kind)) return allowed(s, a, 'invoice.read', record);
    if (['rfq', 'rfqResponse', 'rfqMailEvent'].includes(kind)) return allowed(s, a, 'rfq.read', record);
    if (kind === 'supplier') return true;
    if (kind === 'supplierDocument') return mayReadPrivateSupplier(s, a, get(s, 'supplier', record.supplier));
    if (['agreement', 'agreementReading', 'agreementReadingEvent'].includes(kind)) {
        if (unrestrictedPermission(s, a, 'procurement.manage')) return true;
        const selected = performanceAgreementSources(s, a);
        const readingId = kind === 'agreementReading' ? record.id : record.reading;
        return kind === 'agreement' ? selected.versions.has(record.id)
            : selected.readingVersions.has(readingId) && selected.readingVersions.get(readingId) === record.version;
    }
    if (kind === 'attachment') {
        const parent = s.get(record.kind + ':' + record.record)?.value;
        if (!parent) return false;
        if (record.privateSupplierDocument && !mayReadPrivateSupplier(s, a, get(s, 'supplier', record.record))) return false;
        if (record.kind === 'invoiceSource' && parent.attachment !== record.id) return false;
        if (record.kind === 'agreement') return unrestrictedPermission(s, a, 'procurement.manage')
            || performanceAgreementSources(s, a).attachments.has(record.id);
        return canReadRecord(s, a, record.kind, parent, visited);
    }
    if (kind === 'orderThreadMessage') {
        const order=s.get('order:'+record.order)?.value;
        const request=order&&s.get('request:'+order.request)?.value;
        return Boolean(order&&request&&(allowed(s,a,'procurement.manage',order)||request.requester===a.id&&allowed(s,a,'po.read',order)));
    }
    if (kind === 'agentRun') {
        if (record.agent === 'AGENT-008') return codingAgentRunVisible(s,a,record);
        if (a.owner) return true;
        if (record.agent === 'AGENT-011' && !allowed(s,a,'report.read')) return false;
        if (record.workflow === 'value-realization') {
            const request = s.get('request:' + record.request)?.value;
            return Boolean(request && allowed(s, a, 'request.read', request));
        }
        if (!a.owner && record.actor !== a.id) return false;
        return (record.references ?? []).every((reference: Data) => {
            // Generated quote records contain curated governance snapshots, not
            // the owner's private control rows. Their purchasing references below
            // still require the author's current RFQ/request source scope.
            if(['AGENT-002','AGENT-011'].includes(record.agent)&&reference.kind==='agentPolicy')return s.get('agentPolicy:'+reference.id)?.value.agent===record.agent;
            if(record.agent==='AGENT-002'&&reference.kind==='quoteAgentConsent'){const consent=s.get('quoteAgentConsent:'+reference.id)?.value;const rfq=s.get('rfq:'+record.rfq)?.value;return Boolean(consent?.request===record.request&&rfq&&allowed(s,a,'rfq.read',rfq));}
            const source = s.get(reference.kind + ':' + reference.id)?.value;
            return source && canReadRecord(s, a, reference.kind, source, new Set(visited));
        });
    }
    if (kind === 'proposedAction') {
        if (a.owner) return true;
        const run = s.get('agentRun:' + record.run)?.value;
        return Boolean((a.owner || record.actor === a.id) && run && canReadRecord(s, a, 'agentRun', run, visited));
    }
    return false;
}
export function requireRecordRead(s: State, a: Actor, kind: string, record: Data) {
    requireThat(canReadRecord(s, a, kind, record), 'Record outside your scope', 403);
}

/** A broader read grant never lends another grant its buyer suffix privilege. */
export function protectedReadCapabilities(s:State,a:Actor,supplier:Data){
 if(a.owner)return ['owner','buyer'];
 const buyer=accessGrants(s,a).some(grant=>grant.role==='buyer' && ((!Object.keys(grant.scope).length&&!Object.keys(grant.roleScope??{}).length)
  || all(s,'request').some(request=>request.supplier===supplier.id&&grantAllows(s,a,grant,'request.read',request))
  || all(s,'invoice').some(invoice=>(invoice.supplier===supplier.id||s.get('order:'+invoice.order)?.value.supplier===supplier.id)&&grantAllows(s,a,grant,'invoice.read',invoice))));
 return buyer?['buyer']:[];
}
