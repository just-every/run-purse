import type { Bindings } from '../auth.server';
import { uid, type Data } from './types';
/** The hourly deadline event closes reply authority durably, including after a clock correction. */
export async function closeRfqDeadline(env: Bindings, rfq: Data, now: number) {
    if (now < Date.parse(rfq.deadline)) return;
    const audit={id:'rfq-deadline:'+rfq.id,actor:'scheduled',action:'rfq-deadline',record:rfq.request,rfq:rfq.id,at:new Date(now).toISOString(),deadline:rfq.deadline};
    await env.DB.batch([
        env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.closedAt',?) WHERE business='main' AND kind='rfq' AND id=? AND json_extract(value,'$.deadline')=? AND json_extract(value,'$.closedAt') IS NULL")
            .bind(uid(),new Date(now).toISOString(),rfq.id,rfq.deadline),
        env.DB.prepare('UPDATE p_rfq_links SET revoked_at=? WHERE rfq=? AND expires_at<=? AND revoked_at IS NULL').bind(now,rfq.id,now),
        env.DB.prepare("INSERT OR IGNORE INTO p_records(business,kind,id,revision,value) SELECT 'main','audit',?,?,? WHERE EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='rfq' AND id=? AND json_extract(value,'$.closedAt') IS NOT NULL)").bind(audit.id,uid(),JSON.stringify(audit),rfq.id),
    ]);
}
