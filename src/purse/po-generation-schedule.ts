import { sendGeneratedOrders } from './po-generation-send';
import { combineApprovedDaily } from './po-combination';
import { runtimeBindings, type Bindings } from '../auth.server';
import { load } from './store';
import { orders } from './orders';
import { generationReadiness, generationRule } from './po-generation';
import { poGenerationAuthority, poGenerationNativeGuards, type NativePoProof } from './po-generation-authority';
import { all, audit, Fault, get, put, type Data } from './types';

/** Generation and its deterministic request/revision claim commit together.
 * Supplier sending uses a separate durable claim under the exact standing rule. */
export async function runPoGeneration(original: Bindings,now=Date.now()): Promise<{events:Data[]}> {
    const env=runtimeBindings(original),initial=await load(env.DB),events:Data[]=[];
    for (const candidate of all(initial.state,'request').filter(r => r.status==='approved' && !r.imported)) {
        const loaded=await load(env.DB),before=loaded.state,request=before.get('request:'+candidate.id)?.value;
        if (!request || request.status !== 'approved' || request.imported) continue;
        const policy=generationRule(before,request);
        if (!policy?.enabled || Date.parse(policy.at)>now) continue;
        const day=new Date(now).toISOString().slice(0,10),dailyId=JSON.stringify([policy.id,policy.version,request.supplier,request.currency,day]);
        if (policy.combineDaily && before.has('poGenerationDaily:'+dailyId)) continue;
        const id=request.id+':'+request.revision;
        if (before.get('poGenerationEvent:'+id)?.value.status === 'generated') continue;
        let state=structuredClone(before),proofs:NativePoProof[]=[],event:Data;
        try {
            const readiness=generationReadiness(state,request,policy);
            if (readiness.status !== 'ready') continue;
            const authority=await poGenerationAuthority(env,state,policy,request);proofs=authority.proofs;
            const sources=policy.combineDaily ? all(state,'request').filter(source=>{
                if(source.status!=='approved' || source.imported || source.supplier!==request.supplier || source.currency!==request.currency || (source.entity??'main')!==(request.entity??'main') || generationRule(state,source)?.id!==policy.id)return false;
                try{return generationReadiness(state,source,policy).status==='ready';}catch(error){if(!(error instanceof Fault))throw error;return false;}
            }) : [request];
            if(policy.combineDaily && sources.reduce((sum,source)=>sum+source.totalMinor,0)>policy.maxMinor)throw new Fault(409,'Combined amount exceeds the owner’s automatic generation limit; buyer review required');
            for(const source of sources)proofs.push(...(await poGenerationAuthority(env,state,policy,source)).proofs);
            const order=policy.combineDaily ? combineApprovedDaily(state,authority.actor,sources)! : orders(state,authority.actor,'convert',{id:request.id,revision:request.revision,issue:true})!;
            event={id,request:request.id,revision:request.revision,policy:policy.id,policyVersion:policy.version,status:'generated',order:order.id,
                actor:authority.actor.id,operatorVersion:authority.actor.version,authorityProofs:proofs,at:new Date(now).toISOString(),outbound:policy.automaticSending?'standing-rule-contact-on-file':'buyer-consent-required'};
            put(state,'order',order.id,{...order,generation:{event:id,policy:policy.id,policyVersion:policy.version}});
            if(policy.combineDaily){
                put(state,'poGenerationDaily',dailyId,{id:dailyId,day,policy:policy.id,policyVersion:policy.version,order:order.id,at:event.at});
                for(const source of sources){put(state,'poGenerationEvent',source.id+':'+source.revision,{...event,id:source.id+':'+source.revision,request:source.id,revision:source.revision});
                    audit(state,authority.actor,'po-generation-generated',order.id,{request:source.id,revision:source.revision,policy:policy.id,policyVersion:policy.version,outbound:event.outbound});}
            }
            audit(state,authority.actor,'po-generation-generated',order.id,{request:request.id,revision:request.revision,policy:policy.id,policyVersion:policy.version,outbound:event.outbound});
        } catch(error) {
            if (!(error instanceof Fault)) throw error;
            state=structuredClone(before);proofs=[];
            const previous=before.get('poGenerationEvent:'+id)?.value;
            if (previous?.status==='held' && previous.reason===error.message && previous.policyVersion===policy.version && previous.policy===policy.id) continue;
            event={id,request:request.id,revision:request.revision,policy:policy.id,policyVersion:policy.version,status:'held',reason:error.message,at:new Date(now).toISOString(),outbound:policy.automaticSending?'standing-rule-contact-on-file':'buyer-consent-required'};
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
    await sendGeneratedOrders(env);
    return {events};
}
