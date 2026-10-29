import { missingField } from './quote-reading-fields';
import { uid, type Data } from './types';
import type { SourceLine } from './quote-reading-source';
import { invoiceChargeTypes } from './invoice-charge-types';
export const invoiceOptionalHeaders = invoiceChargeTypes.slice(1).map(charge=>charge.field);
export const invoiceHeaders = ['supplier', 'reference', 'invoiceDate', 'dueDate', 'terms', 'poNumber', 'currency', 'senderEmail', 'remitTo', 'subtotalAmount', 'freightAmount', 'taxAmount', 'totalAmount', ...invoiceChargeTypes.slice(1).map(charge=>charge.field)];
export const invoiceItems = ['description', 'quantity', 'unitAmount', 'amount'];
const amount = /^(?:[A-Z]{3}\s*)?[$€£]?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*$/;
const aliases: Record<string, RegExp> = { description: /^(?:item|description|product|service)$/i, quantity: /^(?:qty|quantity)$/i, unitAmount: /^(?:unit price|unit cost|rate)$/i, amount: /^(?:line amount|line total|amount|extended price)$/i };
const emptyLine = (): Data => ({ id: uid(), ...Object.fromEntries(invoiceItems.map(key => [key, missingField()])) });
/** Label matching proposes facts only: no instruction execution and no inferred amounts. */
export function parseInvoiceAmounts(rows: SourceLine[], attachment: string): Data {
    const result: Data = { lines: [], ...Object.fromEntries(['subtotalAmount', 'freightAmount', 'taxAmount', 'totalAmount'].map(key => [key, missingField()])) };
    const found = (value: string, row: SourceLine, confidence: number) => ({ value: invoiceReadingText(value,'Invoice value'), confidence, source: { attachment, page: row.page, line: row.line, excerpt: invoiceReadingText(row.text,'Invoice quotation'), method: 'explicit invoice label' } });
    let headers: string[] | null = null, block: Data | null = null;
    const finish = () => { if (block && invoiceItems.some(key => block![key].value !== null)) result.lines.push(block); block = null; };
    for (const row of rows) {
        const header = row.text.match(/^(subtotal|freight|shipping|fuel surcharge|handling|small-order fee|other fees|tax|sales tax|total|invoice total|amount due)\s*[:=]\s*(.+)$/i);
        if (header) { const value = header[2].match(amount); if (value) { const key = invoiceChargeTypes.find(charge=>charge.label.toLowerCase()===header[1].toLowerCase())?.field ?? (/subtotal/i.test(header[1]) ? 'subtotalAmount' : /shipping/i.test(header[1]) ? 'freightAmount' : /tax/i.test(header[1]) ? 'taxAmount' : 'totalAmount'); result[key] = found(value[1], row, .97); } continue; }
        const cells = row.text.split(/\s*\|\s*|\t+|\s{2,}/).map(value => value.trim()).filter(Boolean);
        const candidate = cells.map(cell => Object.keys(aliases).find(key => aliases[key].test(cell)) ?? '');
        if (candidate.includes('description') && candidate.includes('quantity')) { finish(); headers = candidate; continue; }
        if (headers && headers.length === cells.length) {
            const line = emptyLine(); headers.forEach((key, i) => { if (key) { const value = ['unitAmount', 'amount'].includes(key) ? cells[i].match(amount)?.[1] : cells[i]; if (value) line[key] = found(value, row, .92); } });
            if (line.description.value && line.quantity.value) { result.lines.push(line); continue; }
        }
        const labeled = row.text.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
        if (!labeled) continue;
        const key = Object.keys(aliases).find(name => aliases[name].test(labeled[1].trim()));
        if (!key) continue;
        if (key === 'description') finish();
        block ??= emptyLine();
        const value = ['unitAmount', 'amount'].includes(key) ? labeled[2].match(amount)?.[1] : labeled[2].trim();
        if (value) block[key] = found(value, row, .97);
    }
    finish(); return result;
}

const identityLabels: Record<string, RegExp> = {
    supplier: /^(?:supplier|vendor|seller)\s*:\s*(.+)$/i,
    reference: /^(?:invoice(?: number| no\.?| #)?|reference)\s*:\s*(.+)$/i,
    invoiceDate: /^(?:invoice date|date)\s*:\s*(.+)$/i,
    dueDate: /^due date\s*:\s*(.+)$/i,
    terms: /^(?:payment terms|terms)\s*:\s*(.+)$/i,
    poNumber: /^(?:po number|purchase order|po)\s*:\s*(.+)$/i,
    currency: /^currency\s*:\s*([A-Z]{3})\s*$/i,
    senderEmail: /^(?:sender|sender email)\s*:\s*(.+)$/i,
    remitTo: /^remit(?: to)?\s*:\s*(.+)$/i,
};
import { invoiceReadingText, postalRemit } from './invoice-reading-values';
export function parseInvoiceFields(rows: SourceLine[], attachment: string): Data {
    const result = { ...Object.fromEntries(invoiceHeaders.filter(key=>!invoiceOptionalHeaders.includes(key as typeof invoiceOptionalHeaders[number])).map(key => [key, missingField()])), ...parseInvoiceAmounts(rows, attachment) };
    for (const row of rows) for (const [key, pattern] of Object.entries(identityLabels)) {
        const match = row.text.match(pattern); if (!match) continue;
        try {
            const value = key === 'remitTo' ? postalRemit(match[1]) : invoiceReadingText(match[1], key);
            result[key] = { value, confidence: .97, source: { attachment, page: row.page, line: row.line, ...(key === 'remitTo' ? {} : { excerpt: invoiceReadingText(row.text, 'Source quotation') }), method: 'explicit invoice label' } };
        } catch { result[key] = missingField(); }
    }
    return result;
}

/** A MIME From header is recorded as an unverified source fact, never authentication. */
export function invoiceEmailSender(attachment: Data): Data | undefined {
    if (!/^message\/rfc822(?:;|$)/i.test(attachment.mediaType) && !/\.eml$/i.test(attachment.name)) return;
    const raw = new TextDecoder().decode(Uint8Array.from(atob(attachment.base64), c=>c.charCodeAt(0)));
    const headers = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g,' '), from = headers.match(/^From:[ \t]*(.+)$/im);
    if (!from) return missingField();
    try {
        const value=invoiceReadingText(from[1].match(/<([^<>]+)>/)?.[1]??from[1],'Unverified MIME sender');
        if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(value)) return missingField();
        return {value,confidence:.97,source:{attachment:attachment.id,page:1,line:headers.slice(0,from.index).split(/\r?\n/).length,excerpt:invoiceReadingText(from[0],'Sender header'),method:'MIME From header (unverified)'}};
    } catch {return missingField();}
}
