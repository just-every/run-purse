import { all, get, requireThat, type Data, type State } from './types';
export function apportionSupplied(amount: number, weights: number[]) {
    const sum=weights.reduce((total,weight)=>total+BigInt(weight),0n),denominator=sum||BigInt(weights.length);
    const parts=weights.map((weight,index)=>{const numerator=BigInt(amount)*(sum?BigInt(weight):1n);return {index,value:Number(numerator / denominator),remainder:numerator%denominator};});
    let left=amount-parts.reduce((total,part)=>total+part.value,0);
    for(const part of [...parts].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)){if(!left)break;part.value++;left--;}
    const values=parts.map(part=>part.value);
    return values;
}

export const hasSupplierGroups = (request: Data) => new Set(request.lines.map((line: Data) => line.supplier ?? request.supplier)).size > 1;

/** Stable source-line order and first-allocation remainder cents keep supplied
 * charges exact. No group invents a tax rate or changes the approved currency. */
function supplierChargeParts(request: Data) {
    const charges: Data[] = request.charges ?? [
        ...(request.freightMinor ? [{ id: 'freight', kind: 'freight', description: 'Freight', amountMinor: request.freightMinor }] : []),
        ...(request.taxMinor ? [{ id: 'tax', kind: 'tax', description: 'Supplied tax', amountMinor: request.taxMinor }] : []),
    ];
    const remainingTax=request.lines.map((line:Data)=>line.lineTaxMinor??0);
    const apportioned = charges.map(charge => {
        const values=apportionSupplied(charge.amountMinor,charge.kind==='tax'?remainingTax:request.lines.map((line:Data)=>line.totalMinor));
        if(charge.kind==='tax')values.forEach((value,index)=>{remainingTax[index]-=value;});
        return values;
    });
    return {charges,apportioned};
}
export function supplierLineExposure(request: Data): number[] {
    const frozen=request.supplierGroup?.lineExposure;
    if(frozen?.length===request.lines.length && request.lines.every((line:Data,index:number)=>frozen[index].line===line.id&&frozen[index].baseMinor===line.totalMinor))return frozen.map((line:Data)=>line.amountMinor);
    const {apportioned}=supplierChargeParts(request);
    return request.lines.map((line:Data,index:number)=>line.totalMinor+apportioned.reduce((sum,parts)=>sum+parts[index],0));
}
export function supplierLineRemaining(order: Data,line: Data,outstanding: number) {
    const exposure=order.supplierGroup.lineExposure.find((source:Data)=>source.line===line.id).amountMinor;
    return Number((BigInt(exposure)*BigInt(Math.max(0,outstanding))+BigInt(line.q)/2n)/BigInt(line.q));
}
export function supplierGroupFaces(request: Data): Data[] {
    const ids = [...new Set<string>(request.lines.map((line: Data) => line.supplier ?? request.supplier))];
    if (ids.length < 2) return [request];
    const {charges,apportioned}=supplierChargeParts(request);
    const exposure=supplierLineExposure(request);
    return ids.map((supplier, index) => {
        const selected = request.lines.map((line: Data, at: number) => ({line, at})).filter(({line}: Data) => (line.supplier ?? request.supplier) === supplier);
        const lines = selected.map(({line}: Data) => structuredClone(line));
        const groupCharges: Data[] = charges.map((charge, ci) => ({ ...charge, amountMinor: selected.reduce((sum: number, {at}: Data) => sum + apportioned[ci][at], 0) }));
        const sum = (kind: string) => groupCharges.filter(charge => charge.kind === kind).reduce((total, charge) => total + charge.amountMinor, 0);
        return { ...request, supplier, supplierSnapshot: structuredClone(lines[0].supplierSnapshot ?? request.supplierSnapshot), lines,
            charges: groupCharges, freightMinor: sum('freight'), taxMinor: sum('tax'), otherChargesMinor: sum('other'),
            totalMinor: lines.reduce((sum: number, line: Data) => sum + line.totalMinor, 0) + groupCharges.reduce((sum, charge) => sum + charge.amountMinor, 0),
            supplierGroup: { key: request.id + ':' + request.revision, index, count: ids.length, requestTotalMinor: request.totalMinor, lineExposure:selected.map(({line,at}:Data)=>({line:line.id,baseMinor:line.totalMinor,amountMinor:exposure[at]})) } };
    });
}
export function requireGroupable(s: State, request: Data) {
    requireThat(!request.imported && !request.adoption && !request.adoptedDisposition && !request.amends && !request.recurring && !request.recurringSeries && !request.cancellation && (!request.purchaseType || request.purchaseType === 'goods') && !request.poDetails?.blanket && !request.poDetails?.deposit && !request.poDetails?.depositTerms && request.lines.every((line: Data) => !line.service && !line.carriedAccepted && !line.carriedCancelled),
        'Supplier groups support only wholly unissued native ordinary goods; existing liabilities require their original disposition', 409);
    requireThat(!all(s, 'order').some(order => order.request === request.id), 'Supplier group source lines are already allocated to purchase orders', 409);
}
export function supplierGroupOrders(s: State, order: Data) {
    return all(s, 'order').filter(candidate => candidate.request === order.request && candidate.supplierGroup?.key === order.supplierGroup.key).sort((a,b) => a.supplierGroup.index - b.supplierGroup.index);
}
export function requireGroupFace(s: State, order: Data) {
    const request = get(s, 'revision', order.request + ':' + order.revision);
    const expected = supplierGroupFaces({ ...request, id: order.request }).find(face => face.supplier === order.supplier);
    const face = (value: Data) => ({supplier:value.supplier,supplierSnapshot:value.supplierSnapshot,lines:value.lines.map(({sourceLine,...line}: Data)=>line),charges:value.charges,freightMinor:value.freightMinor,taxMinor:value.taxMinor,otherChargesMinor:value.otherChargesMinor,totalMinor:value.totalMinor,supplierGroup:value.supplierGroup});
    requireThat(expected && JSON.stringify(face(expected)) === JSON.stringify(face(order)), 'Supplier group face or source changed; renew approval', 409);
    const siblings = supplierGroupOrders(s, order);
    requireThat(siblings.length === expected.supplierGroup.count && siblings.every((sibling,index) => sibling.supplierGroup.index === index) && new Set(siblings.flatMap(sibling=>sibling.lines.map((line:Data)=>line.id))).size === request.lines.length && siblings.reduce((sum,sibling)=>sum+sibling.totalMinor,0) === request.totalMinor,
        'Supplier group allocation is incomplete or duplicated', 409);
    return siblings;
}
