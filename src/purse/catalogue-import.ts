import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Bindings } from '../auth.server';
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index';
import { supplier } from './admin';
import { catalogueDate, catalogueItem } from './catalogue';
import { catalogueLists, requireCatalogueManagement } from './catalogue-access';
import { csv } from './import-mapping';
import { erasureDigest, pathValue } from './erasure-journal.mjs';
import { all, audit, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

const required = ['supplierId', 'sku', 'currency', 'description', 'unit', 'unitPrice', 'category', 'validFrom', 'validUntil'];
const optional = ['project', 'location', 'costCentre'];
const identity = (value: Data) => canonicalJson([value.supplier, value.partNumber, value.currency]);
function plan(s: State, a: Actor, b: Data) {
    requireCatalogueManagement(s, a);
    requireThat(typeof b.csv === 'string' && new TextEncoder().encode(b.csv).length <= 1000000, 'Choose a UTF-8 catalogue CSV of at most 1 MB');
    const rows = csv(b.csv.replace(/^\uFEFF/, ''));
    requireThat(rows.length > 0 && rows.length <= 500, 'Import 1–500 catalogue rows');
    const columns = Object.keys(rows[0]);
    requireThat(required.every(name => columns.includes(name)) && columns.every(name => [...required, ...optional].includes(name)), 'Use the documented catalogue columns only');
    const sourceHash = sha256(b.csv), erasures = all(s, 'erasureReceipt').flatMap(receipt => receipt.fields);
    const sourceEvents = new Set(all(s, 'audit').filter(event => event.action === 'catalogue-import' && event.sourceHash === sourceHash).map(event => event.id));
    requireThat(!erasures.some(field => field.kind === 'audit' && sourceEvents.has(field.id) && ['before', 'after'].includes(field.path[0])), 'Catalogue source contains erased personal data; supply a corrected file', 409);
    const existing = all(s, 'catalogue'), seen = new Set<string>(), today = catalogueDate();
    const changes = rows.map((input, index) => {
        // Identity cells stay exact: whitespace, case and currency are never aliases.
        for (const field of ['supplierId', 'sku', 'currency']) requireThat(input[field] === text(input[field], field, 200), 'Identity cells must have no surrounding whitespace');
        const vendor = supplier(s, input.supplierId);
        requireThat(['active', 'preferred'].includes(vendor.status), 'Choose an existing active supplier', 409);
        const key = identity({ supplier: vendor.id, partNumber: input.sku, currency: input.currency });
        requireThat(!seen.has(key), 'Duplicate supplier, SKU and currency in catalogue CSV'); seen.add(key);
        const matches = existing.filter(item => identity(item) === key);
        requireThat(matches.length <= 1, 'Ambiguous existing supplier, SKU and currency; resolve catalogue duplicates first', 409);
        const previous = matches[0];
        text(input.unit, 'Unit', 100);
        const payload: Data = { ...previous, ...input, supplier: vendor.id, partNumber: input.sku, unitAmount: input.unitPrice, approved: true };
        delete payload.unitMinor;
        const next: Data = { ...catalogueItem(s, payload), access: catalogueLists(previous?.access, 'Catalogue access', s) };
        requireThat(!previous || !erasures.some(field => field.kind === 'catalogue' && field.id === previous.id && erasureDigest(pathValue(next, field.path)) === field.before), 'Catalogue input would restore erased personal data; supply corrected terms', 409);
        requireThat(next.validFrom && next.validUntil, 'Provide both catalogue price validity dates');
        requireThat(next.validUntil >= today, 'Expired catalogue prices cannot be imported', 409);
        const before = previous ? Object.fromEntries(Object.keys(next).map(field => [field, previous[field]])) : null;
        return { row: index + 2, id: previous?.id ?? null, supplierName: vendor.name, before, next,
            availability: next.validFrom > today ? 'Future price' : 'Current price', changed: !before || canonicalJson(before) !== canonicalJson(next) };
    });
    const stateHash = sha256(canonicalJson([...s.entries()].map(([key, row]) => [key, row.revision]).sort((x,y) => String(x[0]).localeCompare(String(y[0])))));
    const fingerprint = sha256(canonicalJson({ sourceHash, stateHash, today, actor: a.id, version: a.version, session: a.session, changes }));
    return { sourceHash, fingerprint, rows: changes, changes: changes.filter(row => row.changed).length };
}
function token(env: Bindings, fingerprint: string) {
    requireThat(env.SESSION_SECRET, 'Native review signing is unavailable', 409);
    return createHmac('sha256', env.SESSION_SECRET).update('catalogue-import:' + fingerprint).digest('hex');
}
export function previewCatalogueImport(s: State, a: Actor, b: Data, env: Bindings) {
    const result = plan(s, a, b);
    return { ...result, review: token(env, result.fingerprint) };
}
export function catalogueImport(s: State, a: Actor, op: string, b: Data, env?: Bindings): Data | undefined {
    if (op !== 'catalogue-import-commit') return;
    const result = plan(s, a, b);
    requireThat(b.consent === true, 'Review and explicitly confirm catalogue prices');
    requireThat(env && b.fingerprint === result.fingerprint, 'Catalogue source or state changed; preview again', 409);
    const expected = token(env, result.fingerprint);
    requireThat(typeof b.review === 'string' && /^[a-f0-9]{64}$/.test(b.review) && timingSafeEqual(Buffer.from(expected), Buffer.from(b.review)), 'Preview this exact catalogue import before committing', 409);
    const items = [];
    for (const row of result.rows) {
        const id = row.id ?? uid(); items.push(id);
        if (!row.changed) continue;
        put(s, 'catalogue', id, row.next);
        audit(s, a, 'catalogue-import', id, { sourceHash: result.sourceHash, sourceRow: row.row, before: row.before, after: row.next });
    }
    return { changes: result.changes, sourceHash: result.sourceHash, items };
}
