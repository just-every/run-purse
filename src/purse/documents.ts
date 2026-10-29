import { absenceSettings } from './approval-absence';
import { supplierTaxView } from './supplier-tax';
import { visibleSupplierCredits } from './supplier-credits';
import { reviewView } from './cross-team-reviews';
import { visibleBudgetAlerts } from './budget-alerts';
import { visibleCodingAgent } from './coding-agent';
import {poGenerationQueue} from './po-generation';
import { visibleRecurringScenarios } from './recurring-scenarios';
import { visibleTravel } from './travel';
import { approvalEditNotices } from './approval-edit-view';
import { visibleBudgetPositions } from './budget-view';
import { visibleIntakeForms } from './intake-forms';
import { projectProtectedContext } from './protected-context';
import { publicEvidence } from './invoice-status';
import { visibleAgentValue, projectValueRecord } from './agent-value';
import { visibleAgreementReadings } from './agreement-reading';
import { visibleAgreements } from './agreements';
import { visibleEmailIntakes } from './email-intake';
import { visibleRfqs } from './rfq';
import { visibleInvoiceReadings } from './invoice-reading';
import { visibleInvoiceInbox } from './invoice-inbox';
import { visibleQuoteReadings } from './quote-reading';
import { poContent, poHtml } from './po-content';
import { cashRequirements } from './cash-requirements';
import { all, get, requireThat, roles, type Actor, type Data, type State } from './types';
import { discrepancies } from './orders';
import { supplierFamilies } from './supplier-merge';
import { supplierPublicValue } from './supplier-identity';
import { catalogueAllows } from './catalogue-access';
import { currentPrice } from './catalogue';
import { supplierScorecards } from './supplier-performance';
import { supplierDocumentStatus } from './supplier-documents';
import { accessGrants, allowed, requirePermission, resolvedPermissions } from './access';
import { canReadRecord, mayReadPrivateSupplier, mayReadProtectedSupplier, requireRecordRead, unrestrictedPermission } from './access-records';
import { analyticState, peopleProjection, projectPurchaseLinks, purchasingProjection, scopeAuditRows } from './access-projection';
import { scopedAgreementEvidence } from './access-agreement-sources';
import { buyerZeroSubjects } from './access-zero';

function cashView(s: State, a: Actor, orderIds: Set<string>, invoiceIds: Set<string>) {
    if (!allowed(s, a, 'cash.read')) return null;
    const cash = cashRequirements(s, a), bills = cash.bills.filter(bill => invoiceIds.has(bill.invoice)), commitments = cash.commitments.filter(order => orderIds.has(order.order));
    const weeks = new Map<string, Data>();
    for (const [field, records] of [['billsMinor', bills], ['commitmentsMinor', commitments]] as const) for (const record of records) {
        const id = record.week + ':' + record.currency, week = weeks.get(id) ?? { week: record.week, currency: record.currency, billsMinor: 0, commitmentsMinor: 0 };
        week[field] += record.amountMinor; week.totalMinor = week.billsMinor + week.commitmentsMinor; weeks.set(id, week);
    }
    return { bills, commitments, weeks: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week) || a.currency.localeCompare(b.currency)) };
}
export function visible(s: State, a: Actor, protectedViews?: Map<string, Data>) {
    const permissions = resolvedPermissions(s, a); requireThat(permissions.length, 'No active business membership', 403);
    const { data, requestIds, orderIds, invoiceIds } = purchasingProjection(s, a);
    data.request = data.request.map((r: Data) => ({...r, crossTeamReviews: reviewView(s,a,get(s,'request',r.id))}));
    data.poGenerationPolicy=a.owner?all(s,'poGenerationPolicy'):[];
    data.poGenerationEvent=all(s,'poGenerationEvent').filter(row=>requestIds.has(row.request));
    data.poGenerationQueue=poGenerationQueue(s).filter(row=>requestIds.has(row.request)).map(row=>({...row,mayConvert:allowed(s,a,'po.convert',get(s,'request',row.request))&&allowed(s,a,'po.issue',get(s,'request',row.request))}));
    Object.assign(data,absenceSettings(s,a));
    data.approvalEditNotice = approvalEditNotices(s, a);
    Object.assign(data, visibleTravel(s, a, requestIds));
    for (const kind of ['business', 'code']) data[kind] = all(s, kind);
    Object.assign(data, visibleAgentValue(s, a, requestIds), visibleEmailIntakes(s, a), visibleRfqs(s, a),
        visibleQuoteReadings(s, requestIds), visibleInvoiceReadings(s, a), visibleInvoiceInbox(s, a), peopleProjection(s, a, data.order));
    Object.assign(data, visibleIntakeForms(s, a));
    data.intakeDraft = allowed(s,a,'request.create') ? all(s,'intakeDraft').filter(draft => draft.requester === a.id && draft.requesterEmail === a.email && draft.status === 'draft') : [];
    data.supplierProposal = all(s,'supplierProposal').filter(proposal => proposal.requester === a.id || unrestrictedPermission(s,a,'procurement.manage'));
    const globalProcurement = unrestrictedPermission(s, a, 'procurement.manage');
    data.mayManageSupplierRegister = globalProcurement;
    data.periodBudgets = visibleBudgetPositions(s, a, data);
    data.budgetAlerts = visibleBudgetAlerts(s,a);
    data.budgetAssignment = a.owner ? all(s,'budgetAssignment') : [];
    data.supplier = all(s, 'supplier').map(supplier => {
        const eligible = mayReadProtectedSupplier(s, a, supplier), value: Data = supplierPublicValue(supplier, eligible ? protectedViews?.get(supplier.id) : undefined);
        delete value.proposedBy;
        if (!eligible) { delete value.matchingOnly; delete value.sourceRedaction; }
        return { ...value, mayReadProtected: eligible, mayManagePurchasing: globalProcurement, documents: (supplier.documents ?? []).filter((id: string) => {
            const attachment = s.get('attachment:' + id)?.value;
            return attachment && canReadRecord(s, a, 'attachment', attachment);
        }) };
    });
    const requestable = (item: Data) => item.approved && currentPrice(item) && catalogueAllows(s, a, item);
    data.stockroom = all(s, 'stockroom').filter(stock => allowed(s, a, 'procurement.manage', stock));
    const stockCatalogueIds = new Set(data.stockroom.map((stock: Data) => stock.catalogue));
    data.catalogue = all(s, 'catalogue').filter(item => globalProcurement || stockCatalogueIds.has(item.id) || requestable(item)).map(item => ({ ...item, requestable: requestable(item) }));
    data.catalogueBundle = all(s, 'catalogueBundle').filter(bundle => globalProcurement || bundle.approved && catalogueAllows(s, a, bundle)
        && bundle.items.every((item: Data) => requestable(get(s, 'catalogue', item.catalogue)))).map(bundle => ({ ...bundle,
            requestable: bundle.approved && catalogueAllows(s, a, bundle) && bundle.items.every((item: Data) => requestable(get(s, 'catalogue', item.catalogue))) }));
    data.catalogueGrant = a.owner ? all(s, 'catalogueGrant') : [];
    const agreementState = new Map([...s].filter(([, row]) => row.kind !== 'agreementInvoice' || invoiceIds.has(row.value.invoice) && orderIds.has(row.value.order)));
    Object.assign(data, globalProcurement ? { ...visibleAgreements(agreementState, a), ...visibleAgreementReadings(s, a) }
        : scopedAgreementEvidence(s, a));
    if(!globalProcurement)for(const agreement of all(s,'agreement').filter(r=>r.owner===a.id&&r.ownerEmail?.toLowerCase()===a.email.toLowerCase())){
        const terms=Object.fromEntries('id,version,name,reference,supplier,currency,valueMinor,parties,startDate,endDate,autoRenew,noticeDays,noticeDeadline,paymentTerms,owner,ownerEmail,renewalTermMonths,renewalIncreaseCapBps,remindersEnabled,reminderDays'.split(',').filter(k=>agreement[k]!==undefined).map(k=>[k,agreement[k]]));
        if(!data.agreement.some((r:Data)=>r.id===agreement.id))data.agreement.push({...terms,termsOnly:true});
    }
    data.agreementAward = all(s, 'agreementAward').filter(award => requestIds.has(award.request)
        && ['procurement.manage', 'performance.read'].some(permission => allowed(s, a, permission, award))
        && data.revision.some((revision: Data) => revision.request === award.request && revision.revision === award.revision));
    data.receiptRule = all(s, 'receiptRule').filter(rule => rule.order ? orderIds.has(rule.order) : globalProcurement
        || data.order.some((order: Data) => (order.mayManageReceipt || order.mayReassignReceipt) && (rule.location === '*' || rule.location === order.location)
            && (rule.purchaseType === '*' || order.lines.every((line: Data) => line.category === rule.purchaseType))));
    data.receiptPromptEvent = all(s, 'receiptPromptEvent').filter(event => orderIds.has(event.order));
    data.recurringSeries = all(s, 'recurringSeries').filter(series => orderIds.has(series.order)).map(series => ({...series, mayAuthorize: allowed(s,a,'request.approve',get(s,'request',series.request)) && get(s,'request',series.request).requester !== a.id, mayDecide: a.owner && series.owner === a.id}));
    data.recurringEvent = all(s, 'recurringEvent').filter(event => data.recurringSeries.some((series: Data) => series.id === event.series));
    Object.assign(data, visibleRecurringScenarios(s,a));
    data.poProfile = a.owner ? all(s, 'poProfile') : [];
    data.deposit = all(s, 'deposit').filter(deposit => orderIds.has(deposit.order) && allowed(s, a, 'invoice.read', get(s, 'order', deposit.order)));
    data.budget = a.owner ? all(s, 'budget') : [];
    data.orderAdoption = a.owner ? all(s, 'orderAdoption').filter(adoption => orderIds.has(adoption.order)) : [];
    data.supplierInvoiceRules = a.owner ? all(s,'orderSend').map(event=>({order:event.order,revision:event.revision,invoiceSubmission:event.invoiceSubmission===true,invoiceApprovalRule:event.invoiceApprovalRule})) : [];
    data.supplierInvoiceSubmission=all(s,'supplierInvoiceSubmission').filter(row=>invoiceIds.has(row.invoice));
    data.payable = all(s, 'payable').filter(payable => invoiceIds.has(payable.invoice) && ['cash.read', 'payable.terms', 'payable.approve']
        .some(permission => allowed(s, a, permission, get(s, 'invoice', payable.invoice))));
    data.cashExpectation = all(s, 'cashExpectation').filter(expectation => orderIds.has(expectation.order)
        && ['cash.read', 'payable.terms'].some(permission => allowed(s, a, permission, get(s, 'order', expectation.order))));
    Object.assign(data, visibleSupplierCredits(s,a));
    data.cashRequirements = cashView(s, a, orderIds, invoiceIds);
    Object.assign(data, visibleCodingAgent(s,a));
    data.agentPolicy = a.owner ? all(s, 'agentPolicy') : [];
    data.orderChasePolicy = all(s, 'orderChasePolicy').filter(record => orderIds.has(record.order)
        && allowed(s, a, 'procurement.manage', get(s, 'order', record.order)));
    data.lateOrderNotice = all(s, 'lateOrderNotice').filter(record => orderIds.has(record.order));
    data.orderChaseEvent = all(s, 'orderChaseEvent').filter(record => orderIds.has(record.order));
    data.order = data.order.map((order: Data) => {
        const acknowledgment = all(s, 'orderSend').find(sent => sent.order === order.id && sent.revision === order.revision)?.acknowledgment;
        return { ...order, ...(acknowledgment ? { supplierChangeAcknowledgment: { revision: acknowledgment.revision, at: acknowledgment.at } } : {}) };
    });
    data.supplierOrderEvidence = all(s, 'supplierOrderEvidence').filter(evidence => orderIds.has(evidence.order)
        && ['procurement.manage', 'performance.read'].some(permission => allowed(s, a, permission, get(s, 'order', evidence.order))));
    data.orderChaseEvidence = all(s, 'supplierOrderEvidence').filter(evidence => orderIds.has(evidence.order));
    data.supplierIssue = all(s, 'supplierIssue').filter(issue => orderIds.has(issue.order)
        && ['procurement.manage', 'performance.read'].some(permission => allowed(s, a, permission, get(s, 'order', issue.order))));
    data.supplierTax = a.owner ? all(s,'supplier').filter(supplier => !supplier.mergedInto).map(supplier => supplierTaxView(s,a,supplier.id)) : [];
    const supplierDocumentIds = new Set<string>();
    data.supplierDocument = all(s, 'supplierDocument').filter(document => mayReadPrivateSupplier(s, a, get(s, 'supplier', document.supplier)))
        .map(document => { supplierDocumentIds.add(document.id); return { ...document, compliance: supplierDocumentStatus(s, document) }; });
    for (const kind of ['supplierDocumentReminder', 'supplierDocumentSubmission']) data[kind] = all(s, kind).filter(record => supplierDocumentIds.has(record.document));
    data.attachment = all(s, 'attachment').filter(attachment => canReadRecord(s, a, 'attachment', attachment)).map(({ base64, ...attachment }) => attachment);
    for(const kind of ['quoteAgentConsent','quoteAgentReview']) data[kind]=all(s,kind).filter(row=>data.rfq.some((rfq:Data)=>rfq.id===row.rfq));
    data.agentRun = all(s, 'agentRun').filter(run => canReadRecord(s, a, 'agentRun', run)).map(run => run.workflow === 'value-realization'
        ? projectValueRecord(s, a, projectProtectedContext('agentRun', run)) : projectProtectedContext('agentRun', run));
    data.proposedAction = all(s, 'proposedAction').filter(proposal => canReadRecord(s, a, 'proposedAction', proposal)).map(proposal => projectProtectedContext('proposedAction', proposal));
    data.audit = scopeAuditRows(s, a, data);
    data.supplierMerge = globalProcurement ? all(s, 'supplierMerge').map(merge => ({ ...merge, links: projectPurchaseLinks(data, merge.links ?? {}) })) : [];
    const safeState = analyticState(s, data);
    data.supplierScorecards = allowed(s, a, 'procurement.manage') ? supplierScorecards(safeState, a) : [];
    data.supplierFamilies = allowed(s, a, 'procurement.manage') ? supplierFamilies(safeState).map(family => ({ ...family,
        members: family.members.map((member: Data) => data.supplier.find((supplier: Data) => supplier.id === member.id)),
        invoices: family.invoices.map((invoice: Data) => publicEvidence(invoice)) })) : [];
    data.registerAnalyticsScoped = !globalProcurement;
    data.accessRole = all(s, 'accessRole').filter(role => allowed(s, a, 'access.manage', role));
    data.buyerRoleLimit = all(s, 'buyerRoleLimit').filter(limit => allowed(s, a, 'access.manage', limit));
    data.buyerZeroSubjects = buyerZeroSubjects(s, a);
    data.mayZeroBuyerRoleLimits = unrestrictedPermission(s, a, 'access.manage');
    return { actor: { id: a.id, email: a.email, roles: roles(s, a), mayReadAssignedAgreement:data.agreement.some((r:Data)=>r.termsOnly), mayReviewRecurring:data.recurringScenario.length>0||data.recurringDiscoveryNotice.length>0, permissions, grants: accessGrants(s, a), dev: a.dev }, data };
}

export function recordScope(s: State, a: Actor, kind: string, record: Data) { requireRecordRead(s, a, kind, record); }
export function download(s: State, a: Actor, kind: string, id: string) {
    const record = get(s, kind, id); recordScope(s, a, kind, record);
    if (kind === 'attachment') requireThat(!record.erasure, 'Original removed by personal-data erasure; financial lineage retained', 410);
    if (kind === 'attachment') return new Response(Uint8Array.from(atob(record.base64), char => char.charCodeAt(0)), { headers: {
        'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${record.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"` } });
    if (kind === 'agentRun') {
        const projected = projectProtectedContext('agentRun', record);
        if (record.workflow === 'value-realization') return new Response(JSON.stringify(projectValueRecord(s, a, projected), null, 2), { headers: {
            'content-type': 'application/json', 'content-disposition': 'attachment; filename="value-report.json"' } });
        if (record.mode !== 'human-preparation') return new Response(JSON.stringify(projected, null, 2), { headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="agent-record.json"' } });
        return new Response(projected.draft + '\n\nMissing: ' + projected.missing.join(', ') + '\nSources: ' + JSON.stringify(projected.references), { headers: {
            'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'attachment; filename="preparation.txt"' } });
    }
    requireThat(kind === 'order', 'Unsupported document', 404);
    const supplier = record.supplierSnapshot ?? (record.imported ? get(s, 'supplier', record.supplier) : undefined);
    requireThat(supplier?.id === record.supplier, 'Approved supplier identity is missing; renew purchasing authority', 409);
    return new Response(poHtml(poContent(s, record)), { headers: { 'content-type': 'text/html; charset=utf-8',
        'content-disposition': `attachment; filename="${record.number.replace(/[^a-zA-Z0-9._-]/g, '_')}.html"`,
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:" } });
}
export function accounting(s: State, a: Actor) {
    requirePermission(s, a, 'invoice.read');
    const cell = (value: unknown) => '"' + String(value).replace(/"/g, '""').replace(/^[=+@-]/, "' $&") + '"';
    const byAllocation = new Map(discrepancies(s).map(discrepancy => [JSON.stringify([discrepancy.invoiceId, discrepancy.lineId]), discrepancy]));
    const rows = [['invoice', 'po', 'line', 'currency', 'quantity', 'amount_minor', 'price_mismatch', 'quantity_mismatch', 'receipt_shortfall'],
        ...all(s, 'invoice').filter(invoice => allowed(s, a, 'invoice.read', invoice)).flatMap(invoice => invoice.allocations.map((line: Data) => {
            const order = get(s, 'order', invoice.order), discrepancy = byAllocation.get(JSON.stringify([invoice.id, line.line]))!;
            return [invoice.reference, order.number, line.line, invoice.currency, line.quantity, line.amountMinor, discrepancy.priceMismatch, discrepancy.quantityMismatch, discrepancy.receiptShortfall];
        }))];
    return new Response(rows.map(row => row.map(cell).join(',')).join('\r\n'), { headers: {
        'content-type': 'text/csv', 'content-disposition': 'attachment; filename="purse-accounting.csv"' } });
}
