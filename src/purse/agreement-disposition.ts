import type {Bindings} from '../auth.server';
import {agreements} from './agreements';
import {all,audit,get,put,requireThat,text,type Actor,type Data,type State} from './types';

/** This door records a human agreement decision; PO obligations have their own approval door. */
export async function agreementDisposition(s:State,a:Actor,op:string,b:Data,env?:Bindings) {
    if(op!=='agreement-disposition')return;
    requireThat(a.owner,'Current native owner required to record an agreement decision',403);
    const agreement=get(s,'agreement',b.agreement),scenario=get(s,'recurringScenario',b.scenario);
    requireThat(!scenario.sourceValuesErased,'Scenario source values were erased; obtain fresh approvals',409);
    requireThat(b.confirmed===true,'Explicit agreement decision approval is required');
    requireThat(b.version===agreement.version&&b.hash===scenario.hash&&scenario.choices.agreementIds.includes(agreement.id),'Use the exact reviewed agreement and scenario',409);
    requireThat(scenario.choices.kind==='cancel','An approved cancellation scenario is required for an agreement disposition',409);
    requireThat(['non-renewal','cancellation'].includes(b.disposition),'Choose non-renewal or cancellation');
    requireThat(!all(s,'agreementDisposition').some(r=>r.agreement===agreement.id&&r.scenario===scenario.id),'This agreement decision is already recorded',409);
    const captured=scenario.snapshot.sources.find((r:Data)=>r.kind==='agreement'&&r.id===agreement.id);
    requireThat(captured?.value.version===agreement.version,'Agreement terms changed after scenario approval; prepare a new scenario',409);
    const send=all(s,'recurringNoticeSend').find(r=>r.scenario===scenario.id&&r.hash===scenario.hash);
    requireThat(send&&['accepted','suppressed'].includes(send.status),'An accepted human notice attempt is required; investigate uncertain or failed sends',409);
    const reason=text(b.reason,'Agreement decision reason'),version=all(s,'agreementDisposition').filter(r=>r.agreement===agreement.id).length+1,id=agreement.id+':'+version;
    const row={agreement:agreement.id,agreementVersion:agreement.version,scenario:scenario.id,hash:scenario.hash,disposition:b.disposition,reason,actor:a.id,at:new Date().toISOString(),send:send.id,version};
    const {ownerMember,...terms}=agreement;
    await agreements(s,a,'agreement',{...terms,confirmed:true,autoRenew:false,reason},env);
    put(s,'agreementDisposition',id,row);audit(s,a,op,agreement.id,{disposition:id,scenario:scenario.id,hash:scenario.hash,send:send.id,reason});
    return {id,...row};
}
