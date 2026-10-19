import { closeRfqDeadline } from './rfq-deadline';
import { operatorMail } from '../mail.server.mjs';
import type { Bindings } from '../auth.server';
import { load } from './store';
import { all, get, uid, type Data } from './types';

export async function sendRfqMail(env: Bindings, rfq: Data, target: Data, event: Data, url?: string) {
    const sender = operatorMail(env);
    let outcome: Data = { ...event, status: 'unavailable', reason:'mail-not-configured' };
    if (sender && env.MAIL_FROM && target.email) {
        try {
            const result = await sender.send({ deliveryId: `rfq:${event.id}`, from: env.MAIL_FROM, to: [target.email], headers: {}, html: '',
                subject: `${event.type === 'reminder' ? 'RFQ reminder' : 'Request for quotation'}: response due ${rfq.deadline}`,
                text: `Please provide a quotation by ${rfq.deadline}. ${url ? 'Respond or revise your quotation: ' + url : 'Use your invitation link to respond or revise your quotation. Ask the buyer for a new link if needed.'}\n${rfq.scope}\nThis invitation grants no purchasing approval or commitment.` });
            outcome = { ...event, delivery:result, status:result.status==='development'?'suppressed':result.status };
        } catch { outcome = { ...event, status: 'uncertain' }; }
    }
    const audit={id:uid(),actor:event.actor||'scheduled',action:'rfq-mail-outcome',record:rfq.request,rfq:rfq.id,supplier:target.id,mailEvent:event.id,type:event.type,status:outcome.status,at:new Date().toISOString(),scheduledAt:event.at};
    await env.DB.batch([env.DB.prepare("UPDATE p_records SET revision=?,value=? WHERE business='main' AND kind='rfqMailEvent' AND id=?").bind(uid(), JSON.stringify(outcome), event.id),env.DB.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main','audit',?,?,?)").bind(audit.id,uid(),JSON.stringify(audit))]);
    return outcome;
}

/** Claim before the mail effect. An interrupted claim remains uncertain and is never retried. */
export async function runRfqReminders(env: Bindings, now = Date.now()) {
    const { state } = await load(env.DB), events: Data[] = [];
    for (const rfq of all(state, 'rfq')) for (const target of rfq.suppliers) {
        const deadline = Date.parse(rfq.deadline);
        if (all(state, 'rfqResponse').some(r => r.rfq === rfq.id && r.supplier === target.id)) continue;
        const type = now >= deadline ? 'nonresponse' : now >= Date.parse(rfq.reminderAt) ? 'reminder' : null;
        if (!type || !all(state, 'rfqMailEvent').some(e => e.rfq === rfq.id && e.supplier === target.id && ['invitation', 'reissue'].includes(e.type))) continue;
        const id = `${rfq.id}:${target.id}:${type}`, event = { id, rfq: rfq.id, supplier: target.id, type, status: type === 'nonresponse' ? 'recorded' : 'uncertain', at: new Date(now).toISOString() };
        const current = get(state, 'rfq', rfq.id);
        const attemptAudit={id:'rfq-mail-attempt:'+id,actor:'scheduled',action:'rfq-'+type,record:rfq.request,rfq:rfq.id,supplier:target.id,mailEvent:id,at:event.at,status:event.status,configuredBy:rfq.actor};
        const claimed = await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO p_records(business,kind,id,revision,value) SELECT 'main','rfqMailEvent',?,?,? WHERE EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='rfq' AND id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='rfqResponse' AND json_extract(value,'$.rfq')=? AND json_extract(value,'$.supplier')=?)")
            .bind(id, uid(), JSON.stringify(event), current.id, state.get('rfq:' + current.id)!.revision, rfq.id, target.id),env.DB.prepare("INSERT OR IGNORE INTO p_records(business,kind,id,revision,value) SELECT 'main','audit',?,?,? WHERE EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='rfqMailEvent' AND id=?)").bind(attemptAudit.id,uid(),JSON.stringify(attemptAudit),id)]);
        if (!claimed[0].meta.changes) continue;
        events.push(type === 'reminder' ? await sendRfqMail(env, rfq, target, event) : event);
    }
    for(const rfq of all(state,'rfq')) await closeRfqDeadline(env,rfq,now);
    return { events };
}
