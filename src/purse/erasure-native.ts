import type { Bindings } from '../auth.server';
import { decryptProtected, encryptProtected, protectedRows } from './protected-crypto';
import type { D1Sql } from '../modules/import-kit/src/d1/types';
import type { ErasurePlan } from './erasure-plan';
import { requireThat, type Actor, type Data } from './types';
const sql=(sql:string,...params:any[]):D1Sql=>({sql,params});
export async function eraseNativeCopies(env:Bindings,plan:ErasurePlan,a:Actor) {
 const statements:D1Sql[]=[],installationFields:Data[]=[],db=env.DB,operator=plan.subject.operator;
 if(operator) {
  installationFields.push({store:'native identity',fields:['email','display name','external identity links','SCIM links','sessions and outstanding credentials']});
  requireThat(operator!==a.id,'Cannot erase the current owner',409);
  statements.push(sql("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role!='owner') THEN 1 ELSE 0 END",operator),
   sql("UPDATE oa_operators SET email=?,display_name='Personal data erased',status='inactive',version=version+1 WHERE id=?",plan.email,operator),
   sql('UPDATE oa_sessions SET revoked_at=? WHERE operator_id=?',Date.now(),operator),
   sql('UPDATE oa_tokens SET revoked_at=? WHERE operator_id=?',Date.now(),operator),
   sql('UPDATE oa_credentials SET revoked_at=? WHERE operator_id=?',Date.now(),operator),
   sql('DELETE FROM oa_step_up_challenges WHERE operator_id=?',operator),
   sql('DELETE FROM oa_provider_sessions WHERE session_id IN (SELECT id FROM oa_sessions WHERE operator_id=?)',operator),
   sql('DELETE FROM oa_provider_session_pins WHERE session_id IN (SELECT id FROM oa_sessions WHERE operator_id=?)',operator),
   sql('DELETE FROM oa_external_identities WHERE operator_id=?',operator),
   sql('DELETE FROM p_scim_links WHERE operator_id=?',operator));
 }
 for(const row of plan.affected.filter(row=>row.kind==='crossTeamReview'))statements.push(sql('DELETE FROM p_cross_review_authority WHERE review=?',row.id));
 for(const value of plan.subject.values)statements.push(sql('DELETE FROM oa_limits WHERE instr(lower(key),lower(?))>0',value));
 for(const row of (await db.prepare('SELECT * FROM oa_auth_audit').all<Data>()).results) {
  const next=plan.scrub(row);if(JSON.stringify(next)!==JSON.stringify(row))statements.push(sql('UPDATE oa_auth_audit SET actor_id=?,value=? WHERE id=?',next.actor_id,next.value,row.id));
 }
 // Message bodies and idempotency responses are private copies too. Refusing
 // deleted capabilities never causes a replay to create a second purchase.
 for(const row of (await db.prepare('SELECT * FROM p_integration_requests').all<Data>()).results) {
  const response=plan.scrub(JSON.parse(row.response));
  if(JSON.stringify(response)!==row.response)statements.push(sql('UPDATE p_integration_requests SET response=? WHERE integration=? AND idempotency_key=?',JSON.stringify(response),row.integration,row.idempotency_key));
 }
 for(const row of (await db.prepare('SELECT * FROM p_integration_tokens').all<Data>()).results) {
  const next=plan.scrub(row);if(JSON.stringify(next)!==JSON.stringify(row))statements.push(sql('UPDATE p_integration_tokens SET requester=?,requester_email=?,name=?,revoked_at=? WHERE id=?',next.requester,next.requester_email,next.name,new Date().toISOString(),row.id));
 }
 for(const row of (await db.prepare('SELECT sequence,message FROM rer_mail_development_outbox').all<Data>()).results) {
  if(JSON.stringify(plan.scrub(row.message))!==JSON.stringify(row.message))statements.push(sql('DELETE FROM rer_mail_development_outbox WHERE sequence=?',row.sequence));
 }
 for(const message of plan.affected.filter(r=>r.kind==='orderThreadMessage'))statements.push(sql('DELETE FROM p_order_thread_routes WHERE thread=?',message.id));
 for(const send of plan.affected.filter(r=>r.kind==='orderSend'))statements.push(sql('DELETE FROM p_order_send_links WHERE send=?',send.id));
 for(const rfq of plan.affected.filter(r=>r.kind==='rfq'))statements.push(sql('DELETE FROM p_rfq_links WHERE rfq=?',rfq.id));
 if(plan.subject.supplier)statements.push(sql('DELETE FROM p_supplier_document_links WHERE supplier=?',plan.subject.supplier));
 let protectedMetadata=0;
 for(const row of await protectedRows(env)) {
  const payload=decryptProtected(env,row),next={...payload,reason:plan.scrub(payload.reason),evidence:plan.scrub(payload.evidence)};
  if(next.reason===payload.reason&&next.evidence===payload.evidence)continue;
  const encrypted=encryptProtected(env,row.supplier,row.field,next);protectedMetadata++;
  installationFields.push({store:'protected supplier metadata',supplier:row.supplier,field:row.field,fields:['reason','evidence reference']});
  statements.push(sql('UPDATE p_supplier_protected SET key_id=?,nonce=?,ciphertext=?,tag=? WHERE business=\'main\' AND supplier=? AND field=?',encrypted.key_id,encrypted.nonce,encrypted.ciphertext,encrypted.tag,row.supplier,row.field));
 }
 installationFields.push({store:'installation copies',fields:['matching auth audit identity','matching mail outbox entries','matching integration replay responses','affected supplier link capabilities','matching rate-limit identity']});
 return {statements,protectedMetadata,installationFields};
}
