import { erasureDigest, pathValue } from './erasure-journal.mjs';
import type { TargetEffect } from '../modules/import-kit/src/types';
import { historicalGroups, historicalLineId, historicalDefinition, historicalFields, historicalLineFacts, mergeHistorical, historicalReport, historicalRowProof } from './procurify-lines';
import { importedInvoice, importedDeposit } from './import-invoice';
import { matchingInputs } from './supplier-identity';
import { sensitiveSupplierColumns, redactSupplierCsv } from './supplier-csv-custody';
import { supplierMatches } from './supplier-matching';
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
    const original = b.csv, config = b.mapping ?? {}, columns = config.columns ?? {};
    const inputRecords = csv(original), headers = Object.keys(inputRecords[0] ?? {});
    const sensitive = sensitiveSupplierColumns(headers, columns), redactedColumns = [...new Set(Object.values(sensitive).flat())];
    const redaction = redactedColumns.length ? redactSupplierCsv(original, redactedColumns) : null;
    const matchingBySource = new Map<string, Data>();
    for (const row of inputRecords.filter(r => r[columns.kind ?? 'kind'] === 'supplier')) {
        const fields: Data = {};
        for (const [field, names] of Object.entries(sensitive)) {
            const values = names.map(name => row[name]).filter(Boolean);
            requireThat(new Set(values.map(value => value.replace(/\D/g, ''))).size <= 1, 'Conflicting sensitive supplier columns: ' + field);
            fields[field] = values[0] ?? '';
        }
        matchingBySource.set(row[columns.sourceId ?? 'sourceId'], matchingInputs(s, fields));
    }
    const raw = redaction?.retained ?? original;
    const records = inputRecords.map(row => Object.fromEntries(Object.entries(row).map(([name, value]) => [name, redactedColumns.includes(name) && value ? '[REDACTED]' : value])));

    requireThat(records.length <= 300, 'Import at most 300 rows per reviewed batch');
    const col = (r: Data, k: string) => r[columns[k] ?? k] ?? '';
    const groups = historicalGroups(records, col);
    const definitions = new Map<string, Data>();
    for (const row of records.filter(r => col(r, 'kind') === 'field')) {
        const sourceId = col(row, 'sourceId');
        requireThat(Object.values(sensitiveSupplierColumns([col(row, 'name'), sourceId], {})).every(names => names.length === 0), 'Protected historical field definitions are unsupported; retain only matching inputs through supplier columns');
        definitions.set(sourceId, historicalDefinition(row, col, { id: id('field', sourceId), sourceId, imported: true, status: 'imported', name: col(row, 'name') }));
    }
    const keys = new Set(records.map(r => id(r[columns.kind ?? 'kind'], r[columns.sourceId ?? 'sourceId'])));
    const warnings: string[] = [];
    const currencies = new Set<string>();
    const unresolved: string[] = [];
    const statusMappings: Data[] = [];
    const values = new Map<string, Data>();
    for (const [rowIndex, r] of records.entries()) {
        const kind = col(r, 'kind'), sourceId = col(r, 'sourceId');
        requireThat(typeof sourceId === 'string' && sourceId.length > 0 && sourceId.length <= 2000, 'Source key required (maximum 2000 characters)');
        requireThat(['supplier', 'code', 'budget', 'request', 'order', 'receipt', 'invoice', 'deposit', 'field'].includes(kind), 'Import suppliers/codes/budgets, requests, orders, receipts, invoices or deposits');
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
        if (kind === 'field') value = { ...value, ...definitions.get(sourceId) };
        if (kind === 'supplier')
            value = { ...value, name: text(col(r, 'name'), 'Supplier name'), matching: matchingBySource.get(sourceId) ?? {}, sourceRedaction: redaction ? { redactedColumns: redaction.custody.redactedColumns } : null, status: status === 'blocked' ? 'blocked' : 'pending_review', requestedStatus: status === 'blocked' ? 'blocked' : status === 'preferred' ? 'preferred' : 'active', reason: 'Imported historical supplier status: ' + sourceStatus, dba: col(r, 'dba'), address: col(r, 'address'), phone: col(r, 'phone'), contacts: col(r, 'email') ? [{ name: col(r, 'contactName') || col(r, 'name'), email: col(r, 'email') }] : [], contractRef: col(r, 'contractRef'), renewal: col(r, 'renewal') ? sourceDate(col(r, 'renewal')) : '', documents: [] };
        if (kind === 'code')
            value = { ...value, codeType: text(col(r, 'codeType'), 'Code type'), name: text(col(r, 'name'), 'Code name') };
        if (kind === 'budget') {
            const currency = col(r, 'currency'); requireThat(/^[A-Z]{3}$/.test(currency) && get(s, 'business', 'main').currencies.includes(currency), 'Enable the imported budget currency first'); currencies.add(currency);
            value = { ...value, name: text(col(r, 'name'), 'Budget name'), currency, amountMinor: money(col(r, 'amount')), location: col(r, 'location'), costCentre: col(r, 'costCentre'), project: col(r, 'project') };
        }
        if (kind === 'request' || kind === 'order') {
            const c = col(r, 'currency');
            requireThat(/^[A-Z]{3}$/.test(c), 'Currency required');
            currencies.add(c);
            requireThat(get(s, 'business', 'main').currencies.includes(c), 'Enable all imported currencies first');
            const q = quantity(decimal(col(r, 'quantity'))), unitMinor = money(col(r, 'unitPrice')), line: Data = { id: historicalLineId(sourceId, col(r, 'lineId')), sourceLine: historicalLineId(sourceId, col(r, 'lineId')), ...(col(r, 'lineId') ? { sourceLineId: col(r, 'lineId'), historicalFields: historicalFields(s, definitions, col(r, 'lineFields'), kind, 'line') } : {}), description: text(col(r, 'description'), 'Description'), quantity: decimal(col(r, 'quantity')), q, unitMinor, totalMinor: extended(q, unitMinor), category: col(r, 'category'), project: col(r, 'project') };
            value = { ...value, title: col(r, 'name'), supplier: ref('supplierId', 'supplier'), currency: c, lines: [line], needDate: sourceDate(col(r, 'needDate')), revision: 1, freightMinor: money(col(r, 'freight') || '0'), taxMinor: money(col(r, 'tax') || '0'), terms: col(r, 'terms'), requester: 'historical', location: col(r, 'location'), costCentre: col(r, 'costCentre'), sourceBudget: col(r, 'budget'), sourceApproval: { status: sourceStatus, evidence: col(r, 'approvalEvidence') || null }, policy: null };
            value.totalMinor = line.totalMinor + value.freightMinor + value.taxMinor;
            if (kind === 'order')
                value = { ...value, request: ref('requestId', 'request'), number: col(r, 'number') || sourceId, sequence: 0, issuedAt: null };
            if (kind === 'order' && col(r, 'lineId')) line.sourceRequestLine = historicalLineId(col(r, 'requestId'), col(r, 'requestLineId'));
            if (!col(r, 'attachment'))
                warnings.push(`${kind} ${sourceId}: attachment not supplied`);
        }
        if (kind === 'receipt')
            value = { ...value, order: ref('orderId', 'order'), line: historicalLineId(col(r, 'orderId'), col(r, 'orderLineId')), quantity: decimal(col(r, 'quantity')), q: quantity(decimal(col(r, 'quantity'))), event: 'historical', at: sourceDate(col(r, 'date')), reason: 'Imported historical receipt, no native commitment effect' };
        if (kind === 'invoice') value = importedInvoice(r, col, { quantity: v => quantity(decimal(v)), money, date: sourceDate }, ref, value);
        if (kind === 'deposit') value = importedDeposit(r, col, money, ref, value, sourceDate);
        if (['request', 'order', 'invoice'].includes(kind) && col(r, 'lineId')) {
            value.historicalFields = historicalFields(s, definitions, col(r, 'headerFields'), kind, 'header');
            value.sourceRows = [historicalRowProof(r, rowIndex + 2, col)];
            if (kind === 'invoice') Object.assign(value.allocations[0], { sourceLineId: col(r, 'lineId'), historicalFields: historicalFields(s, definitions, col(r, 'lineFields'), kind, 'line') });
            const line = (value.lines ?? value.allocations)[0];
            Object.assign(line, historicalLineFacts(r, col, line.totalMinor ?? line.amountMinor, money));
            value = mergeHistorical(values.get(`${kind}:${sourceId}`), value);
        } else requireThat(!['headerFields','lineFields','lineDecision','lineDecisionReason','lineDecisionEvidence','lineAllocations'].some(field => col(r, field)), 'Historical custom values, decisions and splits require explicit lineId');
        values.set(`${kind}:${sourceId}`, value);
    }
    const erasedFields = all(s, 'erasureReceipt').flatMap(receipt => receipt.fields);
    for (const [key, value] of values) {
        const kind = key.slice(0, key.indexOf(':')) === 'field' ? 'importField' : key.slice(0, key.indexOf(':'));
        requireThat(!erasedFields.some(field => field.kind === kind && field.id === value.id && pathValue(value, field.path) !== undefined && erasureDigest(pathValue(value, field.path)) === field.before), 'Import source contains erased personal data; supply corrected history', 409);
    }
    const extras = new Map<string, TargetEffect[]>();
    for (const value of values.values()) {
        for (const line of value.lines ?? value.allocations ?? []) for (const split of line.historicalAllocations ?? []) {
            const code = [...values.values()].find(v => v.id === split.code) ?? s.get('code:' + split.code)?.value;
            requireThat(code?.imported && code.codeType === 'gl', 'Historical account allocation must reference an imported GL code');
        }
        if (value.sourceRows && value.lines && value.request) {
            const request = [...values.values()].find(v => v.id === value.request) ?? s.get('request:' + value.request)?.value;
            if (request) {
                requireThat(value.currency === request.currency && value.supplier === request.supplier, 'Historical PO supplier and currency must match its source request');
                requireThat(value.lines.every((line: Data) => request.lines.some((l: Data) => l.id === line.sourceRequestLine)), 'Historical PO line must reference an exact request line');
                requireThat(value.lines.every((line: Data) => request.lines.find((l: Data) => l.id === line.sourceRequestLine).sourceDecision?.decision !== 'declined' && line.sourceDecision?.decision !== 'declined'), 'Declined historical items cannot enter a PO');
            }
        }
        if (value.order && !value.allocations && value.line) {
            const order = [...values.values()].find(v => v.id === value.order) ?? s.get('order:' + value.order)?.value;
            if (order) requireThat(order.lines.some((line: Data) => line.id === value.line), 'Historical receipt must reference an exact PO line');
        }
        if (value.lines) {
            const counterparty = [...values.values()].find(v => v.id === value.supplier) ?? s.get('supplier:' + value.supplier)?.value;
            if (counterparty) value.supplierSnapshot = { id: value.supplier, name: counterparty.name, dba: counterparty.dba || '', address: counterparty.address || '', remitTo: counterparty.remitTo || '', contacts: structuredClone(counterparty.contacts ?? []), contractRef: counterparty.contractRef || '' };
        }
        if (value.allocations) {
            const order = [...values.values()].find(v => v.id === value.order) ?? s.get('order:' + value.order)?.value;
            if (order) {
                requireThat(value.currency === order.currency && value.allocations.every((a: Data) => order.lines.some((l: Data) => l.id === a.line)), 'Imported invoice currency and line must match its source PO');
                for (const allocation of value.allocations) allocation.orderedMinor = extended(allocation.q, order.lines.find((line: Data) => line.id === allocation.line).unitMinor);
                value.supplier = order.supplier;
                requireThat(!value.sourceSupplierId || id('supplier', value.sourceSupplierId) === order.supplier, 'Imported invoice supplier must match its source PO');
                if (!value.costCentre) value.costCentre = order.costCentre || '';
            }
            if (value.original) {
                const attachment = { ...value.original, id: id('invoice-original', value.sourceId), kind: 'invoice', record: value.id, actor: 'historical', at: value.at };
                value.document = Object.fromEntries(Object.entries(value.original).filter(([key]) => key !== 'base64'));
                extras.set(value.sourceId, [{ targetKind: 'attachment', targetId: attachment.id, value: attachment }, { targetKind: 'audit', targetId: id('invoice-original-audit', value.sourceId), value: { id: id('invoice-original-audit', value.sourceId), actor: 'historical', action: 'attachment', record: value.id, attachment: attachment.id, at: value.at, imported: true } }]);
            }
            delete value.original;
        }
        if (value.appliedMinor !== undefined && value.order) {
            const order = [...values.values()].find(v => v.id === value.order) ?? s.get('order:' + value.order)?.value;
            if (order) {
                requireThat(value.currency === order.currency, 'Imported deposit currency must match its source PO');
                value.supplier = order.supplier;
                if (!value.costCentre) value.costCentre = order.costCentre || '';
            }
        }
    }
    const supplierDuplicates: Data[] = [];
    const batchSuppliers = [...values.values()].filter(v => v.id.startsWith('procurify:supplier:'));
    const candidates = [...all(s, 'supplier').filter(v => !batchSuppliers.some(b => b.id === v.id)), ...batchSuppliers];
    for (const value of batchSuppliers) {
        const matches = supplierMatches(s, value, candidates);
        const versions = matches.map(m => [m.id, s.get('supplier:' + m.id)?.revision ?? sha256(canonicalJson(candidates.find(c => c.id === m.id)))]);
        value.duplicateCheck = { matches, versions };
        if (matches.length) supplierDuplicates.push({ sourceId: value.sourceId, supplier: value.id, matches });
    }
    const bytes = new TextEncoder().encode(raw), hash = sha256(bytes);
    const source: SourceBundle = { diagnostics: unresolved.map(message => ({ severity: 'error', code: 'UNRESOLVED_REFERENCE', message })), artifacts: [{ name: b.filename || 'procurify-shape.csv', sha256: hash, size: bytes.length, original: { status: 'available', base64: Buffer.from(bytes).toString('base64') } }, ...(redaction ? [{ name: (b.filename || 'procurify-shape.csv') + '.custody.json', sha256: sha256(canonicalJson(redaction.custody)), size: new TextEncoder().encode(canonicalJson(redaction.custody)).length, original: { status: 'available' as const, base64: Buffer.from(canonicalJson(redaction.custody)).toString('base64') } }] : [])], records: groups.flatMap(group => {
        const explicitLines = ['request','order','invoice'].includes(group.kind) && col(group.rows[0], 'lineId');
        const sources = explicitLines ? [{ payload: { rows: group.rows, positions: group.positions }, row: group.positions[0] }] : group.rows.map((payload, index) => ({ payload, row: group.positions[index] }));
        return sources.map(({ payload, row }) => ({ namespace: 'procurify', kind: group.kind, sourceId: group.sourceId, payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: hash, location: { artifact: b.filename || 'procurify-shape.csv', row } }));
    }).sort((a, b) => ['supplier', 'code', 'budget', 'field', 'request', 'order', 'receipt', 'invoice', 'deposit'].indexOf(a.kind) - ['supplier', 'code', 'budget', 'field', 'request', 'order', 'receipt', 'invoice', 'deposit'].indexOf(b.kind)) };
    const mapping: ImportMapping = { version: sha256(canonicalJson(config)), map: r => ({ effects: unresolved.length ? [] : [{ targetKind: r.kind === 'field' ? 'importField' : r.kind, targetId: id(r.kind, r.sourceId), value: values.get(`${r.kind}:${r.sourceId}`)! }, ...(r.kind === 'invoice' ? extras.get(r.sourceId) ?? [] : [])], ...(unresolved.length ? { rejection: 'Resolve references before commit' } : {}) }) };
    return { source, mapping, report: { supplierRedaction: redaction?.custody ?? null, supplierDuplicates, currencies: [...currencies], unresolved, statusMappings, missingAttachments: warnings, fixtureOnly: true, inputRows: records.length, ...historicalReport([...values.values()]) } };
}
