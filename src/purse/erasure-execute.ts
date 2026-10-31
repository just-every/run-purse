import { retainedEvidence } from './invoice-evidence-crypto.mjs';
import type { Bindings } from '../auth.server';
import { retireD1ImportCustody } from '../modules/import-kit/src/d1/index';
import type { D1Sql } from '../modules/import-kit/src/d1/types';
import { targets } from './import-target';
import { authority } from './store';
import { ensureSearchStorage } from './search-storage';
import { evidenceKey } from './invoice-evidence-history';
import { erasureSeal, erasureDigest, receiptPayload } from './erasure-journal.mjs';
import { erasureCheckpoint } from './erasure-checkpoint.mjs';
import { eraseNativeCopies } from './erasure-native';
import { all, audit, get, put, requireThat, type Actor, type Data, type State } from './types';
import type { ErasurePlan } from './erasure-plan';
import { erasureCoverage } from './erasure-coverage';
const sql=(sql:string,...params:any[]):D1Sql=>({sql,params});
export const erasureRetention='Purchasing, payable and tax history retained with anonymous references; no automatic destruction. TIN and bank values remain encrypted and owner reveal restricted.';
export async function executeErasure(env:Bindings,a:Actor,before:State,revision:number,plan:ErasurePlan,since:number) {
 const secret=evidenceKey(plan.state),native=await eraseNativeCopies(env,plan,a),auth=authority(a,true),at=new Date().toISOString();
 for(const row of plan.state.values())if(row.kind==='erasureReceipt'&&row.value.actor!==before.get('erasureReceipt:'+row.id)?.value.actor)row.value.seal=erasureSeal(secret,receiptPayload(row.value));
 const receipt:Data={id:plan.id,subject:plan.subject.kind,anonymousReference:plan.alias,actor:a.id,at,fields:plan.fields,affected:plan.affected,originals:plan.blobs,coverage:erasureCoverage(plan.fields),protectedMetadata:native.protectedMetadata,installationFields:native.installationFields,retained:erasureRetention,consent:'Owner explicitly reviewed this exact field inventory and withdrawal of related originals',phase:plan.blobs.length?'blobs':'complete'};
 receipt.sourceFacts=[];
 for(const row of plan.state.values()){
  if((['recurringScenario','recurringScenarioDraft','recurringDiscoveryNotice'].includes(row.kind)||row.kind==='agentRun'&&row.value.workflow==='recurring-discovery')&&row.value.sourceValuesErased===plan.id)receipt.sourceFacts.push({kind:row.kind,id:row.id,digest:erasureDigest(row.value)});
  if(row.kind==='agentRun'&&['AGENT-008','AGENT-004'].includes(row.value.agent)&&row.value.sourceValuesErased===plan.id)receipt.sourceFacts.push({kind:row.kind,id:row.id,digest:erasureDigest(row.value)});
  if(row.kind==='valueSeatImport'&&plan.state.get('attachment:'+row.value.attachment)?.value.erasure)receipt.sourceFacts.push({kind:row.kind,id:row.id,digest:erasureDigest(row.value)});
  const snapshots=(v:any):void=>{if(!v||typeof v!=='object')return;if(v.fingerprint&&v.sources&&v.assessment)receipt.sourceFacts.push({kind:'valueSnapshot',id:v.fingerprint,digest:erasureDigest(Object.fromEntries(['request','revision','requester','promise','sources','assessment','mode','model','provider'].map(k=>[k,v[k]])))});for(const child of Object.values(v))snapshots(child);};
  if(['agentRun','valueConfirmation','valueCheckin'].includes(row.kind))snapshots(row.value);
 }
 receipt.invoices=all(plan.state,'invoice').filter(i=>i.sourceValuesErased===plan.id).map(i=>({id:i.id,hash:i.evidenceHash,evidence:erasureDigest(i.evidence),retained:erasureDigest(retainedEvidence(i))}));
 receipt.seal=erasureSeal(secret,receiptPayload(receipt));put(plan.state,'erasureReceipt',receipt.id,receipt);
 audit(plan.state,a,'personal-data-erasure',receipt.id,{subject:receipt.subject,anonymousReference:receipt.anonymousReference,fields:receipt.fields.length,originals:receipt.originals.length,retention:erasureRetention,consent:true});
 const statements:D1Sql[]=[sql(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM oa_step_up_challenges WHERE session_id=? AND operator_id=? AND operator_version=? AND consumed_at>=? AND consumed_at<=?) THEN 1 ELSE 0 END`,...auth.params,revision,a.session,a.id,a.version,since,Date.now()),...native.statements];
 for(const [key,row]of before)if(!plan.state.has(key))statements.push(sql('DELETE FROM p_records WHERE business=? AND kind=? AND id=?',row.business,row.kind,row.id));
 for(const [key,row]of plan.state)if(JSON.stringify(before.get(key))!==JSON.stringify(row))statements.push(sql('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value',row.business,row.kind,row.id,row.revision,JSON.stringify(row.value)));
 statements.push(sql(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) THEN 1 ELSE 0 END`,...auth.params),sql('DELETE FROM p_guard'));
 await ensureSearchStorage(env.DB);
 const checkpoint=await erasureCheckpoint(env.DB);
 const contains=(v:unknown)=>plan.subject.values.some(value=>JSON.stringify(v).toLowerCase().includes(value.toLowerCase()));
 // A synthetic target scopes contact retirement without deleting its supplier.
 const retirement=await retireD1ImportCustody({target:{kind:plan.subject.kind==='member'?'member':'supplierContact',id:plan.subject.kind==='member'?plan.subject.id:plan.alias},values:plan.subject.values,related:{source:contains,original:(bytes,original)=>contains([new TextDecoder().decode(bytes),original.name])}},statements,{destination:'main',namespace:'procurify',mappingVersion:'erasure-v1',storage:{database:env.DB as any,targets},authorization:{principalId:a.id,predicate:()=>authority(a,true)},originalErasurePolicy:'withdraw-affected-artifacts'},checkpoint);
 return {...await finishErasure(env,a,receipt.id),importCustody:{records:retirement.recordsErased,jobs:retirement.jobsRetired,streams:retirement.streamsRetired}};
}
/** Data stops being readable at the transaction above. A failed blob delete
 * stays resumable and blocks export; it never reports completed destruction. */
export async function finishErasure(env:Bindings,a:Actor,id:string) {
 const row=await env.DB.prepare("SELECT value FROM p_records WHERE kind='erasureReceipt' AND id=?").bind(id).first<{value:string}>();requireThat(row,'Erasure receipt not found',404);
 const receipt=JSON.parse(row.value);if(receipt.phase==='complete')return receipt;
 try { if(receipt.originals.length)await env.ORIGINALS.delete(receipt.originals); }
 catch { return {...receipt,notice:'Private source deletion is pending. Resume this receipt before exporting.'}; }
 receipt.phase='complete';const auth=authority(a,true);
 await env.DB.batch([env.DB.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) THEN 1 ELSE 0 END`).bind(...auth.params),env.DB.prepare("UPDATE p_records SET value=? WHERE kind='erasureReceipt' AND id=?").bind(JSON.stringify(receipt),id),env.DB.prepare('DELETE FROM p_guard')]);return receipt;
}
