import type {Bindings} from '../auth.server';
import {authority,load} from './store';
import {insertOrderSendRecord} from './order-send';
import {deliverNativeNotice} from './order-send-mail';
import {currentRecurringScenario} from './recurring-scenarios';
import {valueDigest} from './agent-value-evidence';
import {all,get,requireThat,text,uid,type Actor,type Data} from './types';

/** Human-only native send boundary: claim once before the network effect. */
export async function sendRecurringNotice(env:Bindings,a:Actor,b:Data) {
    requireThat(a.owner,'Current native owner required to send an approved recurring brief',403);
    requireThat(b.consent===true,'Explicit exact-draft and recipient consent is required');
    const {state,revision}=await load(env.DB),{scenario,consents}=await currentRecurringScenario(state,a,b);
    const draft=get(state,'recurringScenarioDraft',scenario.id);
    requireThat(draft.draftHash===b.draftHash && draft.hash===scenario.hash && await valueDigest(draft.text)===draft.draftHash,'Review and consent to this exact approved draft',409);
    requireThat(!all(state,'recurringNoticeSend').some(r=>r.scenario===scenario.id),'This scenario already has a send attempt; uncertain outcomes require investigation and are never retried',409);
    const recipient=text(b.recipient,'Notice recipient',254).toLowerCase();
    requireThat(/^[^\s@<>(),:;"\\]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(recipient),'Use one notice recipient email');
    requireThat(env.MAIL_PROVIDER&&env.MAIL_FROM,'Configure the native mail sender before sending',409);
    const id='recurring-notice:'+scenario.id,at=new Date().toISOString(),reason=text(b.reason,'Notice send reason');
    const event:Data={id,scenario:scenario.id,hash:scenario.hash,draftHash:draft.draftHash,recipient,actor:a.id,email:a.email,operatorVersion:a.version,owner:a.owner,reason,at,status:'uncertain',
        noticeDeadlines:scenario.snapshot.agreements.map((r:Data)=>({agreement:r.id,name:get(state,'agreement',r.id).name,date:r.noticeDeadline})),deliveryVisibility:{mailbox:'unknown'},noticeEffectiveness:'not-verified'};
    const auth=authority(a,true);
    try {await env.DB.batch([
        env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(...auth.params,revision),
        ...consents.map(c=>env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND (?=0 OR role='owner')) THEN 1 ELSE 0 END").bind(c.actor,c.operatorVersion,c.nativeOwner?1:0)),
        insertOrderSendRecord(env.DB,'recurringNoticeSend',event),
        insertOrderSendRecord(env.DB,'audit',{id:uid(),action:'recurring-notice-claimed',record:scenario.id,send:id,hash:scenario.hash,draftHash:draft.draftHash,recipient,actor:a.id,email:a.email,at}),
        env.DB.prepare('DELETE FROM p_guard')]);
    }catch(error){requireThat(!/CHECK constraint|UNIQUE constraint/.test(String(error)),'Scenario, consent authority or send claim changed; reload',409);throw error;}
    const outcome=await deliverNativeNotice(env,{deliveryId:id,recipient,subject:'Approved recurring-spend '+draft.kind,text:draft.text});
    const outcomeAt=new Date().toISOString();
    await env.DB.batch([
        env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.status',?,'$.delivery',json(?),'$.outcomeAt',?,'$.reasonCode',?) WHERE business='main' AND kind='recurringNoticeSend' AND id=? AND json_extract(value,'$.erasure') IS NULL").bind(uid(),outcome.status,JSON.stringify(outcome.delivery??null),outcomeAt,outcome.reason??null,id),
        insertOrderSendRecord(env.DB,'audit',{id:uid(),action:'recurring-notice-outcome',record:scenario.id,send:id,hash:scenario.hash,draftHash:draft.draftHash,status:outcome.status,actor:a.id,email:a.email,at:outcomeAt})]);
    return {event:{...event,...outcome,outcomeAt}};
}
