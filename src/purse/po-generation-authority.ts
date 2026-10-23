import type { Bindings } from '../auth.server';
import { currentDecision } from './approval';
import { requirePermission, requireThat, type Actor, type Data, type State } from './types';

export type NativePoProof = { actor: string; version: number; owner?: boolean };
/** Cron uses the actual configured native principal and explicit policy consent,
 * never a fabricated session or an approval manufactured by the scheduler. */
export async function poGenerationAuthority(env: Bindings,s: State,policy: Data,request: Data) {
    const native=await env.DB.prepare("SELECT id,email,version,role FROM oa_operators WHERE id=? AND version=? AND status='active' AND role='owner' AND lower(email)=?")
        .bind(policy.actor,policy.operatorVersion,policy.email.toLowerCase()).first<{id:string;email:string;version:number;role:string}>();
    requireThat(native,'The configuring native owner’s authority ended; renew the generation policy',409);
    const actor: Actor={id:native.id,email:native.email,version:native.version,owner:native.role==='owner',dev:false,session:''};
    requirePermission(s,actor,'po.convert',request);requirePermission(s,actor,'po.issue',request);
    const decision=currentDecision(s,request),proofs: NativePoProof[]=[{actor:native.id,version:native.version,owner:true},
        ...(decision.chainProofs ?? [{actor:decision.actor,version:decision.operatorVersion,owner:decision.owner===true}])];
    for (const proof of proofs) requireThat(await env.DB.prepare("SELECT 1 AS ok FROM oa_operators WHERE id=? AND version=? AND status='active' AND (?=0 OR role='owner')")
        .bind(proof.actor,proof.version,proof.owner?1:0).first(),'Current approval identity ended; renew approval',409);
    return {actor,proofs};
}
export function poGenerationNativeGuards(db: D1Database,proofs: NativePoProof[]) {
    return proofs.map(proof => db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND (?=0 OR role='owner')) THEN 1 ELSE 0 END")
        .bind(proof.actor,proof.version,proof.owner?1:0));
}
