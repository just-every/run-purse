
import assert from 'node:assert/strict';
import {harness} from './purse-harness.mjs';
import {createPortability} from '@runeditrun/rer/modules/portability';
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import {join} from 'node:path';
import {reauthenticateErasure} from './erasure-flow.mjs';
import {budgetFixture,email} from './budget-import-fixture.mjs';

export async function budget_importFlow(){
{
 // Reviewed native budgets bind bytes, mapping and authority; unchanged imports write nothing
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const h=await harness();try {
  const f=await budgetFixture(h),before=await h.state(),rows=await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all(),meta=await h.db.prepare('SELECT revision FROM p_meta').all();
  assert.equal((await h.send('/api/purse/budget-import/preview',f.input)).status,401);
  assert.equal((await h.send('/api/purse/budget-import/columns',f.input)).status,401);
  const foreign=await h.mf.dispatchFetch(h.origin+'/api/purse/budget-import/preview',{method:'POST',headers:{origin:'https://synthetic-purse-2512.invalid',cookie:h.owner,'content-type':'application/json'},body:JSON.stringify(f.input)});assert.equal(foreign.status,403);
  const review=await f.preview(f.input);
  assert.deepEqual((await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results,rows.results,'Preview writes no records');
  assert.deepEqual((await h.db.prepare('SELECT revision FROM p_meta').all()).results,meta.results,'Preview writes no state revision');
  assert.deepEqual(review.rows.map(row=>[row.currency,row.amountMinor]),[['USD',100001],['EUR',120023]]);
  await f.commit(review,{csv:f.input.csv.replace('1000.01','1000.02')},409);
  await f.commit(review,{csv:f.input.csv.replaceAll('\n','\r\n')},409);
  const bom=await f.preview({...f.input,csv:'\uFEFF'+f.input.csv});assert.deepEqual(bom.rows,review.rows);assert.notEqual(bom.sourceHash,review.sourceHash);
  await f.commit(review,{csv:'\uFEFF'+f.input.csv},409);
  await f.commit(review,{mapping:{...f.input.mapping,budgets:{...f.input.mapping.budgets,unused:f.usd.id}}},409);
  await f.commit(review,{mapping:{...f.input.mapping,dimensions:{...f.input.mapping.dimensions,location:{DEN:'Austin'}}}},400);
  await f.commit(review,{review:'0'.repeat(64)},409);
  await f.commit(review,{consent:false},400);
  await f.preview(f.input,403,f.outside);
  await f.commit(review,{},403,f.outside);
  await h.command('member',{email:email(2506),name:'New member after review',roles:['requester'],active:true});
  await f.commit(review,{},409);
  for(const [input,status] of [
   [{...f.input,csv:f.input.csv.replace('USD','EUR')},400],
   [{...f.input,csv:f.input.csv.replace('1000.01','1000.001')},400],
   [{...f.input,mapping:{...f.input.mapping,owners:{Steward:email(2599)}}},400],
   [{...f.input,mapping:{...f.input.mapping,dimensions:{...f.input.mapping.dimensions,project:{Office:'Other'}}}},400],
   [{...f.input,csv:f.input.csv.replace('80;95','0')},400],
  ]) await f.preview(input,status);
  const fresh=await f.preview(f.input);assert.equal((await f.commit(fresh)).changes,2);
  const after=(await h.state()).data;
  for(const policy of [f.usd,f.eur]){const actual=after.policy.find(row=>row.id===policy.id),prior=before.data.policy.find(row=>row.id===policy.id);assert.deepEqual({...actual,budgetMinor:prior.budgetMinor},prior,'Import preserves all approval authority and coding');}
  assert.deepEqual(after.budgetAssignment.map(row=>[row.policy,row.ownerEmail,row.thresholds]).sort(),[[f.usd.id,email(2503),[80,95]],[f.eur.id,email(2503),[80]]].sort());
  await f.commit(fresh,{},409);
  const repeat=await f.preview(f.input),snapshot=(await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results;
  const beforeRepeatRevision=(await h.db.prepare('SELECT revision FROM p_meta').all()).results;
  assert.equal((await f.commit(repeat)).changes,0);
  assert.deepEqual((await h.db.prepare('SELECT revision FROM p_meta').all()).results,beforeRepeatRevision,'Unchanged re-import does not write the database revision');
  assert.deepEqual((await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results,snapshot,'Unchanged re-import writes no product records or audit');
  const events=(await h.send('/api/purse/audit',undefined,h.owner)).value.events.filter(event=>event.action==='budget-import');
  assert.equal(events.length,2);assert.deepEqual(events.map(event=>[event.beforeMinor,event.afterMinor]).sort(),[[200000,100001],[200000,120023]].sort());
  const exported=await h.send('/api/purse/audit.csv',undefined,h.owner);assert.equal(exported.status,200);assert.ok(exported.value.includes('budget-import'));assert.ok(exported.value.includes(review.sourceHash));
  const signedOutReview=await f.preview(f.input);assert.equal((await h.send('/auth/signout',{},h.owner)).status,204);
  await f.commit(signedOutReview,{},401);
 }finally{await h.close();}

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // Budget owner sees scoped totals and a single threshold crossing without acquiring approval authority
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const h=await harness();try {
  const f=await budgetFixture(h);await f.commit(await f.preview(f.input));
  const own=(await h.state(f.owner)).data;
  assert.deepEqual(own.periodBudgets.map(row=>[row.currency,row.amountMinor]).sort(),[['EUR',120023],['USD',100001]]);
  assert.equal((await h.state(f.outside)).data.periodBudgets.length,0);
  await f.purchase(79000);assert.equal((await h.state(f.owner)).data.budgetAlerts.length,0);
  const request=await f.purchase(1001);
  const read=(await h.state(f.owner)).data,alert=read.budgetAlerts;
  const firstAlertRows=(await h.db.prepare("SELECT * FROM p_records WHERE kind='budgetAlert'").all()).results;
  assert.deepEqual(alert.map(row=>[row.policy,row.percent,row.usedMinor,row.amountMinor,row.currency]),[[f.usd.id,80,80001,100001,'USD']]);
  await h.command('decision',{id:request.id,revision:1,decision:'approved',reason:'Budget owner is not an approver'},f.owner,403);
  await h.command('decision',{id:request.id,revision:1,decision:'approved',reason:'Current approver confirms the request'},f.approver);
  await f.commit(await f.preview(f.input));await f.commit(await f.preview(f.input));
  assert.equal((await h.state(f.owner)).data.budgetAlerts.length,1);
  assert.deepEqual((await h.db.prepare("SELECT * FROM p_records WHERE kind='budgetAlert'").all()).results,firstAlertRows);
  assert.equal((await h.send('/api/purse/audit',undefined,h.owner)).value.events.filter(event=>event.action==='budget-threshold').length,1,'Repeated evaluation adds no duplicate alert or delivery event');
  await f.purchase(15000,'Configured second threshold');
  assert.deepEqual((await h.state(f.owner)).data.budgetAlerts.map(row=>[row.percent,row.usedMinor,row.currency]).sort((a,b)=>a[0]-b[0]),[[80,80001,'USD'],[95,95001,'USD']],'Each configured percentage fires separately');
  assert.equal((await h.state(f.outside)).data.budgetAlerts.length,0);
  await h.command('member',{email:email(2503),name:'Budget steward',grants:[{role:'finance-viewer',scope:{departments:['Research']}}],active:true});
  const revoked=(await h.state(f.owner)).data;assert.equal(revoked.periodBudgets.length,0);assert.equal(revoked.budgetAlerts.length,0);
  const review=await f.preview(f.input);await h.command('member',{email:email(2503),name:'Budget steward',roles:['finance-viewer'],active:false});
  await f.commit(review,{},400);
  await f.preview(f.input,400);
 }finally{await h.close();}

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // Budget assignments and threshold history survive restore without reviving erased owners or review authority
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const h=await harness();let restored;
 try {
  const f=await budgetFixture(h);await f.commit(await f.preview(f.input));await f.purchase(80001);
  const expiredReview=await f.preview(f.input);
  const service=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability});
  const before=join(h.dir,'synthetic-purse-2510.rer');await exportArchive(service,before,[]);
  restored=await harness();const target=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});await importArchive(target,before,[]);
  const originalRows=async db=>(await db.prepare("SELECT * FROM p_records WHERE kind IN ('budgetAssignment','budgetAlert') ORDER BY kind,id").all()).results;
  assert.deepEqual(await originalRows(restored.db),await originalRows(h.db),'Actual archive retains exact assignments and notification history');
  await restored.command('budget-import-commit',{...f.input,fingerprint:expiredReview.fingerprint,review:expiredReview.review,consent:true},restored.owner,409);
  await h.command('member',{email:email(2503),name:'Budget steward',roles:['finance-viewer'],active:false});
  await reauthenticateErasure(h);
  const meta=(await h.send('/api/purse/erasure',undefined,h.owner)).value;
  const review=await h.send('/api/purse/erasure/preview',{kind:'member',id:email(2503),revision:meta.revision},h.owner);assert.equal(review.status,200,JSON.stringify(review.value));
  assert.ok(review.value.fields.some(field=>field.kind==='budgetAssignment'));assert.ok(review.value.fields.some(field=>field.kind==='budgetAlert'));
  const erased=await h.send('/api/purse/erasure/execute',{...review.value.subject,revision:review.value.revision,review:review.value.review,fingerprint:review.value.fingerprint,consent:true},h.owner);assert.equal(erased.status,200,JSON.stringify(erased.value));
  assert.equal((await h.send('/api/purse/state',undefined,f.owner)).status,401,'Erased native session cannot read budget history');
  const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.ok(!JSON.stringify(rows).includes(email(2503)));assert.ok(!JSON.stringify(rows).includes('Budget steward'));
  await f.commit(expiredReview,{},400);
  const after=join(h.dir,'synthetic-purse-2511.rer');await exportArchive(service,after,[]);
  await restored.close();restored=await harness({empty:true});const erasedTarget=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});
  await assert.rejects(importArchive(erasedTarget,before,[],after),/erasure_epoch/);
  await importArchive(erasedTarget,after,[]);
  const history=await originalRows(restored.db);assert.equal(history.filter(row=>row.kind==='budgetAlert').length,1);assert.ok(!JSON.stringify(history).includes(email(2503)));
 }finally{await restored?.close();await h.close();}

 } finally {for(const close of cleanups.reverse())await close();}
}
}
