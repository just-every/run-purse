import { supplierInvoiceMatched } from './supplier-invoice-approval';
import { PDFDocument } from 'pdf-lib';
import { captureInvoice } from './invoices';
import { allocateInvoiceCharges } from './invoice-amounts';
import { documentMetadata } from './invoice-risk';
import { moneyInput } from './money';
import { linePosition } from './orders';
import { all, date, extended, get, minor, put, qty, quantity, requireThat, text, uid, type Data, type State } from './types';

/** Quantities keep their original request-line ancestry across approved revisions. */
export function supplierInvoiceLines(state: State, order: Data) {
    const orderIds = new Set(all(state, 'order').filter(candidate => candidate.request === order.request && candidate.currency === order.currency && candidate.supplier === order.supplier).map(candidate => candidate.id));
    const invoices = all(state, 'invoice').filter(invoice => orderIds.has(invoice.order) && invoice.currency === order.currency);
    return order.lines.map((line: Data) => {
        const position = linePosition(state, order.id, line);
        const billedQ = invoices.flatMap(invoice => invoice.allocations).filter((allocation: Data) => allocation.line === line.id).reduce((sum: number, allocation: Data) => sum + allocation.q, 0);
        const remainingQ = Math.max(0, Math.min(position.accepted, line.q - position.cancelled - position.closed) - billedQ);
        return { line: line.id, description: line.description, unit: line.unit ?? null, unitMinor: line.unitMinor, orderedQ: line.q, acceptedQ: position.accepted, cancelledQ: position.cancelled, closedQ: position.closed, billedQ, remainingQ, quantity: remainingQ ? qty(remainingQ) : '0' };
    });
}

export function requireSupplierInvoiceOrder(state: State, event: Data) {
    const order = get(state, 'order', event.order), request = get(state, 'request', order.request), supplier = get(state, 'supplier', order.supplier);
    requireThat(event.invoiceSubmission===true && event.invoiceConsent?.enabled===true && event.supplier === order.supplier && event.request === request.id && event.revision === order.revision && event.acknowledgment?.revision === order.revision && event.acknowledgment.pdfSha256 === event.pdf?.sha256 && !event.erasure && !event.revokedAt && Date.parse(event.expiresAt) > Date.now() && !supplier.erasure && !supplier.erased && !order.supplierSnapshot?.contactErased && !order.supplierSnapshot?.erasure && order.status === 'issued' && order.issuedAt && !order.imported && !order.adoption && request.status === 'approved' && request.revision === order.revision && request.currency === order.currency && get(state, 'revision', order.request + ':' + order.revision).currency === order.currency, 'Acknowledge the exact current issued native purchase order before submitting an invoice', 409);
    requireThat(!order.poDetails?.blanket && !order.lines.some((line: Data) => line.service), 'Supplier invoice submission currently requires a quantity-based native purchase order', 409);
    return order;
}

/** Supplier statuses project only this capability's submissions and actual approval evidence. */
export function supplierInvoiceStatuses(state: State, event: Data) {
    return all(state, 'supplierInvoiceSubmission').filter(source => source.send === event.id && source.order === event.order && source.revision === event.revision).map(source => {
        const invoice = get(state, 'invoice', source.invoice);
        requireThat(invoice.supplierSubmission === source.id && invoice.order === event.order && invoice.currency === source.currency, 'Supplier invoice source scope changed', 409);
        const paid = state.get('pantrySync:' + invoice.id)?.value;
        const returned = paid?.status === 'synced' && paid.invoice === invoice.id && paid.returned?.reference === invoice.reference && paid.returned?.totalMinor === invoice.totalMinor && paid.returned?.paymentStatus === 'paid' && paid.returned?.paidMinor === invoice.totalMinor && paid.returned?.openMinor === 0;
        const approved = invoice.paymentApproval && supplierInvoiceMatched(state, invoice);
        return { reference: invoice.reference, currency: invoice.currency, amountMinor: invoice.totalMinor, invoiceDate: invoice.invoiceDate, status: returned ? 'paid' : approved ? invoice.paymentSchedule ? 'scheduled' : 'approved' : 'received', receivedAt: source.at };
    });
}

export async function captureSupplierInvoice(state: State, event: Data, body: Data) {
    const order = requireSupplierInvoiceOrder(state, event);
    const fields = new Set(['revision', 'consent', 'reference', 'invoiceDate', 'freightAmount', 'taxAmount', 'lines', 'document']);
    requireThat(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(field => fields.has(field)), 'Use only invoice number, date, freight, tax, PO lines and original PDF');
    requireThat(body.consent === true && body.revision === event.revision, 'Explicit submission against this exact acknowledged revision is required', 409);
    const reference = text(body.reference, 'Invoice number', 200), invoiceDate = date(body.invoiceDate, 'Invoice date');
    requireThat(Array.isArray(body.lines) && body.lines.length > 0 && body.lines.length <= Math.min(100, order.lines.length), 'Choose 1–100 lines from this purchase order');
    const remaining = supplierInvoiceLines(state, order), seen = new Set<string>();
    const lines = body.lines.map((input: Data) => {
        requireThat(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).every(key => ['line', 'quantity', 'unitAmount'].includes(key)), 'Use only PO line, quantity and unit price');
        const original = remaining.find((line: Data) => line.line === input.line);
        requireThat(original && !seen.has(original.line), 'Choose each line of this exact purchase order once', 409); seen.add(original.line);
        const q = quantity(input.quantity), unitMinor = moneyInput(input, 'unitAmount', 'unitMinor', 'Invoice unit price');
        return { ...original, quantity: qty(q), q, invoiceUnitMinor: unitMinor, amountMinor: extended(q, unitMinor) };
    });
    const freightMinor = moneyInput(body, 'freightAmount', 'freightMinor', 'Invoice freight'), taxMinor = moneyInput(body, 'taxAmount', 'taxMinor', 'Invoice tax');
    const subtotalMinor = minor(lines.reduce((sum: number, line: Data) => sum + line.amountMinor, 0), 'Invoice subtotal');
    const metadata = documentMetadata(body.document);
    requireThat(Object.keys(body.document).every(field => ['name', 'mediaType', 'base64'].includes(field)) && metadata.mediaType === 'application/pdf', 'Attach the actual invoice PDF');
    const bytes = Buffer.from(body.document.base64, 'base64');
    requireThat(bytes.subarray(0, 5).toString() === '%PDF-', 'Attach the actual invoice PDF');
    let pages = 0; try { pages = (await PDFDocument.load(bytes)).getPageCount(); } catch { requireThat(false, 'Attach a readable, unencrypted invoice PDF'); }
    requireThat(pages > 0 && pages <= 50, 'Invoice PDF must contain 1–50 pages');
    const allocations = allocateInvoiceCharges(lines, minor(freightMinor + taxMinor, 'Invoice charges')).map(line => ({ line: line.line, quantity: line.quantity, amountMinor: line.amountMinor }));
    const invoice = captureInvoice(state, { kind: 'supplier-link', event }, { order: order.id, reference, source: 'Supplier order link ' + event.id, invoiceDate, document: body.document, allocations });
    const existing = all(state, 'supplierInvoiceSubmission').find(source => source.invoice === invoice.id);
    if (existing) {
        const values = (items: Data[]) => items.map(line => [line.line, line.q, line.invoiceUnitMinor]).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
        requireThat(existing.send === event.id && existing.subtotalMinor === subtotalMinor && existing.freightMinor === freightMinor && existing.taxMinor === taxMinor && JSON.stringify(values(existing.lines)) === JSON.stringify(values(lines)), 'Invoice reference already has different supplier evidence; ask the buyer to reconcile it', 409);
        return existing;
    }
    const id = uid(), sourceId = uid(), attachment = uid(), at = new Date().toISOString();
    const excess = lines.some((line: Data) => line.q > line.remainingQ);
    const flags = excess && !(invoice.flags ?? []).some((flag: Data) => flag.code === 'po-balance') ? [...invoice.flags, { id: uid(), code: 'po-balance', reason: 'Supplier-submitted quantity exceeds the remaining accepted, uncancelled and open PO balance' }] : invoice.flags;
    put(state, 'invoice', invoice.id, { ...invoice, flags, supplierSubmission: id, sourceConfirmation: 'pending', supplierSource: sourceId, sourceAuthentication: 'supplier-link-holder-unverified' });
    put(state, 'invoiceSource', sourceId, { order: order.id, orderRevision: order.revision, attachment, supplierSubmission: id, actor: 'supplier-link', at });
    put(state, 'attachment', attachment, { ...metadata, kind: 'invoiceSource', record: sourceId, base64: body.document.base64, actor: 'supplier-link', at });
    put(state, 'audit', uid(), { action: 'attachment', record: sourceId, attachment, actor: 'supplier-link', send: event.id, identityVerified: false, at });
    const source = { id, send: event.id, order: order.id, revision: order.revision, supplier: order.supplier, currency: order.currency, invoice: invoice.id, source: sourceId, document: metadata, lines, subtotalMinor, freightMinor, taxMinor, totalMinor: invoice.totalMinor, actor: 'supplier-link', invoiceConsentVersion:event.invoiceConsent.version, identityVerified: false, at };
    put(state, 'supplierInvoiceSubmission', id, source);
    put(state, 'audit', uid(), { action: 'supplier-invoice-submitted', record: invoice.id, submission: id, send: event.id, source: sourceId, order: order.id, revision: order.revision, documentSha256: metadata.sha256, actor: 'supplier-link', invoiceConsentVersion:event.invoiceConsent.version, identityVerified: false, at });
    return source;
}
