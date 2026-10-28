import { currency, supplier } from './admin';
import { catalogueLists } from './catalogue-access';
import { moneyInput } from './money';
import { all, audit, can, date, get, put, quantity, requireThat, text, uid, type Actor, type Data, type State } from './types';

export function stringList(value: unknown, label: string): string[] {
    requireThat(value === undefined || Array.isArray(value), label + ' must be a list');
    const values = (value ?? []) as unknown[];
    requireThat(values.length <= 100, label + ' allows at most 100 values');
    const result = values.map(v => text(v, label, 200));
    requireThat(new Set(result).size === result.length, label + ' contains duplicates');
    return result;
}
export const catalogueDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
export function currentPrice(item: Data) {
    const today = catalogueDate();
    return (!item.validFrom || item.validFrom <= today) && (!item.validUntil || item.validUntil >= today);
}
export function catalogueItem(s: State, b: Data): Data {
    supplier(s, b.supplier); currency(s, b.currency);
    const business = get(s, 'business', 'main');
    const defaults: Data = {};
    for (const [field, list] of [['project', 'projects'], ['location', 'locations'], ['costCentre', 'costCentres']]) {
        defaults[field] = b[field] ? text(b[field], field) : '';
        requireThat(!defaults[field] || business[list].includes(defaults[field]), 'Use configured ' + field);
    }
    const validFrom = b.validFrom ? date(b.validFrom, 'Price valid from') : null;
    const validUntil = b.validUntil ? date(b.validUntil, 'Price valid until') : null;
    requireThat(!validFrom || !validUntil || validFrom <= validUntil, 'Price validity dates are reversed');
    const record = { description: text(b.description, 'Description'), supplier: b.supplier, currency: b.currency,
        unitMinor: moneyInput(b, 'unitAmount', 'unitMinor', 'Reference price'), category: text(b.category, 'Category'),
        approved: b.approved === true, partNumber: b.partNumber ? text(b.partNumber, 'Part number', 200) : '',
        unit: b.unit ? text(b.unit, 'Unit', 100) : 'each', validFrom, validUntil, ...defaults,
        requiredAttachments: stringList(b.requiredAttachments, 'Required attachment filenames') };
    return record;
}
export function catalogue(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'catalogue' && op !== 'catalogue-bundle') return;
    can(s, a, 'buyer');
    const kind = op === 'catalogue' ? 'catalogue' : 'catalogueBundle';
    const id = b.id ?? uid();
    const previous = b.id ? get(s, kind, id) : undefined;
    let record: Data;
    if (kind === 'catalogue') {
        record = catalogueItem(s, b);
    } else {
        requireThat(Array.isArray(b.items) && b.items.length > 0 && b.items.length <= 100, 'Provide 1–100 bundle items');
        const items = b.items.map((input: Data) => {
            const item = get(s, 'catalogue', input.catalogue);
            quantity(input.quantity);
            return { catalogue: item.id, quantity: input.quantity };
        });
        requireThat(new Set(items.map((i: Data) => i.catalogue)).size === items.length, 'Bundle contains duplicate items');
        record = { name: text(b.name, 'Bundle name'), approved: b.approved === true, items };
    }
    record.access = catalogueLists(b.access ?? previous?.access, 'Catalogue access', s);
    put(s, kind, id, record); audit(s, a, op, id);
    return get(s, kind, id);
}

export function requiredCatalogueFiles(s: State, r: Data) {
    const files = new Set(all(s, 'attachment').filter(f => f.kind === 'request' && f.record === r.id).map(f => f.name));
    const required = new Set(r.lines.flatMap((l: Data) => l.requiredAttachments ?? []));
    for (const name of required) requireThat(files.has(name), 'Required catalogue attachment missing: ' + name, 409);
}
