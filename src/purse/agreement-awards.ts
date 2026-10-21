import { canonicalSupplier } from './supplier-identity';
import { all, audit, can, extended, get, minor, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

/** Buyer maps an owner-confirmed price schedule to one native purchasing revision. */
export function agreementAwards(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'agreement-award') return;
    can(s, a, 'buyer');
    const request = get(s, 'request', b.request), agreement = get(s, 'agreement', b.agreement);
    requireThat(!request.imported && request.status === 'draft' && request.revision === b.revision, 'Award the current native draft before submission', 409);
    requireThat(!['quoteAward', 'agreementAward'].some(kind => all(s, kind).some(row => row.request === request.id && row.revision === request.revision)), 'This revision already has an immutable award', 409);
    requireThat(Number.isSafeInteger(b.agreementVersion) && b.agreementVersion > 0, 'Choose an exact confirmed agreement version');
    const source = agreement.history.find((h: Data) => h.version === b.agreementVersion);
    requireThat(source && source.confirmedBy, 'Confirmed agreement version not found', 409);
    requireThat(canonicalSupplier(s, source.supplier) === canonicalSupplier(s, request.supplier) && source.currency === request.currency, 'Agreement supplier family and currency must match the request');
    requireThat(source.firstOfferMinor != null && source.valueMinor != null && source.firstOfferSource?.trim() && source.awardSource?.trim(), 'Owner-confirmed first-offer and awarded price sources and totals are required');
    requireThat(Array.isArray(source.priceLines) && source.priceLines.length === request.lines.length, 'Confirmed agreement price schedule must cover every request line');
    requireThat(Array.isArray(b.lines) && b.lines.length === request.lines.length && new Set(b.lines.map((l: Data) => l.requestLine)).size === request.lines.length && new Set(b.lines.map((l: Data) => l.agreementLine)).size === source.priceLines.length, 'Map every request and agreement price line exactly once');
    const lines = b.lines.map((mapping: Data) => {
        const line = request.lines.find((l: Data) => l.id === mapping.requestLine);
        requireThat(line, 'Mapped line must belong to this exact request revision');
        const firstUnitMinor = minor(mapping.firstUnitMinor, 'First offered unit price'), awardedUnitMinor = minor(mapping.awardedUnitMinor, 'Awarded unit price');
        const price = Number.isSafeInteger(mapping.agreementLine) && mapping.agreementLine >= 0 ? source.priceLines[mapping.agreementLine] : null;
        requireThat(price && price.q === line.q && price.description === line.description && price.unit === line.unit && (price.partNumber ?? '') === (line.partNumber ?? '') && price.firstUnitMinor === firstUnitMinor && price.awardedUnitMinor === awardedUnitMinor && line.unitMinor === awardedUnitMinor, 'Mapped item, unit, SKU, quantity and prices must match the confirmed agreement schedule and request');
        return { agreementLine: mapping.agreementLine, requestLine: line.id, description: line.description, q: line.q, unit: line.unit, partNumber: line.partNumber, firstUnitMinor, awardedUnitMinor };
    });
    const sum = (field: string) => lines.reduce((total: number, line: Data) => total + extended(line.q, line[field]), 0);
    requireThat(sum('firstUnitMinor') === source.firstOfferMinor && sum('awardedUnitMinor') === source.valueMinor, 'Map the complete confirmed agreement first-offer and awarded totals; partial agreement values cannot count');
    const id = uid(), result = { id, agreement: agreement.id, agreementVersion: source.version, reading: source.reading ?? null,
        firstOfferSource: source.firstOfferSource, awardSource: source.awardSource, request: request.id, revision: request.revision,
        supplier: request.supplier, currency: request.currency, lines, reason: text(b.reason, 'Award reason'), actor: a.id, at: new Date().toISOString() };
    put(s, 'agreementAward', id, result);
    audit(s, a, op, request.id, { award: id, agreement: agreement.id, agreementVersion: source.version, revision: request.revision, reason: result.reason });
    return result;
}
