import { creditInvoiceVersion, invoiceCreditApplied } from './invoices';
import { mayAmendTravel } from './travel';
import { requestBudgetReview } from './budget-allocations';
import { projectApprovalEdit } from './approval-edit-view';
import { chainHolder, chainHolderEmail, approvalRouteView } from './approval-chain';
import { adoptionDeposits, orderAdoption } from './adoption-position';
import { releasePosition } from './blanket-releases';
import { servicePosition } from './service-orders';
import { currentScimAssignment, scimAssignmentAllows, scimApprovalHolder } from './scim-approvals';
import { accessGrants, allowed, buyerLimit, buyerLimits } from './access';
import { canReadCommentParent, canReadRecord, unrestrictedPermission } from './access-records';
import { blanketPosition } from './blanket-orders';
import { publicEvidence } from './invoice-status';
import { coveringPolicies } from './policy-match';
import { auditEventAllowed } from './access-audit';
import { discrepancies, linePosition } from './orders';
import { mayReceive, receiptDay, receiptAssignment, receiptMatch, receiptMatchingStatus, receiptVersion } from './receipt-routing';
import { all, type Actor, type Data, type State } from './types';

function mayApprove(s: State, a: Actor, request: Data) {
    if (request.status !== 'pending' || !allowed(s, a, 'request.approve', request)
        || request.requester === a.id || request.requesterEmail?.toLowerCase() === a.email.toLowerCase()) return false;
    if (request.approvalRoute) return chainHolder(s,a,request);
    if (currentScimAssignment(s, request)) return scimAssignmentAllows(s, a, request);
    const policy = s.get('policy:' + request.policy)?.value;
    return Boolean(policy && (policy.approver === a.email || all(s, 'delegation').some(delegation => delegation.policy === policy.id
        && delegation.from === policy.approver && delegation.delegate === a.email && delegation.active && Date.parse(delegation.expires) > Date.now())));
}
/** Billed balances sum every invoice on the blanket's purchase, so only a reader of each
 * such invoice sees them; other PO readers keep the approved cap, validity and releases.
 */
function blanketView(s: State, a: Actor, order: Data) {
    const blanket = blanketPosition(s, order)!, position = releasePosition(s, order);
    const invoices = all(s, 'invoice').filter(invoice => s.get('order:' + invoice.order)?.value.request === order.request);
    if (allowed(s, a, 'invoice.read', order) && invoices.every(invoice => allowed(s, a, 'invoice.read', invoice))) return { blanketPosition: blanket, releasePosition: position };
    const { billedMinor, remainingMinor, overCapMinor, ...approved } = blanket;
    return { blanketPosition: approved, releasePosition: { currentOrder: position.currentOrder, releases: position.releases.map(({ billedMinor, remainingMinor, ...release }: Data) => release) } };
}
export function purchasingProjection(s: State, a: Actor) {
    const budgetPolicies=all(s,'policy');
    const requests = all(s, 'request').filter(request => allowed(s, a, 'request.read', request));
    const orders = all(s, 'order').filter(order => allowed(s, a, 'po.read', order));
    const invoices = all(s, 'invoice').filter(invoice => allowed(s, a, 'invoice.read', invoice));
    const requestIds = new Set(requests.map(request => request.id)), orderIds = new Set(orders.map(order => order.id)), invoiceIds = new Set(invoices.map(invoice => invoice.id));
    const data: Data = {
        request: requests.map(request => ({ ...projectApprovalEdit(s,a,request), ...approvalRouteView(s,a,request), budgetReview:requestBudgetReview(request,budgetPolicies), approvalHolder: request.approvalRoute ? chainHolderEmail(s,request) : scimApprovalHolder(s, request), approvalTransferred: Boolean(currentScimAssignment(s, request)), approvalNeedsReassignment: currentScimAssignment(s, request)?.held === true, mayAmendTravel: request.purchaseType === 'travel' && mayAmendTravel(s,a,request), mayConfirmTravelExpense: allowed(s, a, 'request.read', request) && allowed(s, a, 'payable.approve', request), mayEdit: allowed(s, a, 'request.edit', request), mayApprove: mayApprove(s, a, request), approverEditRule: request.approvalRoute ? (s.get('policy:'+request.policy)?.value.editRules?.[request.purchaseType ?? request.lines[0].category.toLowerCase()] ?? s.get('policy:'+request.policy)?.value.editRules?.['*']) : undefined,
            mayPrepareValue: ['request.edit', 'request.approve', 'receive', 'procurement.manage'].some(permission => allowed(s, a, permission, request)),
            mayConvert: request.purchaseType !== 'travel' && allowed(s, a, 'po.convert', request), mayChangeNeedDate: request.purchaseType !== 'travel' && request.status === 'approved' && (request.requester === a.id && allowed(s,a,'request.edit',request) || allowed(s,a,'request.approve',request)), mayManagePurchasing: allowed(s, a, 'procurement.manage', request), mayManageRfq: allowed(s, a, 'rfq.manage', request),
            buyerLimit: buyerLimit(s, a, request), buyerLimits: buyerLimits(s, a, request) })),
        order: orders.map(order => ({ ...order, ...(orderAdoption(s, order) ? { adoptionBasis: 'Owner adopted imported obligation; source approval is historical', ...(allowed(s,a,'invoice.read',order) ? { depositPosition: adoptionDeposits(s, order) } : {}) } : {}), ...(order.poDetails?.blanket ? blanketView(s, a, order) : {}),
            receivingDate: receiptDay(s, Date.now()), receiverAssignment: receiptAssignment(s, order), mayReceive: mayReceive(s, a, order), receiptVersion: receiptVersion(s, order),
            ...(mayReceive(s, a, order) ? { receiptMatchingStatus: receiptMatchingStatus(s, order) } : {}),
            mayCaptureInvoice: allowed(s, a, 'invoice.capture', order), maySetCashExpectation: allowed(s, a, 'payable.terms', order),
            mayManageReceipt: allowed(s, a, 'procurement.manage', order), mayReassignReceipt: ['issued','adopted'].includes(order.status) && mayReceive(s, a, order) && allowed(s, a, 'receive', order),
            mayManagePurchasing: allowed(s, a, 'procurement.manage', order),
            mayAuthorizeSupplierInvoices:a.owner, mayReadSupplierThread: allowed(s,a,'procurement.manage',order) || (s.get('request:'+order.request)?.value.requester === a.id && allowed(s,a,'po.read',order)), mayIssue: allowed(s, a, 'po.issue', order), supplierInitial: Boolean(!order.imported && !order.adoption && order.issuedAt && !s.get('revision:'+order.request+':'+order.revision)?.value.amends && !order.cancellation), supplierChange: Boolean(!order.imported && !order.adoption && (s.get('revision:'+order.request+':'+order.revision)?.value.amends || order.cancellation)), positions: order.lines.map((line: Data) => ({ line: line.id, ...linePosition(s, order.id, line), ...(line.service ? servicePosition(s, order, line) : {}) })) })),
        invoice: invoices.map(invoice => ({ ...publicEvidence(invoice), creditVersion: creditInvoiceVersion(s,invoice), creditAppliedMinor: invoiceCreditApplied(s,invoice.id), receiptMatch: receiptMatch(s, invoice), matchingException: discrepancies(s).find(d => d.invoiceId === invoice.id && d.exception === 'Invoice exceeds received service value')?.exception,
            maySetTerms: allowed(s, a, 'payable.terms', invoice), mayApprove: allowed(s, a, 'payable.approve', invoice),
            mayReview: allowed(s, a, 'invoice.review', invoice), mayCapture: allowed(s, a, 'invoice.capture', invoice),
            flags: invoice.flags?.map((flag: Data) => !flag.relatedInvoice || invoiceIds.has(flag.relatedInvoice) ? flag : { ...flag, relatedInvoice: undefined }) })),
        receipt: all(s, 'receipt').filter(receipt => orderIds.has(receipt.order)),
        orderClosure: all(s, 'orderClosure').filter(closure => orderIds.has(closure.order)),
        quoteAward: all(s, 'quoteAward').filter(award => requestIds.has(award.request) && (!award.rfq || allowed(s, a, 'rfq.read', award))),
        discrepancies: discrepancies(s).filter(discrepancy => invoiceIds.has(discrepancy.invoiceId)),
    };
    for (const kind of ['revision', 'decision', 'quote', 'commitment']) data[kind] = all(s, kind).filter(record => requestIds.has(record.request)
        && allowed(s, a, 'request.read', record) && (kind !== 'quote' || !record.rfq || allowed(s, a, 'rfq.read', record)));
    data.revision=data.revision.map((revision:Data)=>projectApprovalEdit(s,a,revision));
    const revisionKeys = new Set(data.revision.map((revision: Data) => revision.request + ':' + revision.revision)), quoteIds = new Set(data.quote.map((quote: Data) => quote.id));
    data.quoteAward = data.quoteAward.filter((award: Data) => revisionKeys.has(award.request + ':' + award.revision)
        && quoteIds.has(award.firstQuote) && quoteIds.has(award.awardedQuote));
    // A whole-policy budget is not the department's budget when hidden requests use it,
    // including earlier authority retained while a current amendment is still a draft.
    const policyUsers: Data[] = [...all(s, 'request').map(request => ({ ...request, request: request.id })),
        ...all(s, 'commitment'), ...all(s, 'decision'), ...all(s, 'revision')];
    const unscopedRequestRead = unrestrictedPermission(s, a, 'request.read');
    data.policy = all(s, 'policy').filter(policy => (unscopedRequestRead || allowed(s, a, 'access.manage', policy)
        || requests.some(request => request.policy === policy.id || coveringPolicies([policy], request).length > 0))
        && !policyUsers.some(record => record.policy === policy.id && (!requestIds.has(record.request)||!allowed(s,a,'request.read',record))));
    const policyIds = new Set(data.policy.map((policy: Data) => policy.id));
    data.decision=data.decision.map((decision:Data)=>decision.policySnapshot&&!policyIds.has(decision.policy)?{...decision,policySnapshot:null,snapshotBasis:'Whole-policy snapshot outside your purchase scope'}:decision);
    data.delegation = all(s, 'delegation').filter(delegation => policyIds.has(delegation.policy));
    data.totals = data.commitment.reduce((totals: Data, event: Data) => ({ ...totals, [event.currency]: (totals[event.currency] ?? 0) + event.amountMinor }), {});
    return { data, requestIds, orderIds, invoiceIds };
}

export function peopleProjection(s: State, a: Actor, orders: Data[]) {
    const mayRoute = (order: Data) => allowed(s, a, 'procurement.manage', order) || mayReceive(s, a, order) && allowed(s, a, 'receive', order);
    const globalDirectory = a.owner || accessGrants(s, a).some(grant => grant.role !== 'requester' && grant.permissions.includes('request.read')
        && Object.keys(grant.scope).length === 0 && Object.keys(grant.roleScope ?? {}).length === 0);
    const candidates = all(s, 'member').filter(member => member.active);
    const receivers = candidates.filter(member => {
        const target: Actor = { id: '', email: member.email, owner: false, session: '', dev: false, version: 0 };
        return unrestrictedPermission(s, a, 'procurement.manage') ? allowed(s, target, 'receive')
            : orders.some(order => mayRoute(order) && allowed(s, target, 'receive', order));
    }).map(member => ({ id: member.email, email: member.email, name: member.name }));
    const receiverEmails = new Set(receivers.map(receiver => receiver.email));
    return { receivers, people: candidates.filter(member => globalDirectory || member.email.toLowerCase() === a.email.toLowerCase() || receiverEmails.has(member.email))
        .map(member => ({ email: member.email, name: member.name, roles: member.roles })), member: a.owner ? all(s, 'member') : [] };
}

export function scopeAuditRows(s: State, a: Actor, data: Data) {
    if (a.owner) return all(s, 'audit');
    const policyIds = new Set(data.policy.map((policy: Data) => policy.id));
    data.decision=data.decision.map((decision:Data)=>decision.policySnapshot&&!policyIds.has(decision.policy)?{...decision,policySnapshot:null,snapshotBasis:'Whole-policy snapshot outside your purchase scope'}:decision);
    return all(s, 'audit').filter(event => {
        const action = typeof event.action === 'string' ? event.action : '';
        if(['amend','approver-edit'].includes(action)&&event.revision){const prior=s.get('revision:'+event.record+':'+(event.revision-1))?.value;if(prior&&!allowed(s,a,'request.read',prior))return false;}
        if (action.startsWith('supplier-credit-') && !allowed(s,a,'invoice.read',event)) return false;
        if ((action.startsWith('invoice') || event.invoice) && !allowed(s, a, 'invoice.read', event)) return false;
        if (action.startsWith('cross-review-') && event.review) { const review=s.get('crossTeamReview:'+event.review)?.value; if(!review || !canReadRecord(s,a,'crossTeamReview',review))return false; }
        if (action.startsWith('cash-') && !allowed(s, a, 'cash.read', event)) return false;
        if (auditEventAllowed(s, a, event)) return true;
        if (event.rfq && !allowed(s, a, 'rfq.read', event)) return false;
        // Internal notification pointers are not independent audit subjects.
        const sources = [...s.values()].filter(row => row.id === event.record && !['audit','notificationRequestHead'].includes(row.kind));
        if (sources.length === 1) {
            const row = sources[0];
            if (row.kind === 'supplier') return unrestrictedPermission(s, a, 'procurement.manage');
            if (row.kind === 'policy') return policyIds.has(row.id);
            if (row.kind === 'agreement' && action.startsWith('comment-')) return canReadCommentParent(s, a, row.kind, { ...row.value, id: row.id });
            return canReadRecord(s, a, row.kind, { ...row.value, id: row.id });
        }
        return event.actor === a.id && event.action === 'protected-input-refused';
    }).map(event=>projectApprovalEdit(s,a,event)).map(event => event.links ? { ...event, links: projectPurchaseLinks(data, event.links) } : event);
}

export function projectPurchaseLinks(data: Data, links: Data) {
    return Object.fromEntries(Object.entries(links).map(([kind, records]) => [kind, Array.isArray(records)
        ? records.filter((record: Data) => (data[kind] ?? []).some((visible: Data) => visible.id === record.id)) : []]));
}

/** Derived register analytics receive a complete, permitted source subgraph. */
export function analyticState(s: State, data: Data): State {
    const selected: State = new Map();
    // The calculators still check the real current grants. These authority rows
    // stay server-side and are never part of a register calculator's result.
    for (const [id, row] of s) if (['member', 'accessRole', 'buyerRoleLimit'].includes(row.kind)) selected.set(id, row);
    const kinds = ['supplier', 'catalogue', 'catalogueBundle', 'business', 'policy', 'request', 'order', 'invoice', 'receipt', 'orderClosure',
        'supplierOrderEvidence', 'supplierIssue', 'supplierMerge', 'attachment', 'audit'];
    for (const kind of kinds) for (const value of data[kind] ?? []) {
        if (kind === 'invoice' && !data.order.some((order: Data) => order.id === value.order)) continue;
        const row = s.get(kind + ':' + value.id); if (row) selected.set(kind + ':' + value.id, { ...row, value });
    }
    return selected;
}
