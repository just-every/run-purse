import { supplier } from './admin';
import { catalogueAllows } from './catalogue-access';
import { currentPrice } from './catalogue';
import { recordScope } from './documents';
import { requests } from './requests';
import { all, audit, can, get, requireThat, type Actor, type Data, type State } from './types';

/** Review is read-only. Its fingerprint binds source bytes and current copy eligibility. */
export async function requestAgain(s: State, a: Actor, op: string, b: Data) {
    if (!['request-again-preview', 'request-again'].includes(op)) return;
    can(s, a, 'requester');
    requireThat(['request', 'order'].includes(b.kind), 'Choose a request or PO');
    const source = get(s, b.kind, b.id);
    recordScope(s, a, b.kind, source);
    const business = get(s, 'business', 'main'), flags: Data[] = [], changes: Data[] = [];
    let supplierId = source.supplier;
    try { supplier(s, supplierId); } catch { supplierId = ''; flags.push({ field: 'supplier', reason: 'Supplier is unavailable; choose an eligible supplier' }); }
    const draft: Data = {
        title: b.kind === 'order' ? (s.get('revision:' + source.request + ':' + source.revision)?.value.title ?? get(s, 'request', source.request).title) : source.title,
        supplier: supplierId, currency: source.currency, needDate: source.needDate,
        location: source.location, costCentre: source.costCentre, terms: source.terms,
        freightMinor: source.freightMinor, taxMinor: source.taxMinor, lines: []
    };
    for (const [field, list] of [['currency', 'currencies'], ['location', 'locations'], ['costCentre', 'costCentres']]) {
        if (!business[list].includes(draft[field])) { draft[field] = ''; flags.push({ field, reason: 'Value is no longer configured; choose a replacement' }); }
    }
    for (const original of source.lines) {
        const label = original.description, item = original.catalogue ? s.get('catalogue:' + original.catalogue)?.value : undefined;
        // Do not turn a now-inaccessible catalog line into a custom line.
        if (original.catalogue && (!item || !item.approved || !currentPrice(item) || !catalogueAllows(s, a, item) || item.supplier !== supplierId || item.currency !== draft.currency)) {
            flags.push({ field: 'line', label, reason: 'Catalog item is unavailable for this requester, supplier or currency; line left out' }); continue;
        }
        if (!supplierId || !business.projects.includes(original.project)) {
            flags.push({ field: 'line', label, reason: !supplierId ? 'Supplier unavailable; line left out' : 'Project is no longer configured; line left out' }); continue;
        }
        const unitMinor = item?.unitMinor ?? original.unitMinor;
        if (unitMinor !== original.unitMinor) changes.push({ label, beforeMinor: original.unitMinor, afterMinor: unitMinor });
        draft.lines.push({ description: original.description, quantity: original.quantity,
            unitMinor, category: original.category, project: original.project, catalogue: original.catalogue,
            partNumber: original.partNumber, unit: original.unit,
            shipTo: original.shipTo });
    }
    const files = all(s, 'attachment').filter(f => f.kind === b.kind && f.record === source.id && !f.privateSupplierDocument);
    const review = { draft, flags, changes, files: files.map(({ id, name, mediaType, size }) => ({ id, name, mediaType, size })) };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ actor: a.id, source: s.get(b.kind + ':' + source.id)?.revision, review, files: files.map(file => [file.id, s.get('attachment:' + file.id)?.revision]) })));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (op === 'request-again-preview') return { ...review, fingerprint };
    requireThat(b.fingerprint === fingerprint, 'Copy review changed; review current prices, access and source again', 409);
    const selected = b.attachments ?? [];
    requireThat(Array.isArray(selected) && new Set(selected).size === selected.length && selected.every(id => files.some(f => f.id === id)), 'Choose only attachments from this copy review');
    // Normal request validation supplies new IDs, current supplier identity and no historical authority.
    requireThat(b.draft && Array.isArray(b.draft.lines), 'Review the new draft lines');
    const copyLines = b.draft.lines.map(({ id, carriedAccepted, carriedCancelled, unitAmount, unitMinor, ...line }: Data) => line.catalogue
        ? { ...line, unitMinor: get(s, 'catalogue', line.catalogue).unitMinor }
        : { ...line, ...(unitAmount !== undefined ? { unitAmount } : { unitMinor }) });
    const created = requests(s, a, 'request', { ...b.draft, id: undefined, lines: copyLines });
    requireThat(created, 'Draft creation failed');
    for (const id of selected) {
        const file = files.find(f => f.id === id)!;
        requests(s, a, 'attachment', { kind: 'request', record: created.id, name: file.name, mediaType: file.mediaType, base64: file.base64 });
    }
    audit(s, a, 'request-again', created.id, { sourceKind: b.kind, source: source.id, sourceRevision: source.revision, attachments: selected, priceChanges: changes, exclusions: flags });
    return created;
}
