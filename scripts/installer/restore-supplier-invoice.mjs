import { originalDigest } from '../../src/purse/erasure-journal.mjs';
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const minor = value => Number.isSafeInteger(value) && value >= 0 && value <= 1e12;
const keys = new Set(['id','send','order','revision','supplier','currency','invoice','source','document','lines','subtotalMinor','freightMinor','taxMinor','totalMinor','actor','invoiceConsentVersion','identityVerified','at']);
const lineKeys = new Set(['line','description','unit','unitMinor','orderedQ','acceptedQ','cancelledQ','closedQ','billedQ','remainingQ','quantity','q','invoiceUnitMinor','amountMinor']);
export function validateSupplierInvoices(all, get, check) {
    for (const source of all('supplierInvoiceSubmission')) {
        check(Object.keys(source).every(key => keys.has(key)), 'supplier_invoice_fields');
        const invoice = get('invoice', source.invoice), order = get('order', source.order), event = get('orderSend', source.send), staged = get('invoiceSource', source.source), attachment = get('attachment', staged.attachment);
        const consent=event.invoiceConsentHistory?.find(entry=>entry.version===source.invoiceConsentVersion);check(consent?.enabled===true&&consent.owner===true&&consent.revision===source.revision&&consent.pdfSha256===event.pdf.sha256&&Date.parse(consent.at)<=Date.parse(source.at),'supplier_invoice_consent');
        check(source.actor === 'supplier-link' && source.identityVerified === false && Number.isFinite(Date.parse(source.at)), 'supplier_invoice_authorship');
        check(source.order === event.order && source.revision === event.revision && source.revision === order.revision && source.supplier === order.supplier && source.currency === order.currency && invoice.order === order.id && invoice.currency === source.currency && invoice.supplierSubmission === source.id && invoice.supplierSource === staged.id && staged.supplierSubmission === source.id && staged.order === order.id && staged.orderRevision === source.revision, 'supplier_invoice_scope');
        check(event.acknowledgment?.revision === source.revision && event.acknowledgment?.pdfSha256 === event.pdf?.sha256, 'supplier_invoice_acknowledgment');
        check(['pending','confirmed'].includes(invoice.sourceConfirmation) && date(invoice.invoiceDate), 'supplier_invoice_confirmation');
        const document = source.document;
        check(document && Object.keys(document).every(key => ['name','mediaType','size','sha256'].includes(key)) && document.mediaType === 'application/pdf' && document.sha256 === invoice.document?.sha256 && document.sha256 === originalDigest(all, attachment) && document.size === attachment.size && document.name === attachment.name && attachment.kind === 'invoiceSource' && attachment.record === staged.id, 'supplier_invoice_original');
        check(Array.isArray(source.lines) && source.lines.length > 0 && source.lines.length <= 100 && new Set(source.lines.map(line => line.line)).size === source.lines.length && source.lines.length === invoice.allocations.length, 'supplier_invoice_lines');
        for (const line of source.lines) {
            const original = order.lines.find(item => item.id === line.line), allocation = invoice.allocations.find(item => item.line === line.line);
            check(Object.keys(line).every(key => lineKeys.has(key)) && original && allocation && line.unitMinor === original.unitMinor && line.orderedQ === original.q && typeof line.quantity === 'string' && /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(line.quantity) && Number(BigInt(line.quantity.split('.')[0]) * 1000n + BigInt((line.quantity.split('.')[1] ?? '').padEnd(3, '0'))) === line.q && line.q > 0 && line.q === allocation.q && minor(line.invoiceUnitMinor) && minor(line.amountMinor) && line.amountMinor === Number((BigInt(line.q) * BigInt(line.invoiceUnitMinor) + 500n) / 1000n), 'supplier_invoice_line');
            check(['acceptedQ','cancelledQ','closedQ','billedQ','remainingQ'].every(key => Number.isSafeInteger(line[key]) && line[key] >= 0) && line.remainingQ === Math.max(0, Math.min(line.acceptedQ, line.orderedQ - line.cancelledQ - line.closedQ) - line.billedQ), 'supplier_invoice_balance');
        }
        check([source.subtotalMinor,source.freightMinor,source.taxMinor,source.totalMinor].every(minor) && source.subtotalMinor === source.lines.reduce((sum,line) => sum + line.amountMinor, 0) && source.subtotalMinor + source.freightMinor + source.taxMinor === source.totalMinor && source.totalMinor === invoice.totalMinor, 'supplier_invoice_amounts');
        if (source.lines.some(line => line.q > line.remainingQ)) check(invoice.flags.some(flag => flag.code === 'po-balance'), 'supplier_invoice_excess_hold');
        if (invoice.sourceConfirmation === 'confirmed') { const reading = get('invoiceReading', invoice.confirmedReading); check(reading.status === 'confirmed' && reading.invoice === invoice.id && reading.source === source.source && reading.sourceDescriptor.sha256 === document.sha256 && invoice.confirmedBy === reading.confirmedBy, 'supplier_invoice_bound_review'); }
        check(all('audit').some(entry => entry.action === 'supplier-invoice-submitted' && entry.record === invoice.id && entry.submission === source.id && entry.send === event.id && entry.documentSha256 === document.sha256 && entry.actor === 'supplier-link' && entry.identityVerified === false), 'supplier_invoice_audit');
    }
    for (const invoice of all('invoice').filter(invoice => invoice.supplierSubmission)) check(get('supplierInvoiceSubmission', invoice.supplierSubmission).invoice === invoice.id, 'supplier_invoice_backlink');
}

export function validateSupplierInvoiceApprovals(all, get, check) {
    for (const event of all('orderSend')) {
        const history = event.invoiceApprovalRuleHistory ?? [];
        check(!event.invoiceApprovalRule || JSON.stringify(event.invoiceApprovalRule) === JSON.stringify(history.at(-1)), 'supplier_invoice_rule_latest');
        for (const [index, rule] of history.entries()) {
            check(rule.version === index + 1 && typeof rule.enabled === 'boolean' && rule.order === event.order && rule.send === event.id && rule.revision === event.revision && rule.pdfSha256 === event.pdf.sha256 && typeof rule.actor === 'string' && Number.isSafeInteger(rule.operatorVersion) && rule.operatorVersion > 0 && rule.reason?.trim() && Number.isFinite(Date.parse(rule.at)), 'supplier_invoice_rule');
            check(!rule.enabled || event.invoiceConsentHistory?.some(consent => consent.version === rule.invoiceConsentVersion && consent.enabled && consent.actor === rule.actor && consent.operatorVersion === rule.operatorVersion), 'supplier_invoice_rule_consent');
            check(all('audit').some(entry => entry.action === 'supplier-invoice-rule' && entry.record === event.order && entry.version === rule.version && entry.enabled === rule.enabled && entry.actor === rule.actor && entry.at === rule.at), 'supplier_invoice_rule_audit');
        }
    }
    for (const invoice of all('invoice')) {
        const approval = invoice.paymentApproval;
        check(!invoice.paymentSchedule || approval, 'supplier_invoice_schedule_approval');
        if (!approval || ['deposit-two-way','deposit-final-three-way'].includes(approval.match)) continue;
        const source = get('supplierInvoiceSubmission', invoice.supplierSubmission), event = get('orderSend', source.send), rule = event.invoiceApprovalRuleHistory?.find(rule => rule.version === approval.ruleVersion);
        check(rule?.enabled && approval.invoice === invoice.id && approval.order === invoice.order && approval.send === event.id && approval.revision === source.revision && approval.owner === rule.actor && approval.operatorVersion === rule.operatorVersion && approval.documentSha256 === invoice.document.sha256 && approval.reading === invoice.confirmedReading && invoice.sourceConfirmation === 'confirmed' && approval.amountMinor === invoice.totalMinor && approval.currency === invoice.currency && approval.match === 'three-way' && Date.parse(approval.at) >= Date.parse(invoice.confirmedAt), 'supplier_invoice_payment_approval');
        check(all('audit').some(entry => entry.action === 'supplier-invoice-approved' && entry.record === invoice.id && entry.ruleVersion === approval.ruleVersion && entry.documentSha256 === approval.documentSha256 && entry.actor === approval.actor && entry.at === approval.at), 'supplier_invoice_approval_audit');
        const schedule = invoice.paymentSchedule;
        if (schedule) {
            check(schedule.version === 1 && schedule.invoice === invoice.id && date(schedule.date) && schedule.approvalAt === approval.at && schedule.basis === 'native-payment-instruction' && schedule.reason?.trim() && Date.parse(schedule.at) >= Date.parse(approval.at), 'supplier_invoice_schedule');
            check(all('audit').some(entry => entry.action === 'supplier-invoice-schedule' && entry.record === invoice.id && entry.date === schedule.date && entry.actor === schedule.actor && entry.at === schedule.at), 'supplier_invoice_schedule_audit');
        }
    }
}
