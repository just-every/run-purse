import { moneyInput } from './money';
import { extended, get, minor, quantity, requireThat, text, uid, type Data, type State } from './types';

export type RfqResponseLine = {
    id: string;
    sourceLine: string;
    description: string;
    unit: string;
    partNumber: string;
    quantity: string;
    q: number;
    unitMinor: number;
    totalMinor: number;
};

export type NormalizedRfqResponse = {
    lines: RfqResponseLine[];
    currency: string;
    freightMinor: number;
    taxMinor: number;
    totalMinor: number;
    leadTime: string;
    validity: string;
    conditions: string | null;
};

function record(value: unknown, label: string): asserts value is Data {
    requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
}

/** Normalize supplied prices only. Callers own questions, files and response authority. */
export function normalizeRfqResponse(state: State, request: Data, input: unknown): NormalizedRfqResponse {
    record(input, 'Supplier response');
    const currency = text(input.currency, 'Quote currency', 3);
    requireThat(/^[A-Z]{3}$/.test(currency) && get(state, 'business', 'main').currencies.includes(currency), 'Currency is not enabled for this business');
    requireThat(Array.isArray(request.lines) && request.lines.length >= 1 && request.lines.length <= 100, 'RFQ requires 1–100 request lines');
    const originals = new Map<string, Data>();
    for (const line of request.lines) {
        record(line, 'Request line');
        requireThat(typeof line.id === 'string' && line.id.length > 0 && !originals.has(line.id), 'Request line IDs must be present and unique');
        originals.set(line.id, line);
    }
    requireThat(Array.isArray(input.lines) && input.lines.length === originals.size, 'Respond to every request line exactly once');
    const used = new Set<string>();
    const lines = input.lines.map((line: unknown): RfqResponseLine => {
        record(line, 'Response line');
        requireThat(typeof line.requestLine === 'string' && originals.has(line.requestLine), 'Response line is outside this request');
        requireThat(!used.has(line.requestLine), 'Respond to every request line exactly once');
        used.add(line.requestLine);
        const source = originals.get(line.requestLine)!;
        const q = quantity(line.quantity);
        requireThat(line.description === source.description && line.unit === source.unit && line.partNumber === source.partNumber && q === quantity(source.quantity), 'Response item, unit, SKU and quantity must match the request');
        requireThat(Object.hasOwn(line, 'unitAmount'), 'Unit price requires an explicit amount');
        const unitMinor = moneyInput(line, 'unitAmount', 'unitMinor', 'Unit price');
        return { id: uid(), sourceLine: source.id, description: source.description, unit: source.unit,
            partNumber: source.partNumber, quantity: source.quantity, q, unitMinor, totalMinor: extended(q, unitMinor) };
    });
    requireThat(Object.hasOwn(input, 'freightAmount') && Object.hasOwn(input, 'taxAmount'), 'Freight and tax require explicit amounts, including zero');
    const freightMinor = moneyInput(input, 'freightAmount', 'freightMinor', 'Freight');
    const taxMinor = moneyInput(input, 'taxAmount', 'taxMinor', 'Supplied tax');
    const totalMinor = minor(lines.reduce((sum, line) => sum + line.totalMinor, 0) + freightMinor + taxMinor, 'Quote total');
    let conditions: string | null = null;
    if (input.conditions !== undefined && input.conditions !== null) {
        requireThat(typeof input.conditions === 'string', 'Conditions must be text');
        if (input.conditions.trim()) conditions = text(input.conditions, 'Conditions');
        else requireThat(input.conditions.length <= 2000, 'Conditions exceeds the supported length');
    }
    return { lines, currency, freightMinor, taxMinor, totalMinor,
        leadTime: text(input.leadTime, 'Lead time'), validity: text(input.validity, 'Validity'), conditions };
}
