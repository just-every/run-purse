import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index';
import { supplier } from './admin';
import { lapsedSupplierDocuments } from './supplier-documents';
import { invoiceEvidence } from './invoice-evidence';
import { ledger, reserved } from './requests';
import { remainingValue } from './orders';
import { activeReceiver } from './receipt-routing';
import { orderAdoption } from './adoption-position';
import { all, audit, can, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

function adoptionReview(s: State, a: Actor, input: Data) {
    can(s, a, 'owner');
    const order = get(s, 'order', input.id);
    requireThat(order.imported && order.status === 'imported' && !orderAdoption(s, order), 'Choose an unadopted imported PO', 409);
    requireThat(!all(s, 'order').some(other => other.id !== order.id && other.number === order.number), 'Original PO number collides with another order; reconcile the source before adopting', 409);
    const sourceRequest = get(s, 'request', order.request), business = get(s, 'business', 'main');
    const counterparty = supplier(s, order.supplier);
    requireThat(!lapsedSupplierDocuments(s, counterparty.id).length, 'Required supplier document has lapsed; refresh and review before adoption', 409);
    const policy = get(s, 'policy', input.policy), location = text(input.location, 'Adopted location'), costCentre = text(input.costCentre, 'Adopted department');
    requireThat(business.locations.includes(location) && business.costCentres.includes(costCentre), 'Map adopted coding to configured business codes');
    requireThat(policy.active && policy.currency === order.currency, 'Map a current budget in the source PO currency', 409);
    const budget = input.budget ? get(s, 'budget', input.budget) : undefined;
    requireThat(!order.sourceBudget || budget && budget.sourceId === order.sourceBudget, 'Select the exact imported source budget for this PO', 409);
    if (budget) requireThat(budget.imported && budget.currency === order.currency && (!budget.location || budget.location === location) && (!budget.costCentre || budget.costCentre === costCentre), 'Imported budget currency and dimensions must cover this PO', 409);
    const existingMapping = budget && all(s, 'orderAdoption').find(adoption => adoption.budget === budget.id);
    if (existingMapping) requireThat(existingMapping.policy === policy.id, 'This source budget is already mapped to another native budget; reuse that mapping', 409);
    requireThat(!budget || !all(s, 'orderAdoption').some(adoption => adoption.policy === policy.id && adoption.budget && adoption.budget !== budget.id), 'This native budget is already mapped to another imported source', 409);
    const budgetMinor = budget && !existingMapping ? budget.amountMinor : policy.budgetMinor;
    const lines = order.lines.map((line: Data) => {
        requireThat(line.sourceDecision?.decision !== 'declined' && sourceRequest.lines.find((source: Data) => source.id === line.sourceRequestLine)?.sourceDecision?.decision !== 'declined', 'Declined historical items cannot be adopted into purchasing', 409);
        const received = all(s, 'receipt').filter(receipt => receipt.imported && receipt.order === order.id && receipt.line === line.id).reduce((sum, receipt) => sum + receipt.q, 0);
        requireThat(received <= line.q, 'Imported received quantity exceeds ordered quantity; reconcile the source', 409);
        requireThat((!budget?.project || budget.project === line.project) && business.projects.includes(line.project) && (policy.project === '*' || policy.project === line.project) && (policy.category === '*' || policy.category === line.category), 'Map every adopted line to this budget and configured project');
        return { ...line, carriedAccepted: received, carriedCancelled: 0 };
    });
    const receiver = text(input.receiver, 'Current receiver', 254).toLowerCase();
    requireThat(activeReceiver(s, receiver, { ...order, location, costCentre, lines }), 'Choose an active receiver within this PO scope', 409);
    const invoices = all(s, 'invoice').filter(invoice => invoice.order === order.id);
    requireThat(invoices.every(invoice => invoice.imported && invoice.currency === order.currency && invoice.supplier === order.supplier), 'Reconcile historical invoice identity and currency', 409);
    const deposits = all(s, 'deposit').filter(deposit => deposit.order === order.id);
    requireThat(deposits.every(deposit => deposit.currency === order.currency) && deposits.reduce((sum, deposit) => sum + deposit.amountMinor, 0) <= order.totalMinor, 'Source deposits exceed the PO face or differ in currency', 409);
    const face: Data = { ...order, location, costCentre, lines, policy: policy.id };
    const remainingMinor = remainingValue(s, face);
    // Adoption records an existing obligation; it does not grant the policy's approval authority.
    requireThat(policy.limitMinor >= face.totalMinor && reserved(s, policy.id) + remainingMinor <= budgetMinor, 'Mapped budget cannot hold this imported remainder', 409);
    const sourceVersions = [...new Set([order.id, sourceRequest.id, order.supplier, policy.id, ...(budget ? [budget.id] : []), ...invoices.map(invoice => invoice.id), ...deposits.map(deposit => deposit.id)])];
    const observations = [...s.values()].filter(row => sourceVersions.includes(row.id) || row.kind === 'receipt' && row.value.order === order.id || ['business','member','accessRole','supplierDocument'].includes(row.kind)).map(row => [row.kind, row.id, row.revision]).sort();
    const fingerprint = sha256(canonicalJson({ owner: a.id, order: order.id, policy: policy.id, location, costCentre, receiver, budget: budget?.id ?? null, budgetMinor, observations }));
    return { order, sourceRequest, counterparty, policy, lines, invoices, deposits, location, costCentre, receiver, remainingMinor, fingerprint, budget, budgetMinor, existingMapping };
}

export function adoptOrder(s: State, a: Actor, op: string, input: Data): Data | undefined {
    if (!['adopt-order-preview', 'adopt-order'].includes(op)) return;
    const review = adoptionReview(s, a, input);
    const { order, sourceRequest, policy, lines, invoices, deposits, location, costCentre, receiver, remainingMinor, fingerprint, budget, budgetMinor, existingMapping } = review;
    if (op === 'adopt-order-preview') return { fingerprint, order: order.id, number: order.number, currency: order.currency, remainingMinor,
        lines: lines.map((line: Data) => ({ line: line.id, ordered: line.q, received: line.carriedAccepted, billed: invoices.flatMap(invoice => invoice.allocations).filter((allocation: Data) => allocation.line === line.id).reduce((sum: number, allocation: Data) => sum + allocation.q, 0) })),
        billedMinor: invoices.reduce((sum, invoice) => sum + invoice.totalMinor, 0), unappliedDepositMinor: deposits.reduce((sum, deposit) => sum + deposit.amountMinor - deposit.appliedMinor, 0),
        sourceApproval: order.sourceApproval ?? { status: order.sourceStatus, evidence: null }, policy: policy.id, budget: budget?.id ?? null, budgetMinor };
    requireThat(input.reviewed === true && input.fingerprint === fingerprint, 'Review the exact current source balances, coding, budget and receiver before adopting', 409);
    const reason = text(input.reason, 'Adoption reason'), id = uid(), requestId = uid(), at = new Date().toISOString();
    const supplierSnapshot = structuredClone(order.supplierSnapshot ?? { id: order.supplier, name: review.counterparty.name, contacts: [], address: '', contractRef: '' });
    const request: Data = { ...order, id: requestId, imported: false, importedSourceRequest: sourceRequest.id, adoption: id, requester: a.id, requesterEmail: a.email, requesterOwner: true,
        title: order.title || order.name, supplierSnapshot, location, costCentre, lines: lines.map(({ sourceLine, ...line }: Data) => line), policy: policy.id, revision: 1, status: 'adopted' };
    for (const field of ['number','sequence','request','issuedAt','generatedAt','sourceId','sourceStatus','mappedStatus','mapping']) delete request[field];
    if (budget && !existingMapping) { put(s, 'policy', policy.id, { ...policy, budgetMinor }); audit(s, a, 'adopt-budget', policy.id, { sourceBudget: budget.id, amountMinor: budgetMinor, reason, adoption: id }); }
    put(s, 'request', requestId, request);
    put(s, 'revision', requestId + ':1', { ...request, id: requestId + ':1', request: requestId });
    put(s, 'orderAdoption', id, { id, order: order.id, request: requestId, sourceRequest: sourceRequest.id, sourceOrder: structuredClone(order), sourceApproval: order.sourceApproval ?? { status: order.sourceStatus, evidence: null },
        sourceBudget: order.sourceBudget || null, budget: budget?.id ?? null, importedBudgetMinor: budget?.amountMinor ?? null, policy: policy.id, location, costCentre, receiver, sourceInvoices: invoices.map(invoice => invoice.id), deposits: deposits.map(deposit => deposit.id),
        openingLines: lines.map((line: Data) => ({ line: line.id, q: line.q, accepted: line.carriedAccepted })), openingCommitmentMinor: remainingMinor, fingerprint, reason, actor: a.id, at, version: 1 });
    put(s, 'order', order.id, { ...order, adoption: id, sourceRequest: sourceRequest.id, request: requestId, supplierSnapshot, policy: policy.id, location, costCentre, lines, status: 'adopted', adoptedAt: at, issuedAt: null });
    for (const invoice of invoices) {
        const original = all(s, 'attachment').find(attachment => attachment.kind === 'invoice' && attachment.record === invoice.id && (!invoice.document || attachment.sha256 === invoice.document.sha256));
        const evidence = invoiceEvidence(s, get(s, 'order', order.id), invoice, { ...(invoice.invoiceDate ? { invoiceDate: invoice.invoiceDate } : { historicalDateMissing: true }),
            ...(invoice.sourceSender ? { senderEmail: invoice.sourceSender } : {}), ...(invoice.sourceRemit ? { remitTo: invoice.sourceRemit } : {}), ...(original ? { document: original } : {}) });
        put(s, 'invoice', invoice.id, { ...invoice, ...evidence, adoptedVia: id, sourceConfirmation: 'required', at: invoice.at ?? at, recordedAt: at });
    }
    const rule = uid(), assignment = { version: 1, receiver, active: true, reason, actor: a.id, at };
    put(s, 'receiptRule', rule, { id: rule, order: order.id, location: '*', purchaseType: '*', ...assignment, history: [assignment] });
    if (remainingMinor) ledger(s, a, request, remainingMinor, 'adoption-commitment');
    audit(s, a, 'adopt-order', order.id, { adoption: id, sourceRequest: sourceRequest.id, request: requestId, fingerprint, reason, remainingMinor, sourceApprovalBasis: 'Imported evidence only; no native approval', supplierMessage: 'not-sent' });
    return get(s, 'order', order.id);
}
