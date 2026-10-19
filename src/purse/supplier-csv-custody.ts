import { sha256 } from '../modules/import-kit/src/d1/index';
import { type Data } from './types';

const aliases: Record<string, string[]> = {
    tin: ['tin', 'taxid', 'taxpayerid', 'ein', 'w9tin', 'federaltaxid', 'taxidnumber', 'taxidentificationnumber', 'taxpayeridentificationnumber', 'employeridentificationnumber', 'ssn', 'socialsecuritynumber', 'w9taxid'],
    bankRouting: ['bankrouting', 'bankroutingnumber', 'routing', 'routingnumber', 'abaroutingnumber', 'routingtransitnumber', 'bankroutingno', 'abanumber'],
    bankAccount: ['bankaccount', 'bankaccountnumber', 'accountnumber', 'bankaccountno', 'bankacct', 'bankacctnumber', 'accountno'],
};
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
export function sensitiveSupplierColumns(headers: string[], columns: Data) {
    return Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field,
        headers.filter(header => header === columns[field] || names.includes(normalize(header))) ]));
}

// Only sensitive cell spans change. All other original bytes (including CRLF,
// quoting and multiline cells) stay byte-for-byte intact.
export function redactSupplierCsv(raw: string, columns: string[]) {
    const rows: { start: number; end: number; value: string }[][] = [];
    let row: { start: number; end: number; value: string }[] = [], start = 0, quoted = false;
    const field = (end: number) => {
        const value = raw.slice(start, end);
        row.push({ start, end, value: value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value });
    };
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '"') { if (quoted && raw[i + 1] === '"') i++; else quoted = !quoted; }
        else if (!quoted && (raw[i] === ',' || raw[i] === '\r' || raw[i] === '\n')) {
            field(i);
            if (raw[i] !== ',') { rows.push(row); row = []; if (raw[i] === '\r' && raw[i + 1] === '\n') i++; }
            start = i + 1;
        }
    }
    field(raw.length); rows.push(row);
    const headerIndex = rows.findIndex(r => r.some(c => c.value));
    const header = rows[headerIndex], indices = new Set(header.map((cell, i) => columns.includes(cell.value) ? i : -1).filter(i => i >= 0));
    const spans = rows.slice(headerIndex + 1).flatMap(r => r.filter((cell, i) => indices.has(i) && cell.value));
    let retained = '', cursor = 0;
    for (const span of spans) { retained += raw.slice(cursor, span.start) + (raw[span.start] === '"' ? '"[REDACTED]"' : '[REDACTED]'); cursor = span.end; }
    retained += raw.slice(cursor);
    return { retained, custody: { schema: 'purse.supplier-csv-redaction/v1', originalSha256: sha256(raw), retainedSha256: sha256(retained), redactedColumns: columns } };
}
