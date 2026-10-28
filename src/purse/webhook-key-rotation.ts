import type { Bindings } from '../auth.server';
import { decryptWebhook, encryptWebhook } from './webhooks';
import { requireThat, type Data } from './types';
const rows=async(env:Bindings)=>(await env.DB.prepare('SELECT * FROM p_webhooks ORDER BY id').all<Data>()).results;
const guard=(env:Bindings,r:Data)=>env.DB.prepare('INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM p_webhooks WHERE id=? AND generation=? AND key_id=? AND nonce=? AND ciphertext=? AND tag=?) THEN 1 ELSE 0 END').bind(r.id,r.generation,r.key_id,r.nonce,r.ciphertext,r.tag);
export async function webhookKeyState(env:Bindings){
 const stored=await rows(env);let unreadable=0,awaitingRotation=0;
 for(const row of stored)try{const secret=decryptWebhook(env,row);if(row.key_id!==encryptWebhook(env,row.id,secret).key_id)awaitingRotation++;}catch{unreadable++;}
 return {stored:stored.length,unreadable,awaitingRotation};
}
export async function rotateWebhookKeys(env:Bindings){
 const stored=await rows(env),replacements=stored.map(row=>{const secret=decryptWebhook(env,row),envelope=encryptWebhook(env,row.id,secret);requireThat(secret===decryptWebhook(env,{...row,...envelope}),'Webhook key rotation check failed',503);return {row,envelope};});
 return {checked:stored.length,statements:replacements.flatMap(({row,envelope})=>[guard(env,row),env.DB.prepare('UPDATE p_webhooks SET key_id=?,nonce=?,ciphertext=?,tag=? WHERE id=?').bind(envelope.key_id,envelope.nonce,envelope.ciphertext,envelope.tag,row.id)])};
}
export async function discardUnreadableWebhookKeys(env:Bindings){
 const unreadable=(await rows(env)).filter(row=>{try{decryptWebhook(env,row);return false;}catch{return true;}});
 return {discarded:unreadable.length,statements:unreadable.flatMap(row=>[guard(env,row),env.DB.prepare('DELETE FROM p_webhook_attempts WHERE subscription=?').bind(row.id),env.DB.prepare('DELETE FROM p_webhooks WHERE id=?').bind(row.id)])};
}
