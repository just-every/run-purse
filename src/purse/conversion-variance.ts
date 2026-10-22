import { allocateLineTax } from './po-line-tax';
import { splitValues } from './intake-fields';
import { buyerLimits, type BuyerLimit } from './access';
import { extended, minor, quantity, requireThat, text, type Actor, type Data, type State } from './types';

export function conversionFace(record: Data) {
    return { lines: record.lines.map(({ sourceLine, ...line }: Data) => structuredClone(line)), freightMinor: record.freightMinor, taxMinor: record.taxMinor, totalMinor: record.totalMinor };
}
function percentage(before: number, after: number, limit = 0) {
    if (after <= before) return true;
    if (!Number.isFinite(limit) || limit < 0) return false;
    const [coefficient, exponent = '0'] = String(limit).split('e'), [whole, fraction = ''] = coefficient.split('.');
    const power = Number(exponent) - fraction.length;
    const numerator = BigInt(whole + fraction) * (power > 0 ? 10n ** BigInt(power) : 1n), denominator = power < 0 ? 10n ** BigInt(-power) : 1n;
    return BigInt(after - before) * 100n * denominator <= BigInt(before) * numerator;
}
function price(before: number, after: number, limit: BuyerLimit) {
    return after <= before || (limit.absoluteMinor !== undefined || limit.percent !== undefined)
        && (limit.absoluteMinor === undefined || after - before <= limit.absoluteMinor)
        && (limit.percent === undefined || percentage(before, after, limit.percent));
}
/** A single scoped grant must cover the whole edit; grants never lend each other limits. */
export function currentConversionLimit(s: State, a: Actor, request: Data, face: Data) {
    const limit = buyerLimits(s, a, request).find(limit => limit.unlimited ||
        price(request.totalMinor, face.totalMinor, limit) && request.lines.every((before: Data, index: number) => {
            const after = face.lines[index];
            return after?.id === before.id && price(before.unitMinor, after.unitMinor, limit) && price(before.totalMinor, after.totalMinor, limit) && percentage(before.q, after.q, limit.quantityPercent);
        }));
    requireThat(limit, 'Conversion exceeds your current buyer variance limit; amend the request and renew approval', 409);
    return structuredClone(limit);
}
export function conversionEdits(s: State, a: Actor, request: Data, input: unknown) {
    if (input === undefined) return;
    requireThat(input && typeof input === 'object' && !Array.isArray(input), 'Conversion edits must be an object');
    const edits = input as Data;
    requireThat(Object.keys(edits).every(field => ['lines', 'freightMinor', 'taxMinor', 'reason'].includes(field)) && Array.isArray(edits.lines) && edits.lines.length <= request.lines.length, 'Provide edits for existing approved lines only');
    const byId = new Map<string, Data>();
    for (const edit of edits.lines) {
        requireThat(edit && typeof edit === 'object' && !Array.isArray(edit) && Object.keys(edit).every(field => ['id', 'unitMinor', 'quantity', 'unit', 'partNumber'].includes(field)), 'Only approved line prices and quantities can change at conversion');
        requireThat(typeof edit.id === 'string' && !byId.has(edit.id) && request.lines.some((line: Data) => line.id === edit.id), 'Conversion line is duplicate or outside the approved request');
        requireThat(['unitMinor','quantity','unit','partNumber'].some(field=>Object.hasOwn(edit,field)), 'Provide a conversion price, quantity, unit or SKU');
        byId.set(edit.id, edit);
    }
    const before = conversionFace(request), after = conversionFace(request);
    after.lines = after.lines.map((line: Data) => {
        const edit = byId.get(line.id); if (!edit) return line;
        requireThat(!line.service, 'Service value and milestone edits require amendment and renewed approval', 409);
        const unitMinor = Object.hasOwn(edit, 'unitMinor') ? minor(edit.unitMinor, 'Conversion unit price') : line.unitMinor;
        const q = Object.hasOwn(edit, 'quantity') ? quantity(edit.quantity) : line.q;
        requireThat(q >= (line.carriedAccepted ?? 0) + (line.carriedCancelled ?? 0), 'Conversion cannot remove received or cancelled quantities', 409);
        return { ...line, ...(Object.hasOwn(edit,'unit')?{unit:text(edit.unit,'Conversion unit of measure',200)}:{}), ...(Object.hasOwn(edit,'partNumber')?{partNumber:text(edit.partNumber,'Conversion SKU',200)}:{}), quantity: q === line.q ? line.quantity : edit.quantity, q, unitMinor, totalMinor: extended(q, unitMinor), ...(line.allocations ? {allocations: splitValues(s,line.allocations,extended(q,unitMinor))} : {}) };
    });
    for(const field of ['freightMinor','taxMinor'] as const)if(Object.hasOwn(edits,field))after[field]=minor(edits[field],field);
    if(after.taxMinor!==before.taxMinor){for(const line of after.lines)line.lineTaxMinor=null;allocateLineTax(after.lines,after.taxMinor);}
    after.totalMinor = minor(after.lines.reduce((total: number, line: Data) => total + line.totalMinor, 0) + after.freightMinor + after.taxMinor, 'Conversion total');
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const limit = currentConversionLimit(s, a, request, after);
    return { face: after, variance: { before, after, limit, actor: a.id, email: a.email, at: new Date().toISOString(), reason: text(edits.reason, 'Conversion edit reason'), sourceRevision: request.revision, sourceRequest: request.id } };
}
export function requireConversionSource(s: State, a: Actor, request: Data, order: Data) {
    const variance = order.conversionVariance;
    requireThat(variance.sourceRequest === request.id && variance.sourceRevision === request.revision && JSON.stringify(variance.before) === JSON.stringify(conversionFace(request)) && JSON.stringify(variance.after) === JSON.stringify(conversionFace(order)), 'Conversion source changed; amend and renew approval', 409);
    return currentConversionLimit(s, a, request, conversionFace(order));
}
