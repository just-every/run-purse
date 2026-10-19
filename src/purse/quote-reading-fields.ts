import type { SourceLine } from './quote-reading-source';
import { uid, type Data } from './types';
export type QuoteField = { value: string | null; confidence: number; source: Data | null };
export const missingField = (): QuoteField => ({ value: null, confidence: 0, source: null });
function field(value: string, row: SourceLine, attachment: string, method: string, confidence: number): QuoteField { return { value: value.trim(), confidence, source: { attachment, page: row.page, line: row.line, excerpt: row.text, method } }; }
const amount = '(?:[A-Z]{3}\\s*)?[$€£]?\\s*((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)';
const aliases: Record<string, RegExp> = { description: /^(?:item|description|product|service)(?:\s+description)?$/i, quantity: /^(?:qty|quantity|units)$/i, unitAmount: /^(?:unit\s*(?:price|cost)|price(?:\s*each)?|rate)$/i, unit: /^(?:uom|unit|unit of measure)$/i };
function splitCells(value: string) { return value.split(/\s*\|\s*|\t+|\s{2,}/).map(s => s.trim()).filter(Boolean); }
export function parseQuoteFields(rows: SourceLine[], attachment: string): Data {
    const result: Data = { lines: [], currency: missingField(), freightAmount: missingField(), taxAmount: missingField(), leadTime: missingField(), validity: missingField() };
    let headers: string[] | null = null, block: Data | null = null;
    const finish = () => { if (block && ['description', 'quantity', 'unitAmount'].some(name => block![name].value !== null)) result.lines.push(block); block = null; };
    const emptyLine = () => ({ id: uid(), description: missingField(), quantity: missingField(), unitAmount: missingField(), unit: missingField() });
    for (const row of rows) {
        const value = row.text;
        for (const [name, pattern] of Object.entries({ freightAmount: /^(?:freight|shipping|delivery charge)\s*[:=]?\s*/i, taxAmount: /^(?:tax|sales tax|gst|vat)(?:\s+amount)?\s*[:=]?\s*/i })) {
            const prefix = value.match(pattern); if (prefix) { const rest = value.slice(prefix[0].length), match = rest.match(new RegExp('^' + amount + '\\s*$')); if (match) result[name] = field(match[1], row, attachment, 'explicit amount label', .97); }
        }
        const currency = value.match(/^(?:currency|quote currency)\s*[:=]\s*([A-Z]{3})\s*$/i); if (currency) result.currency = field(currency[1].toUpperCase(), row, attachment, 'explicit currency label', .99);
        for (const [name, pattern] of Object.entries({ leadTime: /^(?:lead\s*time|delivery\s*time)\s*[:=]\s*(.+)$/i, validity: /^(?:valid(?:ity|\s+until|\s+for)?|quote\s+valid(?:ity)?|offer\s+expires|expiry)\s*[:=]\s*(.+)$/i })) { const match = value.match(pattern); if (match) result[name] = field(match[1], row, attachment, 'explicit term label', .97); }
        const cells = splitCells(value), candidate = cells.map(cell => Object.keys(aliases).find(name => aliases[name].test(cell)) ?? '');
        if (candidate.includes('description') && (candidate.includes('quantity') || candidate.includes('unitAmount'))) { finish(); headers = candidate; continue; }
        if (headers && cells.length === headers.length && !/^(?:subtotal|total|freight|shipping|tax|gst|vat)\b/i.test(cells[0])) {
            const line = emptyLine(); headers.forEach((name, i) => { if (name) { let content = cells[i]; if (name === 'unitAmount') content = content.match(new RegExp('^' + amount + '$'))?.[1] ?? ''; if (content) line[name as keyof typeof line] = field(content, row, attachment, 'labelled table column', .92) as never; } });
            if (line.description.value && (line.quantity.value || line.unitAmount.value)) { result.lines.push(line); continue; }
        }
        const labeled = value.match(/^(item|description|product|service|qty|quantity|unit price|unit cost|price each|rate|uom|unit)\s*[:=]\s*(.*)$/i);
        if (labeled) { const name = Object.keys(aliases).find(k => aliases[k].test(labeled[1])); if (name) { if (name === 'description') finish(); block ??= emptyLine(); let content = labeled[2]; if (name === 'unitAmount') content = content.match(new RegExp('^' + amount + '$'))?.[1] ?? ''; if (content) block[name] = field(content, row, attachment, 'explicit item label', .97); continue; } }
        const inline = value.match(new RegExp('^(.+?)\\s+(?:qty|quantity)\\s*[:=]?\\s*(\\d+(?:\\.\\d{1,3})?)\\s+(?:at|@|unit price|price)\\s*[:=]?\\s*' + amount + '(?:\\s+(?:each|per\\s+(.+)))?$', 'i'));
        if (inline) { finish(); const line = emptyLine(); line.description = field(inline[1], row, attachment, 'inline quantity and price labels', .85); line.quantity = field(inline[2], row, attachment, 'inline quantity label', .94); line.unitAmount = field(inline[3], row, attachment, 'inline price label', .94); if (inline[4]) line.unit = field(inline[4], row, attachment, 'inline unit label', .9); result.lines.push(line); }
    }
    finish(); return result;
}
