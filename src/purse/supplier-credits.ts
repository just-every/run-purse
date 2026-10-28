import { documentMetadata } from './invoice-risk';
import { openInvoiceFlags } from './invoice-status';
import { creditInvoiceVersion, invoiceCreditApplied } from './invoices';
import { discrepancies } from './orders';
import { canonicalSupplier } from './supplier-identity';
import { moneyInput } from './money';
import { allowed, requirePermission } from './access';
import { all, audit, date, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

export const creditApplied = (s: State, id: string) => all(s, 'supplierCreditApplication').filter(row => row.credit === id).reduce((n, row) => n + row.amountMinor, 0);
const referenceKey = (reference: string) => reference.trim().toUpperCase();
function nativeOrder(s: State, id: string) {
    const order = get(s, 'order', id);
    requireThat(order.issuedAt && !order.imported && !order.adoption && !order.poDetails?.deposit, 'Use an issued native PO; imported and deposit credit qualification is not available', 409);
    return order;
}
function original(s: State, credit: Data) {
    const file = get(s, 'attachment', credit.attachment);
    requireThat(!credit.erasure && !file.erasure && file.base64 && file.kind === 'supplierCredit' && file.record === credit.id
        && documentMetadata(file).sha256 === credit.document.sha256, 'Credit original is withdrawn or changed; no new application is permitted', 409);
    return file;
}
function currentCredit(s: State, a: Actor, id: string, permission: string) {
    const credit = get(s, 'supplierCredit', id);
    requirePermission(s, a, permission, credit); requirePermission(s, a, 'invoice.read', credit);
    nativeOrder(s, credit.order); original(s, credit); return credit;
}
export function supplierCredits(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['rma-prepare', 'rma-record', 'supplier-credit-capture', 'supplier-credit-review', 'supplier-credit-apply'].includes(op)) return;
    if (op === 'rma-prepare') {
        const receipt = get(s, 'receipt', b.receipt), order = nativeOrder(s, receipt.order);
        requirePermission(s, a, 'procurement.manage', order);
        requireThat(!receipt.imported && ['return', 'reject'].includes(receipt.event), 'Choose a recorded native return or rejection', 409);
        requireThat(!all(s, 'supplierRma').some(row => row.receipt === receipt.id), 'This return already has an RMA record', 409);
        const id = uid(), at = new Date().toISOString(), reason = text(b.reason, 'RMA preparation reason');
        put(s, 'supplierRma', id, { order: order.id, supplier: order.supplier, receipt: receipt.id, currency: order.currency,
            version: 1, status: 'prepared', history: [{ version: 1, status: 'prepared', reason, actor: a.id, at }] });
        audit(s, a, op, id, { order: order.id, receipt: receipt.id, reason }); return get(s, 'supplierRma', id);
    }
    if (op === 'rma-record') {
        const rma = get(s, 'supplierRma', b.id); requirePermission(s, a, 'procurement.manage', rma);
        requireThat(!rma.erasure && b.version === rma.version && rma.status !== 'closed', 'RMA changed, erased or closed; reload', 409);
        requireThat(['authorized', 'declined', 'closed'].includes(b.status), 'Choose a recorded RMA outcome');
        const entry = { version: rma.version + 1, status: b.status, reference: text(b.reference, 'Supplier RMA reference'), reason: text(b.reason, 'RMA outcome evidence'), actor: a.id, at: new Date().toISOString() };
        put(s, 'supplierRma', rma.id, { ...rma, version: entry.version, status: entry.status, reference: entry.reference, history: [...rma.history, entry] });
        audit(s, a, op, rma.id, { order: rma.order, ...entry }); return get(s, 'supplierRma', rma.id);
    }
    if (op === 'supplier-credit-capture') {
        const rma = get(s, 'supplierRma', b.rma), order = nativeOrder(s, rma.order);
        requirePermission(s, a, 'invoice.capture', order); requirePermission(s, a, 'invoice.read', order);
        requireThat(!rma.erasure, 'Erased RMA cannot capture new evidence', 409);
        const document = documentMetadata(b.document), reference = text(b.reference, 'Credit memo reference', 200), amountMinor = moneyInput(b, 'amount', 'amountMinor', 'Credit amount');
        requireThat(amountMinor > 0 && b.currency === order.currency, 'Positive credit in the return currency required', 409);
        const facts = { order: order.id, supplier: order.supplier, receipt: rma.receipt, rma: rma.id, currency: order.currency, reference,
            creditDate: date(b.creditDate, 'Credit date'), amountMinor, source: text(b.source, 'Credit source'), document };
        const existing = all(s, 'supplierCredit').find(row => canonicalSupplier(s, row.supplier) === canonicalSupplier(s, order.supplier) && referenceKey(row.reference) === referenceKey(reference));
        if (existing) {
            requirePermission(s, a, 'invoice.read', existing); original(s, existing);
            requireThat(Object.entries(facts).every(([key, value]) => JSON.stringify(existing[key]) === JSON.stringify(value)), 'Credit reference already exists with conflicting source or amounts', 409);
            return existing;
        }
        requireThat(!all(s, 'supplierCredit').some(row => row.document.sha256 === document.sha256), 'These original bytes already belong to another credit memo', 409);
        const id = uid(), attachment = uid(), at = new Date().toISOString();
        put(s, 'supplierCredit', id, { ...facts, attachment, status: 'review', version: 1, actor: a.id, at });
        put(s, 'attachment', attachment, { ...document, kind: 'supplierCredit', record: id, base64: b.document.base64, actor: a.id, at });
        audit(s, a, 'attachment', id, { attachment, order: order.id });
        audit(s, a, op, id, { order: order.id, reference, amountMinor, currency: order.currency, sourceHash: document.sha256 });
        return get(s, 'supplierCredit', id);
    }
    const credit = currentCredit(s, a, b.credit ?? b.id, op === 'supplier-credit-review' ? 'invoice.review' : 'payable.approve');
    requireThat(b.version === credit.version, 'Credit changed; reload', 409);
    if (op === 'supplier-credit-review') {
        requireThat(credit.status === 'review' && b.sourceHash === credit.document.sha256 && b.consent === true, 'Review the exact private original and confirm its supplier, return, reference, date, currency and amount', 409);
        const review = { reason: text(b.reason, 'Source review reason'), actor: a.id, at: new Date().toISOString(), sourceHash: credit.document.sha256 };
        put(s, 'supplierCredit', credit.id, { ...credit, status: 'open', version: credit.version + 1, review });
        audit(s, a, op, credit.id, { order: credit.order, ...review }); return get(s, 'supplierCredit', credit.id);
    }
    requireThat(credit.status === 'open', 'Confirm the private credit original before applying it', 409);
    const invoice = get(s, 'invoice', b.invoice), order = nativeOrder(s, invoice.order), payable = s.get('payable:' + invoice.id)?.value;
    requirePermission(s, a, 'payable.approve', invoice); requirePermission(s, a, 'invoice.read', invoice);
    requireThat(!invoice.imported && !invoice.pantry && !invoice.sourcePayment && !invoice.depositAppliedMinor && !invoice.erasure
        && (!invoice.supplierSubmission || invoice.sourceConfirmation === 'confirmed') && invoice.document && !invoice.document.erasure,
    'Use a source-confirmed native bill; synced, paid, imported and deposit bills need separate qualification', 409);
    requireThat(canonicalSupplier(s, order.supplier) === canonicalSupplier(s, credit.supplier) && invoice.currency === credit.currency, 'Credit and bill must have the same supplier and currency', 409);
    requireThat(invoice.invoiceDate >= credit.creditDate, 'Choose a bill dated on or after this credit', 409);
    requireThat(b.invoiceVersion === creditInvoiceVersion(s, invoice), 'Bill or applications changed; reload', 409);
    requireThat(payable?.approvedAt && !invoice.exception && !openInvoiceFlags(invoice).length && !discrepancies(s).some(row => row.invoiceId === invoice.id && (row.priceMismatch || row.quantityMismatch || row.receiptShortfall || row.closedBalance || row.exception)), 'Resolve invoice holds and approve native cash-planning terms before applying credit', 409);
    requireThat(!all(s, 'supplierCreditApplication').some(row => row.credit === credit.id && row.invoice === invoice.id), 'This credit is already applied to this bill', 409);
    const amountMinor = moneyInput(b, 'amount', 'amountMinor', 'Application amount');
    requireThat(amountMinor > 0 && amountMinor <= credit.amountMinor - creditApplied(s, credit.id) && amountMinor <= invoice.totalMinor - invoiceCreditApplied(s, invoice.id), 'Application exceeds the open credit or bill balance', 409);
    const id = uid(), application = { credit: credit.id, order: credit.order, invoice: invoice.id, supplier: credit.supplier, currency: credit.currency,
        amountMinor, reason: text(b.reason, 'Credit allocation reason'), actor: a.id, at: new Date().toISOString(), sourceHash: credit.document.sha256 };
    put(s, 'supplierCreditApplication', id, application); put(s, 'supplierCredit', credit.id, { ...credit, version: credit.version + 1 });
    audit(s, a, op, id, application); return get(s, 'supplierCreditApplication', id);
}

export function visibleSupplierCredits(s: State, a: Actor) {
    const supplierRma = all(s, 'supplierRma').filter(row => allowed(s, a, 'procurement.manage', row) || allowed(s, a, 'invoice.read', row))
        .map(row => ({ ...row, mayManage: allowed(s, a, 'procurement.manage', row) }));
    const supplierCredit = all(s, 'supplierCredit').filter(row => allowed(s, a, 'invoice.read', row)).map((row): Data => ({ ...row,
        appliedMinor: creditApplied(s, row.id), openMinor: row.status === 'open' ? row.amountMinor - creditApplied(s, row.id) : 0,
        mayReview: !row.erasure && allowed(s, a, 'invoice.review', row), mayApply: !row.erasure && allowed(s, a, 'payable.approve', row) }));
    const supplierCreditApplication = all(s, 'supplierCreditApplication').filter(row => allowed(s, a, 'invoice.read', row) && allowed(s, a, 'invoice.read', get(s, 'supplierCredit', row.credit)));
    const balances = new Map<string, Data>();
    for (const credit of supplierCredit) {
        const supplier = canonicalSupplier(s, credit.supplier), key = supplier + ':' + credit.currency, balance = balances.get(key) ?? { supplier, currency: credit.currency, openCreditMinor: 0, approvedBillMinor: 0 };
        balance.openCreditMinor += credit.openMinor; balances.set(key, balance);
    }
    for (const payable of all(s, 'payable').filter(row => row.approvedAt)) {
        const invoice = get(s, 'invoice', payable.invoice); if (!allowed(s, a, 'invoice.read', invoice) || invoice.pantry || invoice.sourcePayment) continue;
        const supplier = canonicalSupplier(s, get(s, 'order', invoice.order).supplier), key = supplier + ':' + invoice.currency, balance = balances.get(key) ?? { supplier, currency: invoice.currency, openCreditMinor: 0, approvedBillMinor: 0 };
        balance.approvedBillMinor += Math.max(0, payable.approvedMinor - invoiceCreditApplied(s, invoice.id)); balances.set(key, balance);
    }
    return { supplierRma, supplierCredit, supplierCreditApplication, supplierCreditBalances: [...balances.values()].map(row => ({ ...row, balanceMinor: row.approvedBillMinor - row.openCreditMinor })) };
}
