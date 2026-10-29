import { currentDecision } from './approval';
import { authorizedApproval } from './requests';
import { all, audit, date, get, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

export function nextMonth(day: string, anchor: number) {
    const d = new Date(day + 'T00:00:00Z'), year = d.getUTCFullYear(), month = d.getUTCMonth() + 1;
    return new Date(Date.UTC(year, month, Math.min(anchor, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()))).toISOString().slice(0,10);
}
export function recurringOrders(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['recurring-series','recurring-authorize','recurring-disposition'].includes(op)) return;
    if (op === 'recurring-series') {
        requireThat(a.owner, 'Current native owner must consent to scheduled purchasing', 403);
        const order = get(s,'order',b.order), request = get(s,'request',order.request);
        requirePermission(s,a,'procurement.manage',order);
        requireThat(order.status === 'issued' && !order.imported && !order.poDetails?.blanket && !order.poDetails?.deposit && !order.recurring && !order.conversionVariance && request.revision === order.revision,'Use a current issued ordinary or service PO as the exact recurring template',409);
        currentDecision(s,request);
        requireThat(!all(s,'recurringSeries').some(series => series.order === order.id && series.status !== 'ended'),'End the existing series before configuring another',409);
        const nextDate=date(b.nextDate,'First scheduled order date'), endDate=date(b.endDate,'Series end date');
        requireThat(nextDate <= endDate && nextDate > order.issuedAt.slice(0,10),'Schedule must follow template issuance and end on or after its first date');
        requireThat(Number.isSafeInteger(b.maxOrders) && b.maxOrders > 0 && b.maxOrders <= 120,'Authorize 1–120 additional monthly orders');
        const agreement=get(s,'agreement',b.agreement);
        requireThat(agreement.currency === order.currency && agreement.supplier === order.supplier,'Agreement supplier and currency must match the template');
        const id=uid(), at=new Date().toISOString(), reason=text(b.reason,'Recurring authority reason');
        put(s,'recurringSeries',id,{order:order.id,request:request.id,sourceRevision:request.revision,agreement:agreement.id,owner:a.id,ownerEmail:a.email,ownerVersion:a.version,
            nextDate,firstDate:nextDate,anchor:Number(nextDate.slice(8)),endDate,maxOrders:b.maxOrders,generatedCount:0,status:'pending',version:1,reason,at,history:[{version:1,status:'pending',reason,actor:a.id,at}]});
        audit(s,a,op,order.id,{series:id,nextDate,endDate,maxOrders:b.maxOrders,agreement:agreement.id,reason});return get(s,'recurringSeries',id);
    }
    const series=get(s,'recurringSeries',b.id), request=get(s,'request',series.request), order=get(s,'order',series.order);
    requireThat(b.version===series.version,'Series changed; reload',409);
    const reason=text(b.reason,'Series decision reason'), at=new Date().toISOString();
    if(op==='recurring-authorize') {
        requireThat(series.status==='pending','Series is not awaiting authorization',409);
        const {p,delegated,assignment}=authorizedApproval(s,a,request);
        requireThat(request.revision===series.sourceRevision && order.status==='issued','Template changed; configure a new series from renewed approval',409);
        const authorization={actor:a.id,email:a.email,operatorVersion:a.version,owner:a.owner,policy:p.id,policyVersion:s.get('policy:'+p.id)!.revision,
            ...(delegated?{delegation:delegated.id}:{}),...(assignment?{scimTransfer:assignment.id}:{}),at,reason,seriesVersion:series.version+1};
        put(s,'recurringSeries',series.id,{...series,status:'active',version:series.version+1,authorization,history:[...series.history,{version:series.version+1,status:'active',actor:a.id,at,reason}]});
        audit(s,a,op,order.id,{series:series.id,version:series.version+1,reason});
    } else {
        requireThat(a.owner && a.id===series.owner,'The current native series owner must decide',403);
        requireThat(['pause','continue','amend','end'].includes(b.disposition),'Choose continue, amend or end');
        requireThat(series.status!=='ended','Series has ended',409);
        requireThat(b.disposition!=='continue'||series.authorization,'Obtain independent series approval first',409);
        const status=b.disposition==='end'?'ended':b.disposition==='continue'?'active':'paused';
        // Continue requests a fresh renewal check; it never bypasses a failed condition.
        put(s,'recurringSeries',series.id,{...series,status,version:series.version+1,ownerVersion:a.version,disposition:b.disposition,reason,
            history:[...series.history,{version:series.version+1,status,disposition:b.disposition,reason,actor:a.id,at}]});
        audit(s,a,op,order.id,{series:series.id,disposition:b.disposition,reason});
    }
    return get(s,'recurringSeries',series.id);
}
