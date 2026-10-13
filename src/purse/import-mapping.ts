import { canonicalJson, sha256, type SourceBundle, type ImportMapping } from '../modules/import-kit/src/d1/index';
import { all, get, requireThat, text, minor, quantity, extended, date, type State, type Data } from './types';
export function csv(raw: string) {
    const rows: string[][] = []; let row: string[] = [], field = '', state: 'plain' | 'quoted' | 'closed' = 'plain';
    const finishField = () => { row.push(field); field = ''; state = 'plain'; };
    const finishRow = () => { finishField(); if (row.some(Boolean)) rows.push(row); row = []; };
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (state === 'quoted') {
            if (c !== '"') field += c;
            else if (raw[i + 1] === '"') { field += '"'; i++; }
            else state = 'closed';
        } else if (c === ',') finishField();
        else if (c === '\r' || c === '\n') { if (c === '\r' && raw[i + 1] === '\n') i++; finishRow(); }
        else {
            requireThat(state !== 'closed', 'Unexpected characters after closing CSV quote');
            if (c === '"') { requireThat(field === '', 'Unexpected CSV quote'); state = 'quoted'; }
            else field += c;
        }
    }
    requireThat(state !== 'quoted', 'Unclosed CSV quote'); finishRow();
    const headers = rows.shift(); requireThat(headers && new Set(headers).size === headers.length, 'Unique CSV headers required');
    requireThat(rows.every(r => r.length === headers.length), 'CSV column count differs');
    return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
const id = (kind: string, key: string) => `procurify:${kind}:${key}`;
export function mappedSource(s: State, b: Data) {
    requireThat(typeof b.csv === 'string' && b.csv.length > 0 && b.csv.length <= 1000000, 'CSV bytes required, maximum 1 MB');
    const raw = b.csv, config = b.mapping ?? {}, columns = config.columns ?? {};
    const records = csv(raw);
    requireThat(records.length <= 300, 'Import at most 300 rows per reviewed batch');
    const keys = new Set(records.map(r => id(r[columns.kind ?? 'kind'], r[columns.sourceId ?? 'sourceId'])));
    const warnings: string[] = [];
    const currencies = new Set<string>();
    const unresolved: string[] = [];
    const statusMappings: Data[] = [];
    const values = new Map<string, Data>();
    const col = (r: Data, k: string) => r[columns[k] ?? k] ?? '';
    for (const r of records) {
        const kind = col(r, 'kind'), sourceId = col(r, 'sourceId');
        requireThat(typeof sourceId === 'string' && sourceId.length > 0 && sourceId.length <= 2000, 'Source key required (maximum 2000 characters)');
        requireThat(['supplier', 'code', 'request', 'order', 'receipt'].includes(kind), 'Import suppliers/codes, requests, orders or receipts');
        const sourceStatus = col(r, 'status'), status = config.statuses?.[sourceStatus];
        requireThat(status, 'Map every source status explicitly');
        statusMappings.push({ source: sourceStatus, mapped: status });
        const meta = { imported: true, sourceId, sourceStatus, mappedStatus: status, mapping: config, status: 'imported', name: col(r, 'name') };
        let value: Data = { ...meta, id: id(kind, sourceId) };
        const ref = (k: string, targetKind: string) => { const source = col(r, k), ref = id(targetKind, source); if (!source || (!keys.has(ref) && !s.has(`${targetKind}:${ref}`)))
            unresolved.push(`${kind} ${sourceId}: ${k} ${source || '(missing)'}`); return ref; };
        const decimal = (v: string) => { requireThat(config.decimal === '.' || config.decimal === ',', 'Choose decimal convention'); return config.decimal === ',' ? v.replace(',', '.') : v; };
        const money = (v: string) => { const x = decimal(v); requireThat(/^\d+(\.\d{1,2})?$/.test(x), 'Money must have at most 2 decimal places'); const [whole, fraction = ''] = x.split('.'); return minor(Number(whole) * 100 + Number(fraction.padEnd(2, '0'))); };
        const sourceDate = (v: string) => { requireThat(['YYYY-MM-DD', 'DD/MM/YYYY'].includes(config.date), 'Choose date convention'); return date(config.date === 'DD/MM/YYYY' ? v.split('/').reverse().join('-') : v); };
        if (kind === 'supplier')
            value = { ...value, name: text(col(r, 'name'), 'Supplier name'), status: status === 'blocked' ? 'blocked' : status === 'preferred' ? 'preferred' : 'active', reason: 'Imported historical supplier status: ' + sourceStatus, contacts: [], contractRef: col(r, 'contractRef'), renewal: col(r, 'renewal') ? sourceDate(col(r, 'renewal')) : '', documents: [] };
        if (kind === 'code')
            value = { ...value, codeType: text(col(r, 'codeType'), 'Code type'), name: text(col(r, 'name'), 'Code name') };
        if (kind === 'request' || kind === 'order') {
            const c = col(r, 'currency');
            requireThat(/^[A-Z]{3}$/.test(c), 'Currency required');
            currencies.add(c);
            requireThat(get(s, 'business', 'main').currencies.includes(c), 'Enable all imported currencies first');
            const q = quantity(decimal(col(r, 'quantity'))), unitMinor = money(col(r, 'unitPrice')), line = { id: id('line', sourceId), sourceLine: id('line', sourceId), description: text(col(r, 'description'), 'Description'), quantity: decimal(col(r, 'quantity')), q, unitMinor, totalMinor: extended(q, unitMinor), category: col(r, 'category'), project: col(r, 'project') };
            value = { ...value, title: col(r, 'name'), supplier: ref('supplierId', 'supplier'), currency: c, lines: [line], needDate: sourceDate(col(r, 'needDate')), revision: 1, freightMinor: money(col(r, 'freight') || '0'), taxMinor: money(col(r, 'tax') || '0'), terms: col(r, 'terms'), requester: 'historical', policy: null };
            value.totalMinor = line.totalMinor + value.freightMinor + value.taxMinor;
            if (kind === 'order')
                value = { ...value, request: ref('requestId', 'request'), number: col(r, 'number') || sourceId, sequence: 0, issuedAt: null };
            if (!col(r, 'attachment'))
                warnings.push(`${kind} ${sourceId}: attachment not supplied`);
        }
        if (kind === 'receipt')
            value = { ...value, order: ref('orderId', 'order'), line: id('line', col(r, 'orderId')), quantity: decimal(col(r, 'quantity')), q: quantity(decimal(col(r, 'quantity'))), event: 'historical', at: sourceDate(col(r, 'date')), reason: 'Imported historical receipt, no native commitment effect' };
        values.set(`${kind}:${sourceId}`, value);
    }
    const bytes = new TextEncoder().encode(raw), hash = sha256(bytes);
    const source: SourceBundle = { diagnostics: unresolved.map(message => ({ severity: 'error', code: 'UNRESOLVED_REFERENCE', message })), artifacts: [{ name: b.filename || 'procurify-shape.csv', sha256: hash, size: bytes.length, original: { status: 'available', base64: Buffer.from(bytes).toString('base64') } }], records: records.map((r, i) => { const kind = col(r, 'kind'), sourceId = col(r, 'sourceId'); return { namespace: 'procurify', kind, sourceId, payload: r, payloadHash: sha256(canonicalJson(r)), artifactHash: hash, location: { artifact: b.filename || 'procurify-shape.csv', row: i + 2 } }; }).sort((a, b) => ['supplier', 'code', 'request', 'order', 'receipt'].indexOf(a.kind) - ['supplier', 'code', 'request', 'order', 'receipt'].indexOf(b.kind)) };
    const mapping: ImportMapping = { version: sha256(canonicalJson(config)), map: r => ({ effects: unresolved.length ? [] : [{ targetKind: r.kind, targetId: id(r.kind, r.sourceId), value: values.get(`${r.kind}:${r.sourceId}`)! }], ...(unresolved.length ? { rejection: 'Resolve references before commit' } : {}) }) };
    return { source, mapping, report: { currencies: [...currencies], unresolved, statusMappings, missingAttachments: warnings, fixtureOnly: true } };
}
