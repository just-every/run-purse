import { createHash } from 'node:crypto';
import { decryptProtected, protectedFields, protectedRows, type ProtectedField, type ProtectedPayload } from './protected-crypto';
import { privateText } from './protected-controls';
import { all, get, put, requireThat, type Data, type State } from './types';
import type { Bindings } from '../auth.server';

type SupplierSnapshot = { id: string; identity: string; matching: Data };
type ArchiveValue = { supplier: string; field: ProtectedField; payload: ProtectedPayload };
export type ProtectedSection = { business: string; matchingKey: string; suppliers: SupplierSnapshot[]; values: ArchiveValue[]; erasure?:string };
const canonical = (value: any): string => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}' : JSON.stringify(value);
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
function identity(supplier: Data) { const { matching, matchingNotRestored, ...ordinary } = supplier; return digest(ordinary); }
function exact(value: any, keys: string[]) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
export async function collectProtectedSection(env: Bindings, state: State): Promise<ProtectedSection> {
    const matchingKey = state.get('supplierMatchingKey:main')?.value.secret;
    requireThat(typeof matchingKey === 'string' && /^[a-f0-9]{64}$/.test(matchingKey), 'Matching key unavailable; restore the owner include archive or re-enter matching data', 503);
    const suppliers = all(state, 'supplier').map(supplier => ({ id: supplier.id, identity: identity(supplier), matching: supplier.matching ?? {} }));
    const values = (await protectedRows(env)).map(row => ({ supplier: row.supplier, field: row.field, payload: decryptProtected(env, row) }));
    return { business: digest(get(state, 'business', 'main')), matchingKey, suppliers, values, erasure:digest(all(state,'erasureReceipt').map(r=>r.id).sort()) };
}
/** Validate the entire authenticated section against the separately restored ordinary archive.
 * This never accepts auth rows, credential digests, Worker keys or grants.
 */
export function restoreProtectedSection(state: State, input: unknown): ArchiveValue[] {
    requireThat(exact(input, ['business', 'matchingKey', 'suppliers', 'values']) || exact(input, ['business', 'matchingKey', 'suppliers', 'values','erasure']), 'Protected archive contents invalid');
    const section = input as ProtectedSection;
    const erasures=all(state,'erasureReceipt').map(r=>r.id).sort();
    requireThat(section.erasure===digest(erasures)||(!erasures.length&&section.erasure===undefined),'Protected archive predates personal-data erasure; use its matching post-erasure include',409);
    requireThat(section.business === digest(get(state, 'business', 'main')), 'Restore the matching ordinary archive first', 409);
    requireThat(typeof section.matchingKey === 'string' && /^[a-f0-9]{64}$/.test(section.matchingKey), 'Protected archive contents invalid');
    requireThat(Array.isArray(section.suppliers) && Array.isArray(section.values), 'Protected archive contents invalid');
    const current = all(state, 'supplier'), ids = new Set<string>();
    requireThat(section.suppliers.length === current.length, 'Supplier history differs from the ordinary archive', 409);
    for (const supplier of section.suppliers) {
        requireThat(exact(supplier, ['id', 'identity', 'matching']) && typeof supplier.id === 'string' && !ids.has(supplier.id), 'Protected archive supplier invalid');
        ids.add(supplier.id);
        const row = current.find(row => row.id === supplier.id);
        requireThat(row && supplier.identity === identity(row), 'Supplier history differs from the ordinary archive', 409);
        requireThat(supplier.matching && typeof supplier.matching === 'object' && !Array.isArray(supplier.matching) && Object.entries(supplier.matching).every(([field, value]) => ['tin', 'bank'].includes(field) && typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)), 'Protected archive matching invalid');
    }
    const fields = new Set<string>();
    for (const value of section.values) {
        requireThat(exact(value, ['supplier', 'field', 'payload']) && ids.has(value.supplier) && protectedFields.includes(value.field) && !fields.has(value.supplier + ':' + value.field), 'Protected archive field invalid');
        fields.add(value.supplier + ':' + value.field);
        requireThat(exact(value.payload, ['value', 'reason', 'evidence']) && typeof value.payload.value === 'string' && (value.field === 'bankAccount' ? /^\d{4,17}$/ : /^\d{9}$/).test(value.payload.value) && privateText(value.payload.reason) && privateText(value.payload.evidence), 'Protected archive field invalid');
        requireThat(get(state, 'supplier', value.supplier).protectedOnFile?.[value.field] === true, 'Protected archive field differs from supplier history', 409);
    }
    // All changes remain in memory until the owner/revision/proof-fenced transaction.
    put(state, 'supplierMatchingKey', 'main', { secret: section.matchingKey });
    for (const snapshot of section.suppliers) {
        const supplier = get(state, 'supplier', snapshot.id);
        const {matchingNotRestored,...restored}=supplier;
        put(state, 'supplier', snapshot.id, { ...restored, matching: snapshot.matching });
    }
    return section.values;
}
