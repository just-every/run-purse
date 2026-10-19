import { createHash, createHmac } from 'node:crypto';
import { initializeSupplierMatching, matchingInputs } from './supplier-identity';
import { invoiceRisk } from './invoice-risk';
import { audit, get, put, uid, type Actor, type Data, type State } from './types';

export function invoiceEvidence(s: State, order: Data, candidate: Data, input: Data) {
    const risk = invoiceRisk(s, order, candidate, input);
    let evidenceHash: string | null = null;
    if (['invoiceDate', 'senderEmail', 'remit', 'document'].some(field => input[field] !== undefined)) {
        initializeSupplierMatching(s);
        // Domain-separated keyed digest binds all submitted evidence without retaining bank digits.
        const bank = input.remit ? matchingInputs(s, input.remit).bank : null;
        const value = { invoiceDate: input.invoiceDate ?? null, sender: risk.sender.email ?? null, bank, document: risk.document ?? null };
        evidenceHash = createHmac('sha256', Buffer.from(get(s, 'supplierMatchingKey', 'main').secret, 'hex')).update('invoice-evidence:' + JSON.stringify(value)).digest('hex');
    }
    return { ...risk, evidenceHash, flags: risk.flags.map((f: Data) => ({ ...f, id: uid() })), riskVersion: 1, riskReviews: [] };
}
export function storeInvoiceOriginal(s: State, a: Actor, invoice: Data, input: Data) {
    if (!input.document) return;
    const id = uid();
    put(s, 'attachment', id, { kind: 'invoice', record: invoice.id, ...invoice.document, base64: input.document.base64, actor: a.id, at: new Date().toISOString() });
    audit(s, a, 'attachment', invoice.id, { attachment: id });
}

/** The existing later-upload door must apply the same document identity check. */
export function checkInvoiceAttachment(s: State, a: Actor, attachment: Data) {
    const invoice = get(s, 'invoice', attachment.record);
    if (invoice.imported) return;
    const order = get(s, 'order', invoice.order);
    const risk = invoiceRisk(s, order, invoice, { invoiceDate: invoice.invoiceDate, document: { ...attachment, base64: Buffer.from(atob(attachment.base64), 'binary').toString('base64') } });
    const existing = new Set((invoice.flags ?? []).map((f: Data) => f.code + ':' + (f.relatedInvoice ?? '') + ':' + (f.documentHash ?? '')));
    const flags = risk.flags.filter((f: Data) => f.code === 'duplicate-document' && !existing.has(f.code + ':' + (f.relatedInvoice ?? '') + ':' + (f.documentHash ?? ''))).map((f: Data) => ({ ...f, id: uid() }));
    const hash = createHash('sha256').update(Buffer.from(attachment.base64, 'base64')).digest('hex');
    put(s, 'invoice', invoice.id, { ...invoice, documentHashes: [...new Set([...(invoice.documentHashes ?? []), hash])], flags: [...(invoice.flags ?? []), ...flags], riskVersion: (invoice.riskVersion ?? 0) + 1 });
    audit(s, a, 'invoice-document-check', invoice.id, { attachment: attachment.id, flags: flags.map((f: Data) => f.code) });
}
