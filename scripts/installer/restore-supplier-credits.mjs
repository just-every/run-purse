import { originalDigest } from '../../src/purse/erasure-journal.mjs';

export function validateSupplierCredits(all, get, check) {
    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const positive = value => Number.isSafeInteger(value) && value > 0 && value <= 1e12;
    const entry = value => typeof value.actor === 'string' && typeof value.reason === 'string' && value.reason.trim() && Number.isFinite(Date.parse(value.at));
    const canonical = id => { const seen = new Set(); let row = get('supplier', id); while (row.mergedInto) { check(!seen.has(row.id), 'credit_supplier_cycle'); seen.add(row.id); row = get('supplier', row.mergedInto); } return row.id; };
    for (const rma of all('supplierRma')) {
        const order = get('order', rma.order), receipt = get('receipt', rma.receipt);
        check(order.issuedAt && !order.imported && receipt.order === order.id && ['return', 'reject'].includes(receipt.event) && rma.supplier === order.supplier && rma.currency === order.currency, 'rma_source');
        check(Array.isArray(rma.history) && rma.version === rma.history.length && rma.version > 0 && rma.history[0].status === 'prepared', 'rma_history');
        for (const [index, event] of rma.history.entries()) check(event.version === index + 1 && entry(event) && ['prepared', 'authorized', 'declined', 'closed'].includes(event.status), 'rma_event');
        check(rma.status === rma.history.at(-1).status && (rma.version === 1 || rma.reference === rma.history.at(-1).reference), 'rma_snapshot');
        check(all('supplierRma').filter(row => row.receipt === rma.receipt).length === 1, 'rma_duplicate');
    }
    const references = new Set(), hashes = new Set();
    for (const credit of all('supplierCredit')) {
        const rma = get('supplierRma', credit.rma), file = get('attachment', credit.attachment);
        check(credit.order === rma.order && credit.receipt === rma.receipt && credit.supplier === rma.supplier && credit.currency === rma.currency, 'credit_source');
        check(positive(credit.amountMinor) && validDate(credit.creditDate) && typeof credit.reference === 'string' && credit.reference.trim() && typeof credit.source === 'string' && credit.source.trim(), 'credit_facts');
        const identity = credit.supplier + ':' + credit.reference.trim().toUpperCase();
        check(!references.has(identity) && !hashes.has(credit.document?.sha256), 'credit_duplicate'); references.add(identity); hashes.add(credit.document.sha256);
        check(file.kind === 'supplierCredit' && file.record === credit.id && originalDigest(all, file) === credit.document.sha256 && file.size === credit.document.size, 'credit_original');
        check(['review', 'open'].includes(credit.status) && typeof credit.actor === 'string' && Number.isFinite(Date.parse(credit.at)), 'credit_status');
        const applications = all('supplierCreditApplication').filter(row => row.credit === credit.id);
        check(credit.version === 1 + (credit.status === 'open' ? 1 : 0) + applications.length, 'credit_version');
        if (credit.status === 'open') check(entry(credit.review) && credit.review.sourceHash === credit.document.sha256, 'credit_review');
        check(applications.reduce((n, row) => n + row.amountMinor, 0) <= credit.amountMinor, 'credit_overapplied');
    }
    const pairs = new Set();
    for (const application of all('supplierCreditApplication')) {
        const credit = get('supplierCredit', application.credit), invoice = get('invoice', application.invoice), order = get('order', invoice.order), pair = credit.id + ':' + invoice.id;
        check(!pairs.has(pair), 'credit_application_duplicate'); pairs.add(pair);
        check(credit.status === 'open' && !invoice.imported && canonical(order.supplier) === canonical(credit.supplier) && invoice.currency === credit.currency && invoice.invoiceDate >= credit.creditDate, 'credit_application_source');
        check(application.order === credit.order && application.supplier === credit.supplier && application.currency === credit.currency && positive(application.amountMinor) && entry(application) && application.sourceHash === credit.document.sha256, 'credit_application');
        check(all('supplierCreditApplication').filter(row => row.invoice === invoice.id).reduce((n, row) => n + row.amountMinor, 0) <= invoice.totalMinor, 'credit_bill_overapplied');
        check(all('audit').some(row => row.action === 'supplier-credit-apply' && row.record === application.id && row.credit === credit.id && row.invoice === invoice.id && row.amountMinor === application.amountMinor), 'credit_application_audit');
    }
}
