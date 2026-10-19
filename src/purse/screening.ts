import { requireThat, type Data } from './types';

// Commerce's public CSL consolidates OFAC's SDN names, aliases and addresses.
// Use one authoritative transport, without substituting an empty list on failure.
const sourceUrl = 'https://data.trade.gov/downloadable_consolidated_screening_list/v1/consolidated.csv';
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (value: string) => normalize(value).split(' ').filter(Boolean).sort();
function similar(left: string, right: string) {
    const a = words(left), b = words(right);
    if (a.join(' ') === b.join(' ')) return true;
    return a.length >= 2 && b.length >= 2 && (a.every(w => b.includes(w)) || b.every(w => a.includes(w)));
}

// Yield one CSV row at a time: the full CSL includes other agencies and long
// remarks, which must not all become retained Worker objects during a screen.
function* csvRows(raw: string): Generator<string[]> {
    let row: string[] = [], field = '', state: 'plain' | 'quoted' | 'closed' = 'plain';
    for (let i = 0; i <= raw.length; i++) {
        const c = raw[i];
        if (state === 'quoted') {
            requireThat(c !== undefined, 'OFAC source contains an unclosed CSV quote', 503);
            if (c !== '"') field += c;
            else if (raw[i + 1] === '"') { field += '"'; i++; }
            else state = 'closed';
        } else if (c === ',' || c === '\r' || c === '\n' || c === undefined) {
            row.push(field); field = ''; state = 'plain';
            if (c !== ',') { if (row.some(Boolean)) yield row; row = []; if (c === '\r' && raw[i + 1] === '\n') i++; }
        } else {
            requireThat(state !== 'closed', 'OFAC source contains invalid CSV quoting', 503);
            if (c === '"') { requireThat(!field, 'OFAC source contains invalid CSV quoting', 503); state = 'quoted'; }
            else field += c;
        }
    }
}
export async function screenSupplier(name: string, address: string) {
    let response: Response;
    try { response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('OFAC source unavailable; supplier was not saved'); }
    requireThat(response.ok, 'OFAC source unavailable; supplier was not saved', 503);
    const raw = await response.text(), sourceDate = response.headers.get('last-modified');
    requireThat(raw.trim() && sourceDate && Number.isFinite(Date.parse(sourceDate)), 'OFAC source has no dated content; supplier was not saved', 503);
    const rows = csvRows(raw); const headers: string[] | undefined = rows.next().value;
    requireThat(headers && new Set(headers).size === headers.length && ['source', 'entity_number', 'name', 'alt_names', 'addresses', 'programs', 'source_list_url'].every(k => headers.includes(k)), 'OFAC source format changed; supplier was not saved', 503);
    const matches: Data[] = []; let entries = 0;
    for (const fields of rows) {
        requireThat(fields.length === headers.length, 'OFAC source column count changed; supplier was not saved', 503);
        const row = Object.fromEntries(headers.map((key, i) => [key, fields[i]]));
        if (row.source !== 'Specially Designated Nationals (SDN) - Treasury Department') continue;
        requireThat(/^\d+$/.test(row.entity_number) && row.name.trim(), 'OFAC source entry changed; supplier was not saved', 503);
        entries++;
        const names = [row.name, ...row.alt_names.split(';')].filter(n => n.trim() && similar(name, n));
        const addresses = address && normalize(address).length >= 8 ? row.addresses.split(';').filter(a => normalize(a) === normalize(address)) : [];
        if (names.length || addresses.length) matches.push({ id: row.entity_number, name: row.name, program: row.programs, names, addresses, basis: [names.length ? 'name' : '', addresses.length ? 'address' : ''].filter(Boolean), listUrl: row.source_list_url });
    }
    requireThat(entries > 0, 'OFAC source contains no SDN entries; supplier was not saved', 503);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    return { id: crypto.randomUUID(), name, address, at: new Date().toISOString(), status: matches.length ? 'pending_review' : 'clear', matches,
        sources: [{ file: 'Commerce CSL / OFAC SDN', url: sourceUrl, sourceDate, sha256, entries }] };
}
