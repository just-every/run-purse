import type { Bindings } from '../auth.server';
import { runtimeBindings } from '../auth.server';
import { load } from './store';
import { absencePrivateKinds, absenceAuthorityFence, reconcileAbsences } from './approval-absence';

/** Domain-revision CAS serializes concurrent cron invocations and ordinary commands. */
export async function runApprovalAbsences(original: Bindings, now=Date.now()) {
    const env=runtimeBindings(original);
    for(let attempt=0;attempt<3;attempt++) {
        const {state,revision}=await load(env.DB), before=structuredClone(state), transitions=reconcileAbsences(state,now);
        if(!transitions)return {transitions:0};
        const statements=[env.DB.prepare('INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END').bind(revision)];
        for(const [key,row]of state)if(!absencePrivateKinds.includes(row.kind)&&before.get(key)?.revision!==row.revision)statements.push(env.DB.prepare('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value').bind(row.business,row.kind,row.id,row.revision,JSON.stringify(row.value)));
        for(const [key,row]of state)if(row.kind==='approvalAbsenceTransfer'&&row.value.status==='delegated'&&before.get(key)?.revision!==row.revision)statements.push(...absenceAuthorityFence(env.DB,state,row.value.config,row.value.configVersion));
        statements.push(env.DB.prepare('DELETE FROM p_guard'));
        try {await env.DB.batch(statements);return {transitions};}catch(error){if(!String(error).includes('CHECK constraint'))throw error;}
    }
    return {transitions:0,held:'Purchasing state changed; the next scheduled invocation will reconcile'};
}
