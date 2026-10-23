import type { Data } from './types';

const unitAliases: Record<string, string> = { ea: 'each', each: 'each', unit: 'each', units: 'each',
    kg: 'kg', kilogram: 'kg', kilograms: 'kg', g: 'g', gram: 'g', grams: 'g',
    l: 'litre', liter: 'litre', liters: 'litre', litre: 'litre', litres: 'litre',
    hr: 'hour', hrs: 'hour', hour: 'hour', hours: 'hour', kit: 'kit', kits: 'kit' };
export const normalizedQuoteUnit = (value: unknown) => typeof value === 'string' ? unitAliases[value.trim().toLowerCase()] ?? value.trim().toLowerCase() : null;
const cents = (value: unknown) => typeof value === 'string' && /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)
    ? Number(value.replaceAll(',', '')) * 100 : null;
const numericQuantity = (value: unknown) => typeof value === 'string' && /^\d+(?:\.\d{1,3})?$/.test(value) ? Number(value) : null;
const comparable = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : null;

/** The offer remains the offer. Document discrepancies are evidence, never silent corrections. */
export function normalizeAgentResponse(rfq: Data, response: Data, originals: Data[]): Data {
    const flags: Data[] = [], add = (code: string, detail: string, source?: Data) => flags.push({ code, detail, source: source ?? { response: response.id } });
    for (const field of ['currency', 'leadTime', 'validity', 'conditions']) if (!response[field]) add('missing', `${field} is missing`);
    for (const field of ['freightMinor', 'taxMinor']) if (!Number.isSafeInteger(response[field])) add('missing', `${field} is missing`);
    for (const requested of rfq.lines) {
        const line = response.lines.find((item: Data) => item.sourceLine === requested.id);
        if (!line) { add('missing-item', 'Requested item has no offer', { response: response.id, requestLine: requested.id }); continue; }
        if (line.description !== requested.description || line.q !== requested.q || line.partNumber !== requested.partNumber
            || normalizedQuoteUnit(line.unit) !== normalizedQuoteUnit(requested.unit)) add('nonconforming', 'Supplier item, quantity, unit or SKU differs from the requested specification', { response: response.id, requestLine: requested.id });
    }
    for (const original of originals) {
        const source = original.source;
        if (original.status !== 'read') { add('original-review', original.reason, source); continue; }
        const fields = original.fields;
        for (const field of ['currency', 'freightAmount', 'taxAmount', 'leadTime', 'validity']) {
            const fact = fields[field];
            if (fact.value === null) { add('document-missing', `Original does not state ${field}`, source); continue; }
            const expected = field === 'freightAmount' ? response.freightMinor : field === 'taxAmount' ? response.taxMinor : response[field];
            const actual = ['freightAmount', 'taxAmount'].includes(field) ? cents(fact.value) : comparable(fact.value);
            if (actual === null || (typeof expected === 'number' ? Math.abs(actual as number - expected) > .0001 : actual !== comparable(expected)))
                add('document-conflict', `Original ${field} differs from the submitted offer`, { ...source, ...fact.source });
        }
        if (!original.terms.length) add('document-missing', 'Original does not state terms or conditions', source);
        for (const terms of original.terms) if (comparable(terms.value) !== comparable(response.conditions)) add('document-conflict', 'Original terms differ from the submitted offer', { ...source, ...terms.source });
        if (!fields.lines.length) add('document-missing', 'Original has no recognized item rows', source);
        for (const requested of rfq.lines) {
            const candidates = fields.lines.filter((line: Data) => comparable(line.description.value) === comparable(requested.description));
            if (candidates.length !== 1) { add('nonconforming', 'Original does not identify the requested item uniquely', { ...source, requestLine: requested.id }); continue; }
            const item = candidates[0], offered = response.lines.find((line: Data) => line.sourceLine === requested.id);
            for (const field of ['description', 'quantity', 'unitAmount', 'unit']) if (item[field].value === null) add('document-missing', `Original item ${field} is missing`, { ...source, requestLine: requested.id });
            if (numericQuantity(item.quantity.value) !== numericQuantity(requested.quantity)
                || normalizedQuoteUnit(item.unit.value) !== normalizedQuoteUnit(requested.unit)) add('nonconforming', 'Original item quantity or unit differs from the specification', { ...source, requestLine: requested.id });
            const price = cents(item.unitAmount.value);
            if (price !== null && offered && Math.abs(price - offered.unitMinor) > .0001) add('document-conflict', 'Original unit price differs from submitted offer', { ...source, ...item.unitAmount.source });
        }
        if (fields.lines.length !== rfq.lines.length) add('nonconforming', 'Original item count differs from the specification', source);
    }
    if (!originals.length) add('missing-original', 'No supporting original was supplied');
    return { response: response.id, supplier: response.supplier, sequence: response.sequence, currency: response.currency,
        lines: response.lines.map((line: Data) => ({ ...line, normalizedUnit: normalizedQuoteUnit(line.unit),
            source: { response: response.id, requestLine: line.sourceLine } })),
        freightMinor: response.freightMinor, taxMinor: response.taxMinor, totalMinor: response.totalMinor,
        leadTime: response.leadTime, validity: response.validity, conditions: response.conditions,
        sources: [{ response: response.id }, ...originals.map(original => original.source)], originals, flags, eligible: flags.length === 0 };
}
export function recommendAgentAwards(comparison: Data[], history: Data[]): Data[] {
    return [...new Set(comparison.map(row => row.currency))].map(currency => {
        const candidates = comparison.filter(row => row.currency === currency && row.eligible).sort((a, b) => a.totalMinor - b.totalMinor || a.response.localeCompare(b.response));
        const baseline = history.filter(row => row.currency === currency).sort((a, b) => a.offerSequence - b.offerSequence)[0];
        const winner = candidates[0];
        return { currency, response: winner?.response ?? null, supplier: winner?.supplier ?? null,
            firstResponse: baseline?.id ?? null, reason: winner
                ? 'Lowest supplied total including freight and tax among complete, conforming latest responses in this currency. Buyer must assess commercial suitability and decide the award.'
                : 'No complete conforming response in this currency; buyer review is required. No award recommended.',
            binding: false };
    });
}
