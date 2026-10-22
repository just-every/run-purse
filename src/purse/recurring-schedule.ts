import { runtimeBindings, type Bindings } from '../auth.server';
import { load } from './store';
import { recurringRenewal } from './recurring-renewal';
import { nextMonth } from './recurring-orders';
import { ledger } from './requests';
import { receiptDay } from './receipt-routing';
import { all, audit, Fault, put, uid, type Actor, type Data, type State } from './types';

async function nativeAuthority(env: Bindings, series: Data) {
    const {state}=await load(env.DB), source=state.get('order:'+series.order)?.value;
    const identities=[{id:source?.approvalActor,version:source?.approvalVersion,owner:false},{id:series.owner,version:series.ownerVersion,owner:true}, {id:series.authorization?.actor,version:series.authorization?.operatorVersion,owner:series.authorization?.owner===true}];
    for(const identity of identities) {
        if(!identity.id)return false;
        const active=await env.DB.prepare("SELECT 1 AS ok FROM oa_operators WHERE id=? AND version=? AND status='active' AND (?=0 OR role='owner')").bind(identity.id,identity.version,identity.owner?1:0).first();
        if(!active)return false;
    }
    return true;
}
function generated(s: State, series: Data, now: number) {
    const {order,request,authorization}=recurringRenewal(s,series,series.nextDate,now), id=uid(), orderId=uid(), at=new Date(now).toISOString();
    const actor:Actor={id:authorization.actor,email:authorization.email,version:authorization.operatorVersion,owner:authorization.owner===true,session:'',dev:false};
    const lines=order.lines.map((line:Data)=>{const {sourceLine,carriedAccepted,carriedCancelled,carriedAcceptedMinor,carriedCancelledMinor,carriedMilestones,...rest}=line;return {...rest,id:uid()};});
    const source={series:series.id,authorizationVersion:authorization.seriesVersion,sourceOrder:order.id,sourceRequest:request.id,sourceRevision:request.revision,scheduledFor:series.nextDate};
    const r:Data={...request,id,title:request.title+' · '+series.nextDate,revision:1,status:'approved',needDate:series.nextDate,lines,recurring:source};
    delete r.amends;delete r.valuePromise;delete r.emailIntake;delete r.integration;delete r.quoteTerms;
    put(s,'request',id,r);put(s,'revision',id+':1',{...r,request:id});
    const decision=uid();
    put(s,'decision',decision,{request:id,revision:1,decision:'approved',...authorization,policy:request.policy,reason:'Scheduled purchase under explicit recurring authorization: '+authorization.reason,recurring:source,at});
    ledger(s,actor,r,r.totalMinor,'recurring-order-reservation');
    let sequence=all(s,'order').reduce((n,o)=>Math.max(n,o.sequence||0),0)+1;
    const occupied=new Set(all(s,'order').map(o=>o.number));while(occupied.has(`PO-${String(sequence).padStart(6,'0')}`))sequence++;
    put(s,'order',orderId,{...order,id:orderId,request:id,revision:1,sequence,number:`PO-${String(sequence).padStart(6,'0')}`,status:'issued',lines:lines.map((l:Data)=>({...l,sourceLine:l.id})),needDate:series.nextDate,recurring:source,approvalActor:authorization.actor,approvalVersion:authorization.operatorVersion,generatedAt:at,issuedAt:at,issuedBy:series.owner,issueReason:'Scheduled order under approved recurring authority'});
    const nextDate=nextMonth(series.nextDate,series.anchor), count=series.generatedCount+1, ended=count>=series.maxOrders||nextDate>series.endDate;
    put(s,'recurringSeries',series.id,{...series,nextDate,generatedCount:count,status:ended?'ended':'active',version:series.version+1});
    audit(s,actor,'recurring-generated',orderId,{series:series.id,sourceOrder:order.id,scheduledFor:series.nextDate});
    return {order:orderId,request:id,agreement:series.agreement,agreementVersion:all(s,'agreement').find(a=>a.id===series.agreement)!.version,sourceOrder:order.id,scheduledFor:series.nextDate,status:'generated',at};
}

/** One due order per active series per hourly invocation; all changes claim the exact domain revision atomically. */
export async function runRecurringOrders(original: Bindings, now=Date.now()) {
    const env=runtimeBindings(original), initial=await load(env.DB), events:Data[]=[];
    for(const candidate of all(initial.state,'recurringSeries').filter(series=>series.status==='active'&&series.nextDate<=receiptDay(initial.state,now))) {
        const {state,revision}=await load(env.DB), series=state.get('recurringSeries:'+candidate.id)?.value;
        if(!series||series.status!=='active'||series.nextDate>receiptDay(state,now))continue;
        const before=structuredClone(state);let event:Data;
        try {
            if(!await nativeAuthority(env,series))throw new Fault(409,'Current native owner or series approver authority ended; renew consent');
            event=generated(state,series,now);
        } catch(error) {
            if(!(error instanceof Fault))throw error;
            const reason=error.message,at=new Date(now).toISOString();
            event={status:'paused',reason,scheduledFor:series.nextDate,agreement:series.agreement,sourceOrder:series.order,at};
            put(state,'recurringSeries',series.id,{...series,status:'paused',pauseReason:reason,version:series.version+1,history:[...series.history,{status:'paused',version:series.version+1,reason,actor:'system',at}]});
            audit(state,{id:'system',email:'',version:0,owner:false,session:'',dev:false},'recurring-paused',series.order,{series:series.id,reason,scheduledFor:series.nextDate});
        }
        const eventId=series.id+':'+series.nextDate+':'+series.version;
        put(state,'recurringEvent',eventId,{...event,series:series.id});
        const statements=[env.DB.prepare('INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END').bind(revision)];
        if(event.status==='generated') for(const identity of [{id:state.get('order:'+series.order)!.value.approvalActor,version:state.get('order:'+series.order)!.value.approvalVersion,owner:0},{id:series.owner,version:series.ownerVersion,owner:1},{id:series.authorization.actor,version:series.authorization.operatorVersion,owner:series.authorization.owner?1:0}]) statements.push(env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND (?=0 OR role='owner')) THEN 1 ELSE 0 END").bind(identity.id,identity.version,identity.owner));
        for(const [key,row]of state)if(before.get(key)?.revision!==row.revision)statements.push(env.DB.prepare('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value').bind(row.business,row.kind,row.id,row.revision,JSON.stringify(row.value)));
        statements.push(env.DB.prepare('DELETE FROM p_guard'));
        try {await env.DB.batch(statements);events.push({...event,id:eventId,series:series.id});} catch(error) {if(!String(error).includes('CHECK constraint'))throw error;}
    }
    return {events};
}
