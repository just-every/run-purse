import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './purse-harness.mjs';
import {budgetFixture,email} from './budget-import-fixture.mjs';

test('Reviewed native budgets bind bytes, mapping and authority; unchanged imports write nothing',async()=>{
 const h=await harness();try {
  const f=await budgetFixture(h),before=await h.state(),rows=await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all(),meta=await h.db.prepare('SELECT revision FROM p_meta').all();
  const review=await f.preview(f.input);
  assert.deepEqual((await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results,rows.results,'Preview writes no records');
  assert.deepEqual((await h.db.prepare('SELECT revision FROM p_meta').all()).results,meta.results,'Preview writes no state revision');
  assert.deepEqual(review.rows.map(row=>[row.currency,row.amountMinor]),[['USD',100001],['EUR',120023]]);
  await f.commit(review,{csv:f.input.csv.replace('1000.01','1000.02')},409);
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
  assert.equal((await f.commit(repeat)).changes,0);
  assert.deepEqual((await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results,snapshot,'Unchanged re-import writes no product records or audit');
  const events=(await h.send('/api/purse/audit',undefined,h.owner)).value.events.filter(event=>event.action==='budget-import');
  assert.equal(events.length,2);assert.deepEqual(events.map(event=>[event.beforeMinor,event.afterMinor]).sort(),[[200000,100001],[200000,120023]].sort());
  const exported=await h.send('/api/purse/audit.csv',undefined,h.owner);assert.equal(exported.status,200);assert.ok(exported.value.includes('budget-import'));assert.ok(exported.value.includes(review.sourceHash));
 }finally{await h.close();}
});

test('Budget owner sees scoped totals and a single threshold crossing without acquiring approval authority',async()=>{
 const h=await harness();try {
  const f=await budgetFixture(h);await f.commit(await f.preview(f.input));
  const own=(await h.state(f.owner)).data;
  assert.deepEqual(own.periodBudgets.map(row=>[row.currency,row.amountMinor]).sort(),[['EUR',120023],['USD',100001]]);
  assert.equal((await h.state(f.outside)).data.periodBudgets.length,0);
  await f.purchase(79000);assert.equal((await h.state(f.owner)).data.budgetAlerts.length,0);
  const request=await f.purchase(1001);
  const read=(await h.state(f.owner)).data,alert=read.budgetAlerts;
  assert.deepEqual(alert.map(row=>[row.policy,row.percent,row.usedMinor,row.amountMinor,row.currency]),[[f.usd.id,80,80001,100001,'USD']]);
  await h.command('decision',{id:request.id,revision:1,decision:'approved',reason:'Budget owner is not an approver'},f.owner,403);
  await h.command('decision',{id:request.id,revision:1,decision:'approved',reason:'Current approver confirms the request'},f.approver);
  await f.commit(await f.preview(f.input));await f.commit(await f.preview(f.input));
  assert.equal((await h.state(f.owner)).data.budgetAlerts.length,1);
  assert.equal((await h.state(f.outside)).data.budgetAlerts.length,0);
  await h.command('member',{email:email(2503),name:'Budget steward',grants:[{role:'finance-viewer',scope:{departments:['Research']}}],active:true});
  const revoked=(await h.state(f.owner)).data;assert.equal(revoked.periodBudgets.length,0);assert.equal(revoked.budgetAlerts.length,0);
  const review=await f.preview(f.input);await h.command('member',{email:email(2503),name:'Budget steward',roles:['finance-viewer'],active:false});
  await f.commit(review,{},400);
  await f.preview(f.input,400);
 }finally{await h.close();}
});
