import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index';
import { date, minor, requireThat, type Data, type State } from './types';
export type Columns = (row: Data, name: string) => string;
export const historicalLineId = (header: string, line = '') => line ? 'procurify:line-v2:' + JSON.stringify([header, line]) : 'procurify:line:' + header;
const purchaseKinds = ['request', 'order', 'invoice'];
const headerFields = ['name','status','supplierId','currency','needDate','freight','tax','terms','requestId','orderId','number','location','costCentre','budget','approvalEvidence','attachment','date','email','remitTo','paidDate','paymentEvidence','documentName','documentMediaType','documentBase64','headerFields'];
export function historicalGroups(records: Data[], col: Columns) {
    const groups = new Map<string, { kind: string; sourceId: string; rows: Data[]; positions: number[] }>();
    records.forEach((row, index) => {
        const kind = col(row, 'kind'), sourceId = col(row, 'sourceId'), key = canonicalJson([kind, sourceId]);
        const group = groups.get(key) ?? { kind, sourceId, rows: [], positions: [] };
        if (purchaseKinds.includes(kind) && (col(row, 'lineId') || group.rows.some(r => col(r, 'lineId')))) {
            requireThat(col(row, 'lineId').length > 0 && col(row, 'lineId').length <= 2000 && group.rows.every(r => col(r, 'lineId')), 'Every multi-line row needs an exact lineId');
            requireThat(!group.rows.some(r => col(r, 'lineId') === col(row, 'lineId')), 'Duplicate historical line identity');
            requireThat(group.rows.every(r => headerFields.every(field => col(r, field) === col(row, field))), 'Conflicting historical header fields');
        } else if (group.rows.length) requireThat(canonicalJson(group.rows[0]) === canonicalJson(row), 'Conflicting historical source identity');
        group.rows.push(row); group.positions.push(index + 2); groups.set(key, group);
    });
    return [...groups.values()];
}
function json(value: string, label: string) {
    try { return JSON.parse(value); } catch { requireThat(false, label + ' must be valid JSON'); }
}
export function historicalDefinition(row: Data, col: Columns, meta: Data) {
    const recordKind = col(row, 'recordKind'), scope = col(row, 'fieldScope'), type = col(row, 'fieldType');
    requireThat(purchaseKinds.includes(recordKind) && ['header','line'].includes(scope), 'Historical field needs a record kind and header or line scope');
    requireThat(['text','choice','number','date','boolean'].includes(type), 'Unsupported historical field type');
    requireThat(!/(?:bank|routing|(?:^|[^a-z])tin(?:$|[^a-z])|tax.?id|social.?security|account.?number)/i.test(col(row, 'name') + ' ' + col(row, 'sourceId')), 'Protected historical definitions are unsupported');
    const options = col(row, 'fieldOptions') ? json(col(row, 'fieldOptions'), 'Field options') : [];
    requireThat(Array.isArray(options) && options.length <= 100 && options.every(v => typeof v === 'string' && v.length > 0 && v.length <= 2000) && new Set(options).size === options.length && (type === 'choice' ? options.length > 0 : options.length === 0), 'Historical field choices invalid');
    requireThat(typeof meta.name === 'string' && meta.name.length > 0 && meta.name.length <= 2000, 'Historical field name required');
    return { ...meta, recordKind, scope, type, options, authority: 'inert-history' };
}
export function historicalFields(s: State, definitions: Map<string, Data>, raw: string, kind: string, scope: string) {
    if (!raw) return [];
    const fields = json(raw, 'Historical field values');
    requireThat(fields && typeof fields === 'object' && !Array.isArray(fields) && Object.keys(fields).length <= 50, 'Historical field values must be an object');
    return Object.entries(fields).map(([sourceId, value]) => {
        const definition = definitions.get(sourceId) ?? s.get('importField:procurify:field:' + sourceId)?.value;
        requireThat(definition && definition.recordKind === kind && definition.scope === scope && definition.authority === 'inert-history', 'Historical field definition or scope missing');
        requireThat(definition.type === 'boolean' ? typeof value === 'boolean' : definition.type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === 'string' && value.length <= 2000, 'Historical field value type differs');
        if (definition.type === 'choice') requireThat(definition.options.includes(value), 'Historical choice not in source definition');
        if (definition.type === 'date') date(value);
        return { definition: definition.id, sourceId, name: definition.name, value };
    });
}
export function mergeHistorical(previous: Data | undefined, value: Data) {
    if (!previous) return value;
    if (value.lines) { value.lines = [...previous.lines, ...value.lines]; value.totalMinor = minor(value.lines.reduce((sum: number, line: Data) => sum + line.totalMinor, 0) + value.freightMinor + value.taxMinor); }
    if (value.allocations) { value.allocations = [...previous.allocations, ...value.allocations]; value.totalMinor = minor(value.allocations.reduce((sum: number, line: Data) => sum + line.amountMinor, 0)); }
    value.sourceRows = [...previous.sourceRows, ...value.sourceRows];
    return value;
}
export function historicalReport(values: Data[]) {
    const groups = new Map<string, Data>();
    for (const value of values.filter(v => v.lines || v.allocations)) {
        const kind = value.allocations ? 'invoice' : value.request ? 'order' : 'request';
        const period = (value.invoiceDate || value.needDate || '').slice(0, 7) || 'not-recorded';
        const supplier = value.supplier, key = canonicalJson([kind, supplier, period, value.currency]);
        const group = groups.get(key) ?? { kind, supplier, period, currency: value.currency, records: 0, lines: 0, totalMinor: 0 };
        group.records++; group.lines += (value.lines ?? value.allocations).length; group.totalMinor = minor(group.totalMinor + value.totalMinor); groups.set(key, group);
    }
    return { reconciliation: [...groups.values()], historicalDefinitions: values.filter(v => v.authority === 'inert-history').map(v => ({ sourceId: v.sourceId, name: v.name, recordKind: v.recordKind, scope: v.scope, type: v.type, options: v.options })), historicalRecords: values.filter(v => v.sourceRows).map(v => ({ id: v.id, sourceId: v.sourceId, headerFields: v.historicalFields ?? [], lines: (v.lines ?? v.allocations ?? []).map((line: Data) => ({ sourceLineId: line.sourceLineId, orderLine: line.line ?? null, fields: line.historicalFields ?? [] })), sourceRows: v.sourceRows })) };
}
export const historicalRowProof = (row: Data, position: number, col: Columns) => ({ row: position, sourceLineId: col(row, 'lineId'), payloadHash: sha256(canonicalJson(row)) });
