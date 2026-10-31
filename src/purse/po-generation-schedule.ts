import { runtimeBindings, type Bindings } from '../auth.server';
import { load } from './store';
import { orders } from './orders';
import { sendOrderChange } from './order-send';
import { generationReadiness, generationRule } from './po-generation';
import { poGenerationAuthority, poGenerationNativeGuards, type NativePoProof } from './po-generation-authority';
import { all, audit, Fault, get, put, type Data } from './types';

/** Generation and its deterministic request/revision claim commit together.
 * Optional standing sending uses the same frozen-document, claim-once adapter. */
export async function runPoGeneration(original: Bindings,now=Date.now()): Promise<{events:Data[]}> {
    const env=runtimeBindings(original),initial=await load(env.DB),events:Data[]=[];
    for (const candidate of all(initial.state,'request').filter(r => r.status==='approved' && !r.imported)) {
        const loaded=await load(env.DB),before=loaded.state,request=before.get('request:'+candidate.id)?.value;
        if (!request || request.status !== 'approved' || request.imported) continue;
        const policy=generationRule(before,request);
        if (!policy?.enabled || Date.parse(policy.at)>now) continue;
        const id=request.id+':'+request.revision;
        if (before.get('poGenerationEvent:'+id)?.value.status === 'generated') continue;
        let state=structuredClone(before),proofs:NativePoProof[]=[],event:Data;
        try {
            const readiness=generationReadiness(state,request,policy);
            if (readiness.status !== 'ready') continue;
            const authority=await poGenerationAuthority(env,state,policy,request);proofs=authority.proofs;
            const order=orders(state,authority.actor,'convert',{id:request.id,revision:request.revision,issue:true})!;
            event={id,request:request.id,revision:request.revision,policy:policy.id,policyVersion:policy.version,status:'generated',order:order.id,
                actor:authority.actor.id,operatorVersion:authority.actor.version,authorityProofs:proofs,at:new Date(now).toISOString(),outbound:policy.sendEnabled?'owner-standing-consent':'buyer-consent-required'};
            put(state,'order',order.id,{...order,generation:{event:id,policy:policy.id,policyVersion:policy.version}});
            audit(state,authority.actor,'po-generation-generated',order.id,{request:request.id,revision:request.revision,policy:policy.id,policyVersion:policy.version,outbound:event.outbound});
        } catch(error) {
            if (!(error instanceof Fault)) throw error;
            state=structuredClone(before);proofs=[];
            const previous=before.get('poGenerationEvent:'+id)?.value;
            if (previous?.status==='held' && previous.reason===error.message && previous.policyVersion===policy.version && previous.policy===policy.id) continue;
            event={id,request:request.id,revision:request.revision,policy:policy.id,policyVersion:policy.version,status:'held',reason:error.message,at:new Date(now).toISOString(),outbound:policy.sendEnabled?'owner-standing-consent':'buyer-consent-required'};
        }
        put(state,'poGenerationEvent',id,event);
        const guard=()=>env.DB.prepare('INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END').bind(loaded.revision);
        const statements=[guard(),...poGenerationNativeGuards(env.DB,proofs)];
        for (const [key,row] of state) if (before.get(key)?.revision !== row.revision) statements.push(env.DB.prepare('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value')
            .bind(row.business,row.kind,row.id,row.revision,JSON.stringify(row.value)));
        statements.push(...poGenerationNativeGuards(env.DB,proofs),env.DB.prepare('DELETE FROM p_guard'));
        try { await env.DB.batch(statements);events.push(get(state,'poGenerationEvent',id)); }
        catch(error) { if (!/CHECK constraint/.test(String(error))) throw error; }
    }
    // Generation commits before any network effect. A crash or competing manual
    // send leaves the unique orderSend claim as the sole authority for retries.
    const generated=await load(env.DB);
    for(const candidate of all(generated.state,'poGenerationEvent').filter(event=>event.status==='generated')) {
        const loaded=await load(env.DB),state=loaded.state,request=state.get('request:'+candidate.request)?.value;
        if(!request||request.status!=='approved'||request.revision!==candidate.revision)continue;
        const policy=generationRule(state,request);
        if(!policy?.enabled||!policy.sendEnabled||Date.parse(policy.at)>now||policy.id!==candidate.policy||policy.version!==candidate.policyVersion
            ||all(state,'orderSend').some(event=>event.order===candidate.order))continue;
        try {
            const {actor}=await poGenerationAuthority(env,state,policy,request);
            await sendOrderChange(env,actor,{order:candidate.order,revision:candidate.revision,recipient:policy.sendRecipient,
                consent:true,reason:'Owner standing consent '+policy.id+' version '+policy.version},{policy:policy.id,version:policy.version});
        } catch(error) {
            if(!(error instanceof Fault))throw error;
            const event=state.get('poGenerationEvent:'+candidate.id)!;
            if(event.value.sendHold===error.message)continue;
            try {await env.DB.batch([
                env.DB.prepare('INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END').bind(loaded.revision),
                env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.sendHold',?) WHERE kind='poGenerationEvent' AND id=?").bind(crypto.randomUUID(),error.message,candidate.id),
                env.DB.prepare('DELETE FROM p_guard'),
            ]);} catch(conflict) {if(!/CHECK constraint/.test(String(conflict)))throw conflict;}
        }
    }
    return {events};
}
