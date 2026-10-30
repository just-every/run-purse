import { runNotificationNudges } from './notification-nudges';
import type { Bindings } from '../auth.server';
import { operatorMail } from '../mail.server.mjs';
import { notificationView } from './notifications';
import { notificationDue, notificationId, notificationPreference, notificationQuietAt } from './notification-preferences';
import { load } from './store';
import { all, roles, uid, type Actor, type Data } from './types';

/** One durable claim per source notification. Interrupted or uncertain sends are never automatically repeated. */
export async function runNotificationDeliveries(env: Bindings, now = Date.now()) {
    await runNotificationNudges(env,now);
    const {state} = await load(env.DB);
    const operators = (await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE status='active'").all<Data>()).results;
    const groups = new Map<string,{a:Actor;p:Data;items:Data[]}>();
    for (const o of operators) {
        const a: Actor = {id:o.id,email:o.email,owner:o.role==='owner',version:o.version,session:'',dev:false};
        if (!roles(state,a).length) continue;
        const p = notificationPreference(state,a);
        // No outbound effect without the recipient's explicit native choice.
        if (!p.version) continue;
        for (const n of all(state,'notification').filter(n => n.recipient === a.id && n.deliveryConsent && !n.erasure && !state.has('notificationDelivery:' + notificationId(['delivery',n.id])))) {
            const urgent = state.get('notificationUrgency:' + n.type)?.value.urgent === true;
            const due = notificationDue(n.at,p,urgent);
            // Pending notices follow the recipient's quiet hours at dispatch, including after a cadence change.
            if (due > now || !urgent && notificationQuietAt(p,now)) continue;
            const key = notificationId([a.id,p.version,urgent ? n.id : p.cadence === 'daily' ? due : n.id]);
            const group = groups.get(key) ?? {a,p,items:[]}; group.items.push(n); groups.set(key,group);
        }
    }
    const events: Data[] = [];
    // Re-load after every group: each claim advances the domain revision.
    for (const [batch,group] of groups) {
        const {state:current,revision:currentRevision} = await load(env.DB), {a,p} = group;
        const live = await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE id=? AND version=? AND status='active'").bind(a.id,a.version).first<Data>();
        if (!live || !roles(current,a).length || notificationPreference(current,a).version !== p.version) continue;
        const items = group.items.filter(n => !current.has('notificationDelivery:' + notificationId(['delivery',n.id])));
        if (!items.length) continue;
        const eligible = items.filter(n => { const v=notificationView(current,a,n); return v.canRead && !n.dismissed && (!['approval-needed','approver-nudge','receipt-needed'].includes(n.type) || v.actionable); });
        const at = new Date(now).toISOString();
        const rows = items.map(n => ({id:notificationId(['delivery',n.id]),notification:n.id,recipient:a.id,preferenceVersion:p.version,
            channel:p.channel,cadence:p.cadence,batch,count:eligible.length,at,status:'uncertain',code:'claimed'}));
        const statements = [env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END`).bind(currentRevision,a.id,a.version),
            ...rows.map(row => env.DB.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main','notificationDelivery',?,?,?)").bind(row.id,uid(),JSON.stringify(row))),env.DB.prepare('DELETE FROM p_guard')];
        try { await env.DB.batch(statements); } catch (error) { if (/CHECK constraint|UNIQUE constraint/.test(String(error))) continue; throw error; }
        // Recheck source authorization and preference after claiming, immediately before any external effect.
        const {state:fresh,revision:freshRevision} = await load(env.DB);
        const currentItems = eligible.filter(n => notificationView(fresh,a,n).canRead);
        const valid = roles(fresh,a).length && notificationPreference(fresh,a).version === p.version;
        const fence = await env.DB.prepare("SELECT 1 AS ok WHERE (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active')").bind(freshRevision,a.id,a.version).first();
        let status = 'suppressed', code = 'source-unavailable', provider: string|null=null, providerMessageId: string|null=null;
        if (valid && fence && currentItems.length) {
            code = 'in-app';
            if (p.channel === 'in-app') status = 'available';
            else if (p.channel !== 'email') { status='unavailable'; code='channel-not-connected'; }
            else {
                const sender = operatorMail(env);
                status='unavailable'; code='mail-not-configured';
                if (sender && env.MAIL_FROM) {
                    try {
                        const result = await sender.send({deliveryId:'notification:'+batch,from:env.MAIL_FROM,to:[live.email],
                            subject:p.cadence==='daily' ? 'Your Purse daily digest' : 'Your Purse notification',
                            text:`${currentItems.length} purchasing notification${currentItems.length===1?'':'s'} available. Sign in to see current authorized details: ${new URL('/app',env.AUTH_ORIGIN).href}`,
                            html:'',headers:{}});
                        status=result.status==='development'?'suppressed':['accepted','uncertain','rejected','rate_limited'].includes(result.status)?result.status:'unavailable';
                        code=result.status==='development'?'local-mail-suppressed':'mail-provider';
                        provider=result.provider; providerMessageId=typeof result.providerMessageId==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(result.providerMessageId)?result.providerMessageId:null;
                    } catch { status='uncertain'; code='mail-outcome-unknown'; }
                }
            }
        }
        const updates = rows.map(row => {
            const served = valid && fence && currentItems.some(n => n.id===row.notification);
            const value = {...row,status:served?status:'suppressed',code:served?code:'source-unavailable',provider:served?provider:null,providerMessageId:served?providerMessageId:null};
            events.push(value);
            // JSON updates preserve concurrent erasure and never restore a scrubbed recipient.
            return env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.status',?,'$.code',?,'$.provider',?,'$.providerMessageId',?) WHERE business='main' AND kind='notificationDelivery' AND id=?").bind(uid(),value.status,value.code,value.provider,value.providerMessageId,row.id);
        });
        await env.DB.batch(updates);
    }
    return {events};
}
