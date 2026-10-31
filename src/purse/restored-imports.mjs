import { readPart, insist } from '@runeditrun/rer/modules/portability/storage';
import { checkPart } from '@runeditrun/rer/modules/portability/format';

// Completed imports retain verified archive parts, but Base removes their staging
// tables. Match the original job in those parts; ordinary live jobs confer no
// restore authority. Read each part once for all jobs needing a custody offer.
export async function restoredImports(db, jobs) {
    const wanted = new Map(jobs.map(job => [job.id, job])), found = new Map();
    if (!wanted.size) return found;
    const { results } = await db.prepare("SELECT id,metadata FROM rer_portability_jobs WHERE kind='import' AND phase='complete'").all();
    for (const restore of results) {
        const metadata = JSON.parse(restore.metadata);
        let remaining = metadata.manifest?.tables.find(table => table.name === 'ik_jobs')?.count ?? 0;
        if (!metadata.contentHash || !remaining) continue;
        const { results: receipts } = await db.prepare('SELECT idx,sha256 FROM rer_portability_parts WHERE job=? ORDER BY idx').bind(restore.id).all();
        for (const receipt of receipts) {
            const part = await readPart(db, restore.id, receipt.idx);
            await checkPart(part, receipt.idx);
            insist(part.sha256 === receipt.sha256, 'restore_part_checksum');
            for (const item of part.items) {
                if (item.kind !== 'row' || item.table !== 'ik_jobs') continue;
                remaining--;
                const row = item.row, job = wanted.get(row.id);
                if (job && row.principal_id === job.principalId && row.mapping_version === job.mappingVersion && row.fingerprint === job.fingerprint && row.destination === 'main' && row.namespace === 'procurify') {
                    found.set(job.id, { ...restore, part: receipt.idx, sha256: receipt.sha256 });
                    wanted.delete(job.id);
                }
            }
            if (!wanted.size) return found;
            // Archive rows are ordered by table; no later part can hold this
            // table once its declared rows have been read. Skip object payloads.
            if (!remaining) break;
        }
    }
    return found;
}


// Source definitions stay in a separate history kind, never native intake forms.
export function validateHistoricalImports(all, get, check) {
    for (const definition of all('importField')) {
        check(definition.imported === true && definition.status === 'imported' && definition.authority === 'inert-history', 'historical_field_authority');
        check(['request','order','invoice'].includes(definition.recordKind) && ['header','line'].includes(definition.scope) && ['text','choice','number','date','boolean'].includes(definition.type) && Array.isArray(definition.options), 'historical_field_definition');
    }
    const fields = (values, kind, scope) => {
        check(Array.isArray(values) && values.length <= 50, 'historical_field_values');
        check(new Set(values.map(value => value.definition)).size === values.length, 'historical_field_duplicate');
        for (const field of values) {
            const definition = get('importField', field.definition);
            check(definition.recordKind === kind && definition.scope === scope, 'historical_field_scope');
            check(definition.type === 'boolean' ? typeof field.value === 'boolean' : definition.type === 'number' ? typeof field.value === 'number' && Number.isFinite(field.value) : typeof field.value === 'string', 'historical_field_value');
        }
    };
    for (const kind of ['request','order','invoice']) for (const record of all(kind).filter(r => r.imported && r.sourceRows)) {
        check(record.imported === true && Array.isArray(record.sourceRows) && record.sourceRows.length > 0 && record.sourceRows.every(row => Number.isInteger(row.row) && row.row >= 2 && typeof row.sourceLineId === 'string' && /^[a-f0-9]{64}$/.test(row.payloadHash)), 'historical_rows');
        fields(record.historicalFields, kind, 'header');
        const lines = record.lines ?? record.allocations;
        check(Array.isArray(lines) && lines.length === record.sourceRows.length && new Set(lines.map(line => line.sourceLineId)).size === lines.length, 'historical_lines');
        for (const line of lines) fields(line.historicalFields, kind, 'line');
        if (kind === 'invoice') {
            const order = get('order', record.order);
            check(record.currency === order.currency && lines.every(line => order.lines.some(l => l.id === line.line)), 'historical_invoice_line');
            check(record.totalMinor === lines.reduce((sum, line) => sum + line.amountMinor, 0) && (!record.paymentApproval || record.sourceConfirmation === 'confirmed'), 'historical_invoice_authority');
        }
    }
}
