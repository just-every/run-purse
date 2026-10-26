import { currentDecision } from './approval';
import { all, get, requirePermission, requireThat, type Actor, type Data, type State } from './types';

export function orderSources(order: Data): Data[] {
    return order.sources ?? [{request:order.request,revision:order.revision,lines:order.lines.map((line:Data)=>line.sourceLine??line.id)}];
}
export function orderHasRequest(order: Data, request: string) { return orderSources(order).some(source=>source.request===request); }
export function allocatedSourceLine(s: State, request: string, line: string) {
    return all(s,'order').some(order=>!['superseded'].includes(order.status) && orderSources(order).some(source=>source.request===request && source.lines.includes(line)));
}
/** Exact integer allocation; the original line order receives remainder cents. */
export function combinationShares(amount: number, lines: Data[]) {
    if(!lines.length)return [];
    const total=lines.reduce((sum,line)=>sum+line.totalMinor,0),denominator=BigInt(total||lines.length);
    const shares=lines.map(line=>Number(BigInt(amount)*BigInt(total?line.totalMinor:1)/denominator));
    let remainder=amount-shares.reduce((sum,value)=>sum+value,0);
    for(let index=0;remainder>0;index++,remainder--)shares[index%shares.length]++;
    return shares;
}
/** A financial view of real PO lines, never a request or approval record. */
export function orderSourceFace(order: Data, request: string): Data | undefined {
    if(!order.sources)return order.request===request?order:undefined;
    const source=order.sources.find((source:Data)=>source.request===request);if(!source)return;
    const lines=order.lines.filter((line:Data)=>line.sourceRequest===request);
    return {...order,...source,request,revision:source.revision,lines,totalMinor:source.totalMinor,freightMinor:source.freightMinor,taxMinor:source.taxMinor,otherChargesMinor:source.otherChargesMinor,positions:order.positions?.filter((position:Data)=>lines.some((line:Data)=>line.id===position.line))};
}
export function sourceLineIdentity(order: Data, line: Data) { return JSON.stringify([line.sourceRequest??order.request,line.sourceLine??line.id]); }
export function requireCurrentCombination(s: State, order: Data) {
    for(const source of orderSources(order)) {
        const request=get(s,'request',source.request);
        requireThat(request.status==='approved' && request.revision===source.revision && !request.imported,'Combined PO source authority changed; renew the affected source approval',409);
    }
}

export function orderSourceRequests(s: State, order: Data) { return orderSources(order).map(source=>get(s,'request',source.request)); }
export function orderSourceDecisions(s: State,order: Data) {requireCurrentCombination(s,order);return orderSourceRequests(s,order).map(request=>currentDecision(s,request));}
export function requireOrderSources(s: State,a: Actor,order: Data,permission='po.issue') {
    for(const request of orderSourceRequests(s,order))requirePermission(s,a,permission,request);
    return orderSourceDecisions(s,order);
}
