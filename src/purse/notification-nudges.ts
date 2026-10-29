import type { Bindings } from '../auth.server';
import { notificationId } from './notification-preferences';
import { notificationInserts, notificationView } from './notifications';
import { load } from './store';
import { all, type Actor, type Data } from './types';

/** Native reminder cadence never changes an approver, a purchasing decision or queue age. */
export async function runNotificationNudges(env: Bindings, now: number) {
    const {state}=await load(env.DB), policy=state.get('notificationNudgePolicy:main')?.value;
    if (!policy?.enabled) return;
    const owner=await env.DB.prepare("SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active'").bind(policy.actor,policy.operatorVersion).first();
    if (!owner) return;
    const directory=(await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE status='active'").all<Data>()).results;
    const candidates=new Map<string,{notice:Data;slot:number}>();
    for (const n of all(state,'notification').filter(n => n.type==='approval-needed' && !n.erasure)) {
        const principal=directory.find(o => o.id===n.recipient);
        if (!principal) continue;
        const a:Actor={...principal,owner:principal.role==='owner',session:'',dev:false} as Actor;
        const v=notificationView(state,a,n), slot=Math.floor((now-Date.parse(n.at))/(policy.hours*3600000));
        if (!v.canRead || !v.actionable || slot<1) continue;
        const id=notificationId(['nudge',policy.version,n.record,n.sourceRevision,n.approvalAttempt,n.step,slot]);
        if (!state.has('audit:'+id)) candidates.set(id,{notice:n,slot});
    }
    for (const [id,{notice,slot}] of candidates) {
        const {state:current,revision}=await load(env.DB);
        if(current.get('notificationNudgePolicy:main')?.value.version!==policy.version || !current.get('notificationNudgePolicy:main')?.value.enabled) continue;
        const event={id,action:'approval-nudge',record:notice.record,revision:notice.sourceRevision,step:notice.step,approvalAttempt:notice.approvalAttempt,
            policyVersion:policy.version,approvalSource:notice.source,slot,actor:policy.actor,at:new Date(now).toISOString()};
        const inserts=await notificationInserts(env.DB,current,[{kind:'audit',value:event}]);
        if (!inserts.length) continue;
        try { await env.DB.batch([
            env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active') THEN 1 ELSE 0 END").bind(revision,policy.actor,policy.operatorVersion),
            env.DB.prepare("INSERT OR IGNORE INTO p_records(business,kind,id,revision,value) VALUES('main','audit',?,?,?)").bind(id,crypto.randomUUID(),JSON.stringify(event)),
            ...inserts,env.DB.prepare('DELETE FROM p_guard'),
        ]); } catch(error) { if (!/CHECK constraint|UNIQUE constraint/.test(String(error))) throw error; }
    }
}
