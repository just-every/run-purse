import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makePart, ContentVerifier, ArchiveVerifier } from '@runeditrun/rer/modules/portability/format';
import { command } from './browser-runtime.mjs';
import { session, current, api } from './browser-journey.mjs';
import { readDevKey } from '../src/modules/operator-auth/dev/sign-in-as.mjs';

export const records = async path => (await readFile(path,'utf8')).trim().split('\n').map(line => JSON.parse(line));
export const rows = archive => archive.filter(r => r.kind === 'part').flatMap(r => r.items);

export async function rejectSemanticArchives(root, archive) {
 await command(root,['export','--output','exports/empty-before.rer']);
 const empty=rows(await records(join(root,'exports/empty-before.rer')));
 for (const kind of ['request','order','receipt','invoice','attachment']) {
  const input=await records(archive);
  const item=rows(input).find(r => r.table === 'p_records' && r.row.kind === kind && !JSON.parse(r.row.value).imported);
  assert.ok(item, 'Fixture has native '+kind); const value=JSON.parse(item.row.value);
  if (kind === 'request') value.supplier='missing-supplier';
  if (kind === 'order') value.request='missing-request';
  if (kind === 'receipt') value.line='missing-line';
  if (kind === 'invoice') value.allocations[0].line='missing-line';
  if (kind === 'attachment') value.record='missing-record';
  item.row.value=JSON.stringify(value);
  const verifier=new ContentVerifier(input[0]), archiveVerifier=new ArchiveVerifier(input[0]);
  for (let i=1;i<input.length-1;i++) { input[i]=await makePart(input[i].index,input[i].items); archiveVerifier.add(input[i]); for (const row of input[i].items) verifier.add(row); }
  input.at(-1).contentHash=verifier.digest();
  input.at(-1).archiveHash=archiveVerifier.digest();
  await writeFile(join(root,'exports/semantic-'+kind+'.rer'),input.map(JSON.stringify).join('\n')+'\n',{mode:0o600});
  const log=await command(root,['import','--input','exports/semantic-'+kind+'.rer','--yes'],{expected:4});
  assert.match(log,/purse_/, 'Product semantic staging refused '+kind);
  await command(root,['export','--output','exports/empty-after-'+kind+'.rer']);
  assert.deepEqual(rows(await records(join(root,'exports/empty-after-'+kind+'.rer'))),empty,'Refused '+kind+' archive left every portable destination row unchanged');
 }
}

export async function pendingImport(context,origin) {
 const input={filename:'continuation.csv',csv:'kind,sourceId,name,status\n'+Array.from({length:45},(_,i)=>`supplier,continuation-${i},Continuation supplier ${i},active\n`).join(''),mapping:{columns:{},decimal:'.',date:'YYYY-MM-DD',statuses:{active:'active'}}};
 const post=async (op,body) => { const r=await context.request.post(origin+'/api/purse/import/'+op,{headers:{origin},data:body}); const b=await r.json(); assert.equal(r.status(),200,JSON.stringify(b)); return b; };
 const preview=await post('preview',input),result=await post('commit',{...input,fingerprint:preview.plan.fingerprint});
 assert.ok(result.job.checkpoint < result.job.total, 'Fixture retains a resumable job');
 return result.job;
}

export async function restoredContinuation(browser,root,origin,owner,before,evidence) {
 const {actor:ownerActor,data}=await current(owner.context,origin);
 const job=data.importJobs.find(j=>j.checkpoint<j.total); assert.ok(job);
 const body={id:job.id,mappingVersion:job.mappingVersion};
 const post=(context,op,input=body)=>context.request.post(origin+'/api/purse/import/'+op,{headers:{origin},data:input});
 assert.ok(job.canClaim); assert.equal(job.canResume,false);
 for (const op of ['status','resume','undo']) assert.notEqual((await post(owner.context,op)).status(),200,'Explicit custody required for '+op);
 const signedOut=await browser.newContext();
 for(const op of ['claim','status','resume','undo']) assert.equal((await post(signedOut,op)).status(),401);
 await signedOut.close();
 const receiver=await session(browser,root,origin,'receiver',1440);
 for(const op of ['claim','status','resume','undo']) assert.equal((await post(receiver.context,op)).status(),403);
 await receiver.context.close();
 await owner.page.reload(); await owner.page.getByRole('navigation').getByRole('button',{name:'Imports',exact:true}).click();
 await owner.page.getByRole('listitem').filter({hasText:job.id}).getByRole('button',{name:'Take custody of restored batch'}).click();
 await owner.page.getByRole('heading',{name:'Batch '+job.id,exact:true}).waitFor();
 let response=await post(owner.context,'status');assert.equal(response.status(),200);const status=await response.json();assert.ok(status.originals[0].original.base64);assert.equal(status.job.principalId,job.principalId,'Original principal preserved');
 await owner.page.getByRole('button',{name:'Resume / refresh',exact:true}).click();
 await owner.page.getByText('completed · 45 / 45',{exact:true}).waitFor();
 response=await post(owner.context,'status');assert.equal((await response.json()).job.state,'completed');
 await owner.page.screenshot({path:join(evidence,'restored-import-custody.png'),fullPage:true});
 await owner.page.getByRole('button',{name:'Undo untouched imported records',exact:true}).click();
 await owner.page.getByText('undoing · 45 / 45',{exact:true}).waitFor();
 await owner.page.getByRole('button',{name:'Resume / refresh',exact:true}).click();
 await owner.page.getByText('undone · 45 / 45',{exact:true}).waitFor();
 response=await post(owner.context,'status');const undone=await response.json();assert.equal(undone.job.state,'undone');assert.ok(undone.undo.dispositions.length);
 assert.equal((await current(owner.context,origin)).data.supplier.filter(s=>s.sourceId?.startsWith('continuation-')).length,0);
 // A second genuine native owner gets no cross-owner continuation grant.
 // The local outbox is read through its ordinary authenticated HTML surface.
 const headers={'x-rer-dev-key':await readDevKey(root)};
 const confirmationToken=async email=>{
  const outbox=await owner.context.request.get(origin+'/__dev/outbox',{headers});
  assert.equal(outbox.status(),200); const html=await outbox.text();
  const article=[...html.matchAll(/<article>([\s\S]*?)<\/article>/g)].map(m=>m[1]).find(a=>a.includes(email));assert.ok(article);
  const path=article.match(/href="([^"]+)"/)[1].replaceAll('&amp;','&');
  const detail=await owner.context.request.get(origin+path,{headers});assert.equal(detail.status(),200);
  const link=new URL((await detail.text()).match(/href="([^"]*\/auth\/confirm\?token=[^"]+)"/)[1].replaceAll('&amp;','&'),origin);
  return link.searchParams.get('token');
 };
 const invitation={email:'other-restored-owner@example.test',displayName:'Other restored owner',role:'owner'};
 response=await owner.context.request.post(origin+'/auth/invite',{headers:{origin},data:invitation});assert.equal(response.status(),403);assert.equal((await response.json()).error,'step_up_required');
 response=await owner.context.request.post(origin+'/auth/step-up',{headers:{origin},data:{action:'owner:transfer'}});assert.equal(response.status(),202);
 response=await owner.context.request.post(origin+'/auth/confirm',{headers:{origin},data:{token:await confirmationToken(ownerActor.email)},maxRedirects:0});assert.equal(response.status(),303);assert.ok(!response.headers()['set-cookie'],'Step-up must preserve the requesting session');
 assert.equal((await current(owner.context,origin)).actor.id,ownerActor.id,'Step-up preserves the claiming owner');
 response=await owner.context.request.post(origin+'/auth/invite',{headers:{origin},data:invitation});assert.equal(response.status(),202);
 // The inviter uses a native local dev session, so Base deliberately tags its
 // invitation as a dev credential too. The receiving client must pass that
 // same real local gate; the invitation still creates a separate operator.
 const other=await browser.newContext({extraHTTPHeaders:headers});
 const accepted=await other.request.post(origin+'/auth/confirm',{headers:{origin},data:{token:await confirmationToken(invitation.email)},maxRedirects:0});assert.equal(accepted.status(),303);
 const otherActor=(await current(other,origin)).actor;assert.equal(otherActor.email,invitation.email);assert.ok(otherActor.roles.includes('owner'));assert.notEqual(otherActor.id,ownerActor.id);
 for(const op of ['claim','status','resume','undo'])assert.notEqual((await post(other,op)).status(),200,'Another owner cannot use claimed job: '+op);
 await other.close();
 const after=(await current(owner.context,origin)).data;assert.ok(after.audit.some(a=>a.action==='claim-restored-import'&&a.record===job.id&&a.originalPrincipal===job.principalId));
 // Old approval actors are history. A deliberate amendment obtains fresh
 // approval from the current native approver, then issues and receives normally.
 const old=before.order.find(o=>o.status==='prepared'&&!o.imported),request=before.request.find(r=>r.id===old.request);
 const stale=await owner.context.request.post(origin+'/api/purse/command/issue',{headers:{origin},data:{id:old.id,revision:old.revision,reason:'Old authority'}});assert.equal(stale.status(),409,'Restored old approval cannot issue with absent original operator');
 const originalDocument=await owner.context.request.get(origin+'/api/purse/download/order/'+old.id);assert.equal(originalDocument.status(),200);
 let amended=await api(owner.context,origin,'amend',{...request,reason:'Renew authority after restore',lines:request.lines.map(l=>({...l,quantity:String(Number(l.quantity)+1)}))});
 await api(owner.context,origin,'submit',{id:amended.id,revision:amended.revision});
 const approver=await session(browser,root,origin,'approver',1440);
 await api(approver.context,origin,'decision',{id:amended.id,revision:amended.revision,decision:'approved',reason:'Current owner installation reviewed amendment'});await approver.context.close();
 const order=await api(owner.context,origin,'convert',{id:amended.id,revision:amended.revision});await api(owner.context,origin,'issue',{id:order.id,revision:order.revision,reason:'Renewed current authority'});await api(owner.context,origin,'receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'1',reason:'Received after restore'});
 const final=(await current(owner.context,origin)).data;assert.equal(final.order.find(o=>o.id===old.id).issuedAt,old.issuedAt);assert.equal(final.order.find(o=>o.id===old.id).status,'superseded');assert.ok(final.receipt.some(r=>r.order===order.id));assert.ok(final.decision.some(d=>d.request===amended.id&&d.revision===amended.revision));
 const signedOutOwner=await owner.context.request.post(origin+'/auth/signout',{headers:{origin},data:{}});assert.equal(signedOutOwner.status(),204);
 for(const op of ['claim','status','resume','undo'])assert.equal((await post(owner.context,op)).status(),401,'Revoked claiming session cannot '+op);
 return {batch:job.id,restoredStatusResumeUndo:true,denied:['signed-out','receiver','other-owner','revoked-session'],renewedPurchase:order.id};
}

export async function preparedForRestore(browser,root,origin,owner) {
 const source=(await current(owner.context,origin)).data.request.find(r=>!r.imported);
 await api(owner.context,origin,'quote',{request:source.id,supplier:source.supplier,currency:source.currency,lines:source.lines,freightMinor:source.freightMinor,taxMinor:source.taxMinor,delivery:'2026-11-25',conditions:source.terms,source:'Supplied fixture quotation for archive custody'});
 const draft={...source,title:'Prepared before restore',lines:source.lines.map(({id,...l})=>l)};delete draft.id;delete draft.revision;
 const request=await api(owner.context,origin,'request',draft);await api(owner.context,origin,'submit',{id:request.id,revision:request.revision});
 const approver=await session(browser,root,origin,'approver',1440);
 await api(approver.context,origin,'decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Prepared for restore continuation'});await approver.context.close();
 return api(owner.context,origin,'convert',{id:request.id,revision:request.revision});
}
