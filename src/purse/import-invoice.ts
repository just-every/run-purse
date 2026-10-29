import { historicalLineId } from './procurify-lines';
import { documentMetadata, senderAddress } from './invoice-risk';
import { invoiceReadingText, postalRemit } from './invoice-reading-values';
import { extended, requireThat, text, type Data } from './types';

type Columns = (row: Data, name: string) => string;
export function importedInvoice(row: Data, col: Columns, parse: { quantity: (v: string) => number; money: (v: string) => number; date: (v: string) => string }, reference: (field: string, kind: string) => string, meta: Data) {
    const q = parse.quantity(col(row, 'quantity')), unitMinor = parse.money(col(row, 'unitPrice'));
    const amountMinor = col(row, 'amount') ? parse.money(col(row, 'amount')) : extended(q, unitMinor);
    const order = reference('orderId', 'order'), line = historicalLineId(col(row, 'orderId'), col(row, 'orderLineId'));
    const invoiceDate = col(row, 'date') ? parse.date(col(row, 'date')) : null;
    const document = col(row, 'documentBase64') ? { name: text(col(row, 'documentName'), 'Invoice original filename', 200), mediaType: text(col(row, 'documentMediaType'), 'Invoice original media type', 150), base64: col(row, 'documentBase64') } : null;
    const original = document ? { ...documentMetadata(document), base64: document.base64 } : null;
    return { ...meta, order, reference: text(col(row, 'number') || meta.sourceId, 'Historical invoice number'),
        source: 'Imported invoice source ' + meta.sourceId, currency: col(row, 'currency'), sourceSupplierId: col(row, 'supplierId'), costCentre: col(row, 'costCentre'),
        allocations: [{ line, quantity: col(row, 'quantity').replace(',', '.'), q, amountMinor, orderedMinor: extended(q, unitMinor), receivedQ: 0 }], totalMinor: amountMinor,
        invoiceDate, invoiceDateSource: invoiceDate ? 'imported-source' : 'not-recorded',
        sourceSender: col(row, 'email') ? senderAddress(col(row, 'email')).address : null,
        sourceRemit: col(row, 'remitTo') ? postalRemit(col(row, 'remitTo')) : null,
        sourceApproval: { status: meta.sourceStatus, evidence: col(row, 'approvalEvidence') ? invoiceReadingText(col(row, 'approvalEvidence'), 'Imported approval evidence') : null },
        sourcePayment: col(row, 'paidDate') ? { date: parse.date(col(row, 'paidDate')), evidence: text(col(row, 'paymentEvidence'), 'Historical payment evidence') } : null,
        actor: 'historical', at: invoiceDate ? invoiceDate + 'T12:00:00.000Z' : null, original };
}
export function importedDeposit(row: Data, col: Columns, money: (v: string) => number, reference: (field: string, kind: string) => string, meta: Data, sourceDate: (v: string) => string) {
    const amountMinor = money(col(row, 'amount')), appliedMinor = money(col(row, 'appliedAmount') || '0');
    requireThat(amountMinor > 0 && appliedMinor <= amountMinor, 'Deposit applications cannot exceed the source deposit');
    return { ...meta, order: reference('orderId', 'order'), currency: col(row, 'currency'), reference: text(col(row, 'number') || meta.sourceId, 'Deposit reference'),
        amountMinor, appliedMinor, depositDate: col(row, 'date') ? sourceDate(col(row, 'date')) : null, costCentre: col(row, 'costCentre'), evidence: text(col(row, 'paymentEvidence'), 'Source prepaid deposit evidence'), sourceApproval: col(row, 'approvalEvidence') || null };
}
