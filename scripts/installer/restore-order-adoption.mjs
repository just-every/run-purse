import { amount, check, integer, money, same } from './restore-validation.mjs';

export function validateOrderAdoptions(all, get) {
    const adoptedOrders = new Set(), operationalRequests = new Set();
    for (const adoption of all('orderAdoption')) {
        const order = get('order', adoption.order), request = get('request', adoption.request), source = get('request', adoption.sourceRequest), opening = get('revision', adoption.request + ':1');
        check(!adoptedOrders.has(order.id) && !operationalRequests.has(request.id), 'adoption_unique'); adoptedOrders.add(order.id); operationalRequests.add(request.id);
        check(order.imported === true && order.adoption === adoption.id && order.request === request.id && order.sourceRequest === source.id && source.imported === true && request.imported === false && request.adoption === adoption.id && opening.status === 'adopted', 'adoption_links');
        const original = adoption.sourceOrder;
        check(original?.id === order.id && original.imported === true && original.status === 'imported' && original.policy === null && !original.issuedAt && original.request === source.id && order.number === original.number && order.currency === original.currency && order.supplier === original.supplier && order.totalMinor === original.totalMinor && order.revision === 1, 'adoption_source');
        check(!order.issuedAt && !order.approvalActor && !order.approvalVersion && ['adopted','amendment-pending','amended','closed','cancelled'].includes(order.status) && !all('decision').some(decision => decision.request === request.id && decision.revision === 1), 'adoption_no_native_authority');
        get('policy', adoption.policy);
        if (adoption.budget) { const budget = get('budget', adoption.budget); check(adoption.importedBudgetMinor === budget.amountMinor && adoption.sourceBudget === budget.sourceId && budget.currency === order.currency, 'adoption_budget_source'); check(all('audit').some(event=>event.action==='adopt-budget'&&event.sourceBudget===budget.id&&event.record===adoption.policy&&event.amountMinor===adoption.importedBudgetMinor), 'adoption_budget_review'); }
        check(adoption.version === 1 && typeof adoption.actor === 'string' && typeof adoption.reason === 'string' && adoption.reason.trim() && Number.isFinite(Date.parse(adoption.at)) && /^[a-f0-9]{64}$/.test(adoption.fingerprint), 'adoption_review');
        check(Array.isArray(adoption.openingLines) && adoption.openingLines.length === original.lines.length && new Set(adoption.openingLines.map(line => line.line)).size === original.lines.length, 'adoption_opening');
        for (const balance of adoption.openingLines) {
            const line = order.lines.find(line => line.id === balance.line), originalLine = original.lines.find(line => line.id === balance.line);
            const accepted = all('receipt').filter(receipt => receipt.imported && receipt.order === order.id && receipt.line === balance.line).reduce((sum, receipt) => sum + receipt.q, 0);
            check(line && originalLine && balance.q === originalLine.q && balance.accepted === accepted && integer(accepted) && accepted <= balance.q && line.carriedAccepted === accepted && line.carriedCancelled === 0 && line.q === originalLine.q && line.unitMinor === originalLine.unitMinor && line.totalMinor === originalLine.totalMinor, 'adoption_opening_line');
            const actual = all('receipt').filter(receipt => !receipt.imported && receipt.order === order.id && receipt.line === line.id);
            const physical = accepted + actual.reduce((sum, receipt) => sum + (receipt.event === 'receive' ? receipt.q : receipt.event === 'return' ? -receipt.q : 0), 0);
            check(integer(physical) && physical + actual.filter(receipt=>receipt.event==='cancel').reduce((sum,receipt)=>sum+receipt.q,0) <= line.q && actual.every(receipt => receipt.event !== 'cancel' || receipt.approvedDisposition), 'adoption_physical');
        }
        const base = original.lines.reduce((sum, line) => sum + line.totalMinor, 0);
        const unreceived = original.lines.reduce((sum, line) => sum + amount(line.q - adoption.openingLines.find(balance => balance.line === line.id).accepted, line.unitMinor), 0);
        const expected = base ? Number((BigInt(original.totalMinor) * BigInt(unreceived) + BigInt(base) / 2n) / BigInt(base)) : 0;
        check(money(adoption.openingCommitmentMinor) && adoption.openingCommitmentMinor === expected, 'adoption_commitment');
        const commitments = all('commitment').filter(event => event.request === request.id && event.kind === 'adoption-commitment');
        check(expected ? commitments.length === 1 && commitments[0].amountMinor === expected && commitments[0].policy === adoption.policy && commitments[0].revision === 1 && commitments[0].actor === adoption.actor : commitments.length === 0, 'adoption_commitment_event');
        check(Array.isArray(adoption.sourceInvoices) && new Set(adoption.sourceInvoices).size === adoption.sourceInvoices.length && adoption.sourceInvoices.every(id => { const invoice = get('invoice', id); return invoice.order === order.id && invoice.imported && invoice.adoptedVia === adoption.id; }), 'adoption_invoice_links');
        check(Array.isArray(adoption.deposits) && new Set(adoption.deposits).size === adoption.deposits.length && adoption.deposits.every(id => get('deposit', id).order === order.id), 'adoption_deposit_links');
        const deposits = adoption.deposits.map(id => get('deposit', id)), face = deposits.reduce((sum, deposit) => sum + deposit.amountMinor, 0);
        const lineage = new Set(all('order').filter(candidate => candidate.request === request.id).map(candidate => candidate.id));
        const applied = deposits.reduce((sum, deposit) => sum + deposit.appliedMinor, 0) + all('invoice').filter(invoice => !invoice.imported && lineage.has(invoice.order)).reduce((sum, invoice) => sum + (invoice.depositAppliedMinor ?? 0), 0);
        check(face <= order.totalMinor && applied <= face, 'adoption_deposit_balance');
        check(all('audit').some(event => event.action === 'adopt-order' && event.record === order.id && event.adoption === adoption.id && event.fingerprint === adoption.fingerprint && event.actor === adoption.actor), 'adoption_audit');
        if (order.amendedBy) { const next = get('order', order.amendedBy); check(next.request === request.id && next.revision > order.revision && get('revision', next.request + ':' + next.revision).amends === order.id, 'adoption_amendment'); }
        check(same(order.supplierSnapshot, opening.supplierSnapshot), 'adoption_frozen_supplier');
    }
    for (const order of all('order')) if (order.adoption) check(adoptedOrders.has(order.id), 'adoption_order');
    for (const budget of all('budget')) check(budget.imported === true && budget.status === 'imported' && money(budget.amountMinor) && /^[A-Z]{3}$/.test(budget.currency) && typeof budget.sourceId === 'string', 'imported_budget');
    for (const deposit of all('deposit')) {
        const order = get('order', deposit.order);
        check(deposit.imported === true && order.imported === true && deposit.currency === order.currency && money(deposit.amountMinor) && deposit.amountMinor > 0 && money(deposit.appliedMinor) && deposit.appliedMinor <= deposit.amountMinor && typeof deposit.reference === 'string' && deposit.reference.trim() && typeof deposit.evidence === 'string' && deposit.evidence.trim(), 'imported_deposit');
    }
    for (const invoice of all('invoice')) if (invoice.imported && invoice.sourceConfirmation === 'confirmed') {
        const reading = get('invoiceReading', invoice.confirmedReading);
        check(reading.invoice === invoice.id && reading.status === 'confirmed' && typeof invoice.confirmedBy === 'string' && Number.isFinite(Date.parse(invoice.confirmedAt)), 'adoption_invoice_confirmation');
    }
}
