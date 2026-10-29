import { supplierLineExposure, hasSupplierGroups, requireGroupable } from './po-supplier-groups';
import { allocateLineTax } from './po-line-tax';
import { splitValues } from './intake-fields';
import { buyerLimits, type BuyerLimit } from './access';
import { supplier } from './admin';
import { lapsedSupplierDocuments } from './supplier-documents';
import { normalizePurchaseCharges } from './purchase-charges';
import { extended, get, minor, quantity, requireThat, text, type Actor, type Data, type State } from './types';

export function conversionFace(record: Data) {
    return { supplier: record.supplier, supplierSnapshot: structuredClone(record.supplierSnapshot), lines: record.lines.map(({ sourceLine, ...line }: Data) => structuredClone(line)), charges: structuredClone(record.charges ?? [...(record.freightMinor ? [{id:'freight',kind:'freight',description:'Freight',amountMinor:record.freightMinor}] : []), ...(record.taxMinor ? [{id:'tax',kind:'tax',description:'Supplied tax',amountMinor:record.taxMinor}] : [])]), freightMinor: record.freightMinor, taxMinor: record.taxMinor, otherChargesMinor: record.otherChargesMinor ?? 0, totalMinor: record.totalMinor };
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
function covers(limit: BuyerLimit, request: Data, face: Data) {
    const sourceTotals=supplierLineExposure(request),editedTotals=supplierLineExposure(face);
    return limit.unlimited || price(request.totalMinor, face.totalMinor, limit) && request.lines.every((before: Data, index: number) => {
        const after = face.lines[index];
        return after?.id === before.id && price(before.unitMinor, after.unitMinor, limit) && price(before.totalMinor, after.totalMinor, limit) && price(sourceTotals[index], editedTotals[index], limit) && percentage(before.q, after.q, limit.quantityPercent);
    });
}
export function currentConversionLimit(s: State, a: Actor, request: Data, face: Data) {
    const limit = buyerLimits(s, a, request).find(limit => covers(limit, request, face));
    requireThat(limit, 'Conversion exceeds your current buyer variance limit; amend the request and renew approval', 409);
    return structuredClone(limit);
}
export function conversionEdits(s: State, a: Actor, request: Data, input: unknown) {
    if (input === undefined) return;
    requireThat(input && typeof input === 'object' && !Array.isArray(input), 'Conversion edits must be an object');
    const edits = input as Data;
    requireThat(Object.keys(edits).every(field => ['lines', 'supplier', 'charges', 'freightMinor', 'taxMinor', 'reason'].includes(field)) && Array.isArray(edits.lines) && edits.lines.length <= request.lines.length, 'Provide edits for existing approved lines only');
    const byId = new Map<string, Data>();
    for (const edit of edits.lines) {
        requireThat(edit && typeof edit === 'object' && !Array.isArray(edit) && Object.keys(edit).every(field => ['id', 'unitMinor', 'quantity', 'unit', 'partNumber', 'supplier'].includes(field)), 'Only approved line prices, quantities, labels and supplier can change at conversion');
        requireThat(typeof edit.id === 'string' && !byId.has(edit.id) && request.lines.some((line: Data) => line.id === edit.id), 'Conversion line is duplicate or outside the approved request');
        requireThat(['unitMinor','quantity','unit','partNumber','supplier'].some(field=>Object.hasOwn(edit,field)), 'Provide a conversion price, quantity, unit, SKU or supplier');
        byId.set(edit.id, edit);
    }
    const before = conversionFace(request), after = conversionFace(request);
    const destinations = new Set(request.lines.map((line: Data) => byId.get(line.id)?.supplier ?? edits.supplier ?? line.supplier ?? request.supplier));
    const destination = destinations.size === 1 ? [...destinations][0] as string : request.supplier;
    const snapshot = (id: string) => {
        const counterparty = supplier(s,id);
        requireThat(!lapsedSupplierDocuments(s,id).length, 'Required supplier document has lapsed; refresh and review it before a new PO',409);
        return { id: counterparty.id, name: counterparty.name, address: counterparty.address || '', remitTo: counterparty.remitTo || '', postalState: counterparty.postalState || '', contacts: structuredClone(counterparty.contacts), contractRef: counterparty.contractRef };
    };
    for (const id of destinations) snapshot(id as string);
    if (destination !== request.supplier) { after.supplier = destination; after.supplierSnapshot = snapshot(destination); }
    after.lines = after.lines.map((line: Data) => {
        const edit = byId.get(line.id); if (!edit) return line;
        requireThat(!line.service, 'Service value and milestone edits require amendment and renewed approval', 409);
        const unitMinor = Object.hasOwn(edit, 'unitMinor') ? minor(edit.unitMinor, 'Conversion unit price') : line.unitMinor;
        const q = Object.hasOwn(edit, 'quantity') ? quantity(edit.quantity) : line.q;
        requireThat(q >= (line.carriedAccepted ?? 0) + (line.carriedCancelled ?? 0), 'Conversion cannot remove received or cancelled quantities', 409);
        return { ...line, ...(Object.hasOwn(edit,'unit')?{unit:text(edit.unit,'Conversion unit of measure',200)}:{}), ...(Object.hasOwn(edit,'partNumber')?{partNumber:text(edit.partNumber,'Conversion SKU',200)}:{}), quantity: q === line.q ? line.quantity : edit.quantity, q, unitMinor, totalMinor: extended(q, unitMinor), ...(line.allocations ? {allocations: splitValues(s,line.allocations,extended(q,unitMinor))} : {}) };
    });
    after.lines=after.lines.map((line:Data)=>{
        const id=byId.get(line.id)?.supplier ?? edits.supplier ?? line.supplier ?? request.supplier;
        if(destinations.size>1 || line.supplier || id!==request.supplier) return {...line,supplier:id,supplierSnapshot:id===(request.lines.find((source:Data)=>source.id===line.id)?.supplier ?? request.supplier) ? structuredClone(request.lines.find((source:Data)=>source.id===line.id)?.supplierSnapshot ?? request.supplierSnapshot) : snapshot(id)};
        return line;
    });
    if(hasSupplierGroups(after))requireGroupable(s,request);
    if (['charges','freightMinor','taxMinor'].some(field => Object.hasOwn(edits,field))) Object.assign(after, normalizePurchaseCharges(edits,request));
    if(after.taxMinor!==before.taxMinor){for(const line of after.lines)line.lineTaxMinor=null;allocateLineTax(after.lines,after.taxMinor);}
    after.totalMinor = minor(after.lines.reduce((total: number, line: Data) => total + line.totalMinor, 0) + after.freightMinor + after.taxMinor + after.otherChargesMinor, 'Conversion total');
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const limits = buyerLimits(s,a,request), fitting = limits.find(limit => covers(limit,request,after));
    requireThat(limits.length, 'Current buyer authority required',403);
    const priceIncrease = after.totalMinor > before.totalMinor || after.lines.some((line:Data,index:number)=>line.unitMinor>before.lines[index].unitMinor || line.totalMinor>before.lines[index].totalMinor);
    requireThat(!priceIncrease || limits.some(limit => limit.unlimited || (limit.absoluteMinor ?? 0)>0 || (limit.percent ?? 0)>0), 'Your buyer price variance limit is zero; price increases are refused',409);
    const limit = structuredClone(fitting ?? limits[0]);
    return { face: after, variance: { before, after, limit, withinLimit: Boolean(fitting), actor: a.id, email: a.email, at: new Date().toISOString(), reason: text(edits.reason, 'Conversion edit reason'), sourceRevision: request.revision, sourceRequest: request.id } };
}
export function requireConversionSource(s: State, a: Actor, request: Data, order: Data) {
    const variance = order.conversionVariance;
    const source = get(s,'revision',request.id+':'+variance.sourceRevision);
    const face=(record:Data)=>{
        const snapshot=conversionFace(record);
        return Object.hasOwn(variance.before,'supplier')?snapshot:{lines:snapshot.lines,freightMinor:snapshot.freightMinor,taxMinor:snapshot.taxMinor,totalMinor:snapshot.totalMinor};
    };
    const withoutDates=(value:Data)=>({...value,lines:value.lines.map(({needDate,...line}:Data)=>line)});
    requireThat(variance.sourceRequest === request.id && variance.sourceRevision <= request.revision && JSON.stringify(variance.before) === JSON.stringify(face(source)) && JSON.stringify(variance.after) === JSON.stringify(face(order.supplierGroup ? request : order)) && JSON.stringify(withoutDates(variance.after)) === JSON.stringify(withoutDates(face(request))), 'Conversion source changed; amend and renew approval', 409);
    if (variance.approvalRenewed) return undefined;
    return currentConversionLimit(s, a, source, conversionFace(order.supplierGroup ? request : order));
}
