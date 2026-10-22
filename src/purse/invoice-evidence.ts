import { mac, v2Hash } from './invoice-evidence-crypto.mjs';
import { evidenceKey } from './invoice-evidence-history';
import { createHash } from 'node:crypto';
import { initializeSupplierMatching, matchingInputs } from './supplier-identity';
import { invoiceRisk } from './invoice-risk';
import { audit, get, put, uid, type Actor, type Data, type State } from './types';

export function invoiceEvidence(s: State, order: Data, candidate: Data, input: Data) {
    const risk = invoiceRisk(s, order, candidate, input);
    let evidenceHash: string | null = null;
    if (['invoiceDate', 'senderEmail', 'remit', 'remitTo', 'document'].some(field => input[field] !== undefined)) {
        initializeSupplierMatching(s);
        const bank = input.remit ? matchingInputs(s, input.remit).bank : null;
        const bankBinding=bank?mac(get(s,'supplierMatchingKey','main').secret,'invoice-bank-binding:v2:',bank):null;
        const evidence={representation:'v2',state:'v2',bankBinding};
        evidenceHash=v2Hash(evidenceKey(s),risk,bankBinding);
        return { ...risk, evidenceHash, evidence, flags:risk.flags.map((f:Data)=>({...f,id:uid()})),riskVersion:1,riskReviews:[] };
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
    if (invoice.imported && !invoice.adoptedVia) return;
    const order = get(s, 'order', invoice.order);
    const risk = invoiceRisk(s, order, invoice, { invoiceDate: invoice.invoiceDate, document: { ...attachment, base64: Buffer.from(atob(attachment.base64), 'binary').toString('base64') } });
    const existing = new Set((invoice.flags ?? []).map((f: Data) => f.code + ':' + (f.relatedInvoice ?? '') + ':' + (f.documentHash ?? '')));
    const flags = risk.flags.filter((f: Data) => f.code === 'duplicate-document' && !existing.has(f.code + ':' + (f.relatedInvoice ?? '') + ':' + (f.documentHash ?? ''))).map((f: Data) => ({ ...f, id: uid() }));
    const hash = createHash('sha256').update(Buffer.from(attachment.base64, 'base64')).digest('hex');
    put(s, 'invoice', invoice.id, { ...invoice, documentHashes: [...new Set([...(invoice.documentHashes ?? []), hash])], flags: [...(invoice.flags ?? []), ...flags], riskVersion: (invoice.riskVersion ?? 0) + 1 });
    audit(s, a, 'invoice-document-check', invoice.id, { attachment: attachment.id, flags: flags.map((f: Data) => f.code) });
}
