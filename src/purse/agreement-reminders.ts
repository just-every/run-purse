import { runtimeBindings, type Bindings } from '../auth.server';
import { operatorMail } from '../mail.server.mjs';
import { agreementDay, agreementSpend } from './agreements';
import { load } from './store';
import { all, uid, type Data } from './types';

function due(s: Awaited<ReturnType<typeof load>>['state'], agreement: Data, now: number) {
    const today = agreementDay(s,now);
    if (!agreement.autoRenew || !agreement.remindersEnabled || today >= agreement.noticeDeadline) return;
    // Catch up with the most recent configured interval only; never send a burst or a late notice.
    return agreement.reminderDays.filter((offset: number)=>today >= new Date(Date.parse(agreement.noticeDeadline)-offset*86400000).toISOString().slice(0,10)).sort((a: number,b: number)=>a-b)[0];
}
/** The durable claim precedes mail. A crash/uncertain outcome consumes that interval. */
export async function runAgreementReminders(original: Bindings, now = Date.now()) {
    const env = runtimeBindings(original), initial = await load(env.DB), events: Data[] = [];
    for (const candidate of all(initial.state,'agreement')) {
        const { state, revision } = await load(env.DB), agreement = state.get('agreement:'+candidate.id)?.value;
        if (!agreement) continue;
        const offset = due(state,agreement,now);if (offset === undefined) continue;
        const id = `${agreement.id}:${agreement.noticeDeadline}:${offset}`;
        const event: Data = { id, agreement: agreement.id, agreementVersion: agreement.version, noticeDeadline: agreement.noticeDeadline, offset, owner: agreement.owner, ownerEmail: agreement.ownerEmail,
            at: new Date(now).toISOString(), spend: agreementSpend(state,agreement.id), outcome: { recipient: agreement.ownerEmail, status: 'uncertain' } };
        const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
            SELECT 'main','agreementReminder',?,?,? WHERE (SELECT revision FROM p_meta WHERE id=1)=?
            AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active')`)
            .bind(id,uid(),JSON.stringify(event),revision,agreement.owner,agreement.ownerEmail).run();
        if (!inserted.meta.changes) continue;
        // Re-read after claiming, including terms, pause, owner and source evidence.
        const fresh = await load(env.DB), current = fresh.state.get('agreement:'+agreement.id)?.value;
        const permitted = current && current.version === agreement.version && due(fresh.state,current,now) === offset
            && await env.DB.prepare(`SELECT 1 AS ok WHERE (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active')`)
                .bind(fresh.revision,agreement.owner,agreement.ownerEmail).first();
        const sender = operatorMail(env);
        if (!permitted) event.outcome.status = 'suppressed';
        else if (!sender || !env.MAIL_FROM) event.outcome.status = 'unavailable';
        else try {
            const totals = event.spend.totals.map((r: Data)=>`${r.currency} ${(r.amountMinor/100).toFixed(2)}`).join('; ') || 'No attributed invoice evidence';
            const url = new URL('/app',env.AUTH_ORIGIN);url.searchParams.set('agreement',agreement.id);
            const result = await sender.send({ deliveryId: 'agreement-reminder:'+id, from: env.MAIL_FROM, to: [agreement.ownerEmail], subject: `Agreement notice deadline: ${agreement.reference}`,
                text: `${agreement.name}\nNotice deadline: ${agreement.noticeDeadline}\nTerm ends: ${agreement.endDate}\n${offset} days before notice deadline; first hourly tick on or after the configured day.\nAttributed invoice evidence to date: ${totals}. Not paid spend. Agreement value is not available yet.\nSign in to review sources: ${url.href}`,
                html: '', headers: {} });
            event.outcome = { ...event.outcome, status: result.status === 'development' ? 'suppressed' : result.status, delivery: result };
        } catch { event.outcome.status = 'uncertain'; }
        await env.DB.batch([
            env.DB.prepare("UPDATE p_records SET revision=?,value=? WHERE business='main' AND kind='agreementReminder' AND id=?").bind(uid(),JSON.stringify(event),id),
            env.DB.prepare("INSERT OR IGNORE INTO p_records(business,kind,id,revision,value) VALUES('main','audit',?,?,?)").bind('agreement-reminder:'+id,uid(),JSON.stringify({ id:'agreement-reminder:'+id, actor:'system',email:'',action:'agreement-reminder',record:agreement.id,at:event.at,reminder:id,agreementVersion:agreement.version,outcome:event.outcome.status }))
        ]);
        events.push(event);
    }
    return { events };
}
