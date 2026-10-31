import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { readStream, verifyWebhook } from '../inbound-mail.server.mjs';
import { notificationId } from './notification-preferences';
import { notificationView } from './notifications';
import { load } from './store';
import { all, requireThat, roles, uid, type Actor, type Data } from './types';

const statuses: Data = {'email.sent':'accepted','email.delivery_delayed':'deferred','email.delivered':'delivered','email.bounced':'bounced','email.failed':'failed','email.suppressed':'rejected','email.complained':'complained'};
const terminal = new Set(['delivered','bounced','failed','rejected','complained']);
export const notificationMailApi = new Hono<{Bindings:Bindings}>();
/** A provider signature authenticates receipt only. Message, recipient and current source authority must also match. */
notificationMailApi.post('/api/purse/notification-mail-events',async c => {
    const env=runtimeBindings(c.env);
    requireThat(env.MAIL_PROVIDER==='resend' && env.NOTIFICATION_WEBHOOK_SECRET,'Notification mail events are not configured',503);
    const raw=await readStream(c.req.raw.body,65536);
    requireThat(await verifyWebhook({provider:'resend',rawBody:raw,headers:c.req.raw.headers,key:env.NOTIFICATION_WEBHOOK_SECRET,now:Date.now()}),'Invalid notification event signature',401);
    let event:Data;
    try { event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)); } catch { requireThat(false,'Invalid notification event'); }
    requireThat(event! && typeof event==='object' && !Array.isArray(event),'Invalid notification event');
    const providerStatus=Object.hasOwn(statuses,event!.type)?statuses[event!.type]:undefined, message=event!.data?.email_id, recipients=event!.data?.to, occurredAt=Date.parse(event!.created_at);
    requireThat(providerStatus && typeof message==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(message) && Array.isArray(recipients) && recipients.length===1 && typeof recipients[0]==='string' && Number.isFinite(occurredAt) && occurredAt<=Date.now()+300000,'Unsupported notification delivery event');
    const {state,revision}=await load(env.DB);
    const deliveries=all(state,'notificationDelivery').filter(d => d.provider==='resend' && d.providerMessageId===message && !d.erasure);
    requireThat(deliveries.length && new Set(deliveries.map(d=>d.recipient)).size===1,'Unknown notification delivery',403);
    const native=await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE id=? AND status='active'").bind(deliveries[0].recipient).first<Data>();
    requireThat(native && recipients[0]===native.email,'Notification recipient unavailable',403);
    const a:Actor={...native,owner:native.role==='owner',session:'',dev:false} as Actor;
    requireThat(roles(state,a).length && deliveries.every(d => {const n=state.get('notification:'+d.notification)?.value;return n && notificationView(state,a,n).canRead;}),'Notification source unavailable',403);
    const id=notificationId(['resend-event',c.req.header('svix-id')]), fingerprint=notificationId([...raw]);
    const previous=state.get('notificationMailEvent:'+id)?.value;
    if(previous){requireThat(previous.fingerprint===fingerprint,'Notification event identity conflict',409);return c.json({received:true,duplicate:true},202);}
    const receipt={id,recipient:a.id,batch:deliveries[0].batch,provider:'resend',providerMessageId:message,status:providerStatus,occurredAt,fingerprint};
    const statements=[env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(revision,a.id,a.version),
        env.DB.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main','notificationMailEvent',?,?,?)").bind(id,uid(),JSON.stringify(receipt))];
    for(const d of deliveries) if((!terminal.has(d.providerStatus) || terminal.has(providerStatus)) && occurredAt>=(d.providerOccurredAt??0))
        statements.push(env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.providerStatus',?,'$.providerOccurredAt',?) WHERE business='main' AND kind='notificationDelivery' AND id=?").bind(uid(),providerStatus,occurredAt,d.id));
    statements.push(env.DB.prepare('DELETE FROM p_guard'));
    try {await env.DB.batch(statements);} catch(error){requireThat(!/CHECK constraint|UNIQUE constraint/.test(String(error)),'Notification state changed; retry the event',409);throw error;}
    return c.json({received:true},202);
});
