import { createHash } from 'node:crypto';
import { canonicalSupplier, matchingInputs } from './supplier-identity';
import { all, date, get, requireThat, text, type Data, type State } from './types';

function email(value: unknown): { address: string; domain: string } {
    const address = text(value, 'Unverified sender email', 254).toLowerCase();
    const parts = address.split('@');
    requireThat(parts.length === 2 && parts[0].length <= 64 &&
        /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(parts[0]) &&
        !parts[0].startsWith('.') && !parts[0].endsWith('.') && !parts[0].includes('..'), 'Use a valid sender email');
    requireThat(!/[\s\u0000-\u0020\u007f/:?#\\%]/u.test(parts[1]), 'Use a valid sender email');
    let domain = '';
    try { domain = new URL('https://' + parts[1]).hostname; } catch { /* Validated below. */ }
    requireThat(domain.length <= 253 && domain.includes('.') && domain.split('.').every(label =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)), 'Use a valid sender email');
    return { address, domain };
}

function oneEdit(a: string, b: string): boolean {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i++; j++; continue; }
        if (++edits > 1) return false;
        if (a.length >= b.length) i++;
        if (b.length >= a.length) j++;
    }
    return edits + (a.length - i) + (b.length - j) === 1;
}

function documentMetadata(input: unknown): Data {
    requireThat(input !== null && typeof input === 'object' && !Array.isArray(input), 'Invoice document must be an object');
    const document = input as Data;
    const name = text(document.name, 'Invoice document name', 200);
    const mediaType = text(document.mediaType, 'Invoice document media type', 150).toLowerCase();
    requireThat(typeof document.base64 === 'string' && document.base64.length > 0 && document.base64.length <= 1333336 &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(document.base64), 'Invoice document must be valid base64 up to 1 MB');
    const bytes = Buffer.from(document.base64, 'base64');
    requireThat(bytes.length > 0 && bytes.length <= 1000000 && bytes.toString('base64') === document.base64,
        'Invoice document must contain up to 1 MB of valid bytes');
    return { name, mediaType, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** Detection only: reads state, returns safe evidence, and grants no authority. */
export function invoiceRisk(s: State, order: Data, candidate: Data, input: Data): Data {
    const invoiceDate = date(input.invoiceDate === undefined ? new Date().toISOString().slice(0, 10) : input.invoiceDate, 'Invoice date');
    const flags: Data[] = [];
    const result: Data = { invoiceDate, invoiceDateSource: input.invoiceDate === undefined ? 'default-current-utc' : 'supplied', flags };
    const invoices = all(s, 'invoice').filter(i => i.id !== candidate.id);
    const supplierId = canonicalSupplier(s, candidate.supplier);
    for (const previous of invoices) {
        const previousDate = previous.invoiceDate ?? s.get('payable:' + previous.id)?.value.invoiceDate ?? previous.at?.slice(0, 10);
        if (previous.reference !== candidate.reference && previous.currency === candidate.currency &&
            previous.totalMinor === candidate.totalMinor && previousDate === invoiceDate &&
            canonicalSupplier(s, get(s, 'order', previous.order).supplier) === supplierId) {
            flags.push({ code: 'near-duplicate', reason: 'Same supplier, currency, amount and invoice date with a different reference', relatedInvoice: previous.id });
        }
    }

    if (input.document !== undefined) {
        result.document = documentMetadata(input.document);
        for (const previous of invoices) {
            if (previous.document?.sha256 === result.document.sha256 || previous.documentHashes?.includes(result.document.sha256) || all(s, 'attachment').some(file => file.kind === 'invoice' && file.record === previous.id && createHash('sha256').update(Buffer.from(file.base64, 'base64')).digest('hex') === result.document.sha256)) {
                flags.push({ code: 'duplicate-document', documentHash: result.document.sha256, reason: 'Identical document bytes were recorded on another invoice', relatedInvoice: previous.id });
            }
        }
    }

    const supplier = get(s, 'supplier', supplierId);
    // A matching-only fingerprint has no verification provenance. Never return
    // the fingerprint, submitted bank fields, or a claim that it is verified.
    result.remit = { supplied: input.remit !== undefined, baseline: supplier.matching?.bank ? 'matching-only' : 'missing', comparison: 'not-supplied', verified: false };
    if (input.remit !== undefined) {
        requireThat(input.remit !== null && typeof input.remit === 'object' && !Array.isArray(input.remit), 'Invoice remit must be an object');
        requireThat(typeof input.remit.bankRouting === 'string' && input.remit.bankRouting.trim() &&
            typeof input.remit.bankAccount === 'string' && input.remit.bankAccount.trim(), 'Invoice remit requires routing number and bank account');
        const fingerprint = matchingInputs(s, { bankRouting: input.remit.bankRouting, bankAccount: input.remit.bankAccount }).bank;
        result.remit.comparison = !supplier.matching?.bank ? 'unavailable' : fingerprint === supplier.matching.bank ? 'matched' : 'mismatched';
        if (!supplier.matching?.bank) flags.push({ code: 'remit-baseline-missing', reason: 'Remit details were supplied but the supplier has no matching-only bank baseline; verification is not established' });
        else if (fingerprint !== supplier.matching.bank) flags.push({ code: 'remit-mismatch', reason: 'Remit details differ from the supplier matching-only bank baseline; verification is not established' });
    }

    result.sender = { supplied: input.senderEmail !== undefined, authentication: 'unverified', baseline: 'immutable-po-contacts', comparison: 'not-supplied' };
    if (input.senderEmail !== undefined) {
        const sender = email(input.senderEmail);
        const domains = (order.supplierSnapshot?.contacts ?? []).flatMap((contact: Data) => {
            // Historical contacts were not email-validated. Invalid historical
            // values cannot establish a sender-domain baseline.
            try { return [email(contact.email).domain]; } catch { return []; }
        });
        result.sender = { ...result.sender, email: sender.address, domain: sender.domain, comparison: domains.length ? 'matched' : 'baseline-missing' };
        if (!domains.includes(sender.domain)) {
            result.sender.comparison = domains.length ? 'mismatched' : 'baseline-missing';
            const relation = domains.some((domain: string) => sender.domain.endsWith('.' + domain) || domain.endsWith('.' + sender.domain)) ? 'subdomain difference' :
                sender.domain.split('.').some(label => label.startsWith('xn--')) ? 'Unicode/encoded domain difference' :
                domains.some((domain: string) => oneEdit(domain, sender.domain)) ? 'one-character domain difference' : 'different domain';
            flags.push({ code: 'sender-domain', reason: domains.length ?
                'Unverified sender has a ' + relation + ' from the immutable PO contacts; sender authentication is not established' :
                'Unverified sender cannot be compared because the immutable PO has no valid contact domain; sender authentication is not established' });
        }
    }

    // Amendments replace the issued face value, while earlier invoice evidence
    // continues to consume the same request's balance. Currencies stay separate.
    const orders = all(s, 'order').filter(o => o.request === order.request && o.currency === candidate.currency);
    const orderIds = new Set(orders.map(o => o.id));
    const currentIssued = orders.filter(o => o.issuedAt && !o.amendedBy && o.status !== 'amended');
    const faceMinor = currentIssued.length ? Math.max(...currentIssued.map(o => o.totalMinor)) : null;
    const billedMinor = invoices.filter(i => orderIds.has(i.order) && i.currency === candidate.currency).reduce((n, i) => n + i.totalMinor, 0);
    result.balance = { basis: 'current-issued-po-face-across-request-amendments', currency: candidate.currency, faceMinor, billedMinor, candidateMinor: candidate.totalMinor,
        remainingMinor: faceMinor === null ? null : Math.max(0, faceMinor - billedMinor), depositAccounting: 'not-implemented' };
    if (faceMinor !== null && billedMinor + candidate.totalMinor > faceMinor) {
        flags.push({ code: 'po-balance', reason: 'Invoice plus prior invoice evidence exceeds the current issued PO face total across request amendments' });
    }
    return result;
}
