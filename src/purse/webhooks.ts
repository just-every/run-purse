import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { actor, authority, load, readFence } from './store';
import { guardedBatch } from './integration-tokens';
import { insertRfqRecord } from './rfq-links';
import { newApiSecret } from './public-api-keys';
import { all, get, requireThat, text, uid, type Data, type State } from './types';

export const webhookTypes=['request.approved','po.issued'];
type Envelope={key_id:string;nonce:string;ciphertext:string;tag:string};
const material=(value?:string)=>{requireThat(/^[a-f0-9]{64}$/i.test(value??''),'Webhook installation key unavailable',503);const key=Buffer.from(value!,'hex');return {key,id:createHash('sha256').update(key).digest('hex')};};
const aad=(id:string,key:string)=>Buffer.from(JSON.stringify(['purse-webhook','main',id,key]));
export function encryptWebhook(env:Bindings,id:string,secret:string):Envelope{
 const key=material(env.PROTECTED_DATA_KEY),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key.key,nonce);cipher.setAAD(aad(id,key.id));
 return {key_id:key.id,nonce:Buffer.from(nonce).toString('base64'),ciphertext:Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]).toString('base64'),tag:Buffer.from(cipher.getAuthTag()).toString('base64')};
}
export function decryptWebhook(env:Bindings,row:Data){
 try{const active=material(env.PROTECTED_DATA_KEY),key=active.id===row.key_id?active:material(env.PROTECTED_DATA_PREVIOUS_KEY);requireThat(key.id===row.key_id,'Webhook key unavailable',503);const cipher=createDecipheriv('aes-256-gcm',key.key,Buffer.from(row.nonce,'base64'));cipher.setAAD(aad(row.id,key.id));cipher.setAuthTag(Buffer.from(row.tag,'base64'));return Buffer.concat([cipher.update(Buffer.from(row.ciphertext,'base64')),cipher.final()]).toString('utf8');}catch{requireThat(false,'Webhook installation key unavailable; rotate the subscription',503);}
}
const metadata=(r:Data)=>({id:r.id,name:r.name,endpoint:r.endpoint,events:JSON.parse(r.events),generation:r.generation,createdAt:r.created_at,revokedAt:r.revoked_at});
function endpoint(value:unknown){const input=text(value,'HTTPS receiver',1000);let url:URL;try{url=new URL(input);}catch{requireThat(false,'Use a public HTTPS receiver');}
 requireThat(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&(!url.port||url.port==='443')&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname)&&!/^\d+(?:\.\d+){3}$/.test(url.hostname)&&!/(^|\.)(localhost|local|internal|lan)$/i.test(url.hostname),'Use a public HTTPS receiver without credentials');return url.href;}
/** Enqueue transition identities in the same transaction as the domain write. */
export function webhookEvents(db:D1Database,before:State,after:State){
 const statements:D1PreparedStatement[]=[];
 for(const kind of ['request','order'])for(const row of all(after,kind)){
    const prior=before.get(kind+':'+row.id)?.value;
    const eligible=kind==='request'?row.status==='approved'&&prior?.status!=='approved':Boolean(row.issuedAt)&&row.issuedAt!==prior?.issuedAt;
    if(!eligible||row.imported||row.adoption)continue;
    const type=kind==='request'?'request.approved':'po.issued',id=type+':'+row.id+':'+row.revision;
    statements.push(db.prepare('INSERT OR IGNORE INTO p_webhook_events(id,type,kind,record,revision,at) VALUES(?,?,?,?,?,?)').bind(id,type,kind,row.id,row.revision,new Date().toISOString()));
 }
 return statements;
}
async function liveOwner(env:Bindings,row:Data){return env.DB.prepare("SELECT id FROM oa_operators WHERE id=? AND version=? AND status='active' AND role='owner'").bind(row.principal,row.operator_version).first();}
async function deliver(env:Bindings,subscription:Data,event:Data,replay=false){
 requireThat(!subscription.revoked_at&&await liveOwner(env,subscription),'Webhook authority ended',403);
 const {state,revision}=await load(env.DB),record=state.get(event.kind+':'+event.record)?.value;
 requireThat(record&&!record.erasure&&!record.erased&&record.requesterEmail!=='[erased]'&&!record.requester?.startsWith('erased-'),'Event source unavailable after erasure',410);
 // References only: replay cannot restore a snapshot or execute a purchasing action.
 const body=JSON.stringify({id:event.id,type:event.type,createdAt:event.at,data:{kind:event.kind,id:event.record,revision:event.revision}}),timestamp=String(Math.floor(Date.now()/1000));
 const signature=createHmac('sha256',decryptWebhook(env,subscription)).update(timestamp+'.'+body).digest('hex'),id=uid(),at=new Date().toISOString();
 await guardedBatch(env.DB,[env.DB.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM p_webhooks w JOIN oa_operators o ON o.id=w.principal WHERE w.id=? AND w.generation=? AND w.revoked_at IS NULL AND o.version=w.operator_version AND o.status='active' AND o.role='owner') AND (SELECT revision FROM p_meta WHERE id=1)=? AND (?=1 OR NOT EXISTS(SELECT 1 FROM p_webhook_attempts WHERE subscription=? AND event=?)) THEN 1 ELSE 0 END").bind(subscription.id,subscription.generation,revision,replay?1:0,subscription.id,event.id),env.DB.prepare("INSERT INTO p_webhook_attempts(id,subscription,event,generation,status,at) VALUES(?,?,?,?,'claimed',?)").bind(id,subscription.id,event.id,subscription.generation,at),cdelete(env)]);
 let status='uncertain',http:number|null=null;
 try{const response=await fetch(subscription.endpoint,{method:'POST',headers:{'content-type':'application/json','purse-event-id':event.id,'purse-timestamp':timestamp,'purse-signature':'v1='+signature},body,redirect:'manual',signal:AbortSignal.timeout(10000)});http=response.status;status=response.ok?'delivered':'failed';await response.body?.cancel();}catch{/* A claimed uncertain attempt is never retried automatically. */}
 await env.DB.batch([env.DB.prepare('UPDATE p_webhook_attempts SET status=?,http_status=? WHERE id=?').bind(status,http,id),insertRfqRecord(env.DB,'audit',{id:uid(),actor:subscription.principal,action:'webhook-attempt',record:event.record,subscription:subscription.id,event:event.id,outcome:status,httpStatus:http,at})]);
 return {id,event:event.id,status,httpStatus:http};
}
const cdelete=(env:Bindings)=>env.DB.prepare('DELETE FROM p_guard');
export async function runWebhooks(env:Bindings){
 const subscriptions=(await env.DB.prepare('SELECT * FROM p_webhooks WHERE revoked_at IS NULL ORDER BY id').all<Data>()).results;
 const result=[];
 for(const subscription of subscriptions){
    if(!await liveOwner(env,subscription))continue;
    const events=(await env.DB.prepare('SELECT e.* FROM p_webhook_events e WHERE e.at>=? AND NOT EXISTS(SELECT 1 FROM p_webhook_attempts a WHERE a.subscription=? AND a.event=e.id) ORDER BY e.at,e.id LIMIT 50').bind(subscription.created_at,subscription.id).all<Data>()).results;
    for(const event of events)if(JSON.parse(subscription.events).includes(event.type)){try{result.push(await deliver(env,subscription,event));}catch(error){result.push({event:event.id,status:'held'});}}
 }
 return result;
}
export const webhooksApi=new Hono<{Bindings:Bindings}>();
webhooksApi.get('/api/purse/webhooks',async c=>{
 const a=await actor(c.req.raw,c.env);requireThat(a.owner,'Current native owner required',403);const {revision}=await load(c.env.DB);
 const subscriptions=(await c.env.DB.prepare('SELECT * FROM p_webhooks ORDER BY created_at,id').all<Data>()).results.map(metadata);
 const attempts=(await c.env.DB.prepare('SELECT id,subscription,event,status,http_status,at FROM p_webhook_attempts ORDER BY at DESC LIMIT 100').all()).results;
 const events=(await c.env.DB.prepare('SELECT * FROM p_webhook_events ORDER BY at DESC LIMIT 100').all()).results;
 await readFence(c.env.DB,a,revision);return c.json({subscriptions,attempts,events,eventTypes:webhookTypes});
});
webhooksApi.post('/api/purse/webhooks',async c=>{
 const a=await actor(c.req.raw,c.env);requireThat(a.owner,'Current native owner required',403);const b=await c.req.json(),env=runtimeBindings(c.env);
 requireThat(b.consent===true,'Consent to sending record references to this receiver');requireThat(Array.isArray(b.events)&&b.events.length&&b.events.every((e:unknown)=>webhookTypes.includes(e as string)),'Choose supported events');
 const id=uid(),secret=newApiSecret(),at=new Date().toISOString(),row={id,name:text(b.name,'Subscription name',100),endpoint:endpoint(b.endpoint),events:JSON.stringify([...new Set(b.events)]),principal:a.id,operator_version:a.version,generation:1,created_at:at,revoked_at:null,...encryptWebhook(env,id,secret)},auth=authority(a,true);
 await guardedBatch(env.DB,[env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) THEN 1 ELSE 0 END`).bind(...auth.params),env.DB.prepare('INSERT INTO p_webhooks(id,name,endpoint,events,principal,operator_version,generation,key_id,nonce,ciphertext,tag,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(row.id,row.name,row.endpoint,row.events,row.principal,row.operator_version,row.generation,row.key_id,row.nonce,row.ciphertext,row.tag,at),insertRfqRecord(env.DB,'audit',{id:uid(),actor:a.id,action:'webhook-create',record:id,at}),cdelete(env)]);
 return c.json({subscription:metadata(row),secret});
});
webhooksApi.post('/api/purse/webhooks/:id/:action',async c=>{
 const a=await actor(c.req.raw,c.env);requireThat(a.owner,'Current native owner required',403);const action=c.req.param('action'),env=runtimeBindings(c.env);
 requireThat(['rotate','revoke','delete','replay'].includes(action),'Unknown webhook action',404);
 const row=await env.DB.prepare('SELECT * FROM p_webhooks WHERE id=?').bind(c.req.param('id')).first<Data>();requireThat(row&&(action==='delete'||!row.revoked_at),'Webhook unavailable',409);
 if(action==='replay'){
    const b=await c.req.json();text(b.reason,'Replay reason');const event=await env.DB.prepare('SELECT * FROM p_webhook_events WHERE id=?').bind(b.event).first<Data>();requireThat(event&&event.at>=row.created_at&&JSON.parse(row.events).includes(event.type),'Event unavailable to this subscription',404);
    await readFence(env.DB,a,(await load(env.DB)).revision);return c.json(await deliver(env,row,event,true));
 }
 const auth=authority(a,true),at=new Date().toISOString(),secret=action==='rotate'?newApiSecret():null,envelope=secret?encryptWebhook(env,row.id,secret):null;
 await guardedBatch(env.DB,[env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND EXISTS(SELECT 1 FROM p_webhooks WHERE id=? AND generation=? AND revoked_at IS ?) THEN 1 ELSE 0 END`).bind(...auth.params,row.id,row.generation,row.revoked_at),
 ...(action==='delete'?[env.DB.prepare('DELETE FROM p_webhook_attempts WHERE subscription=?').bind(row.id),env.DB.prepare('DELETE FROM p_webhooks WHERE id=?').bind(row.id)]:[envelope?env.DB.prepare('UPDATE p_webhooks SET key_id=?,nonce=?,ciphertext=?,tag=?,generation=generation+1,principal=?,operator_version=? WHERE id=?').bind(envelope.key_id,envelope.nonce,envelope.ciphertext,envelope.tag,a.id,a.version,row.id):env.DB.prepare('UPDATE p_webhooks SET revoked_at=? WHERE id=?').bind(at,row.id)]),
 insertRfqRecord(env.DB,'audit',{id:uid(),actor:a.id,action:'webhook-'+action,record:row.id,at}),cdelete(env)]);
 return c.json({...(secret?{secret}:{}),deleted:action==='delete',subscription:metadata({...row,generation:row.generation+(secret?1:0),revoked_at:action==='revoke'?at:row.revoked_at})});
});
webhooksApi.post('/api/purse/webhook-deliveries',async c=>{const a=await actor(c.req.raw,c.env);requireThat(a.owner,'Current native owner required',403);await readFence(c.env.DB,a,(await load(c.env.DB)).revision);return c.json({attempts:await runWebhooks(runtimeBindings(c.env))});});
