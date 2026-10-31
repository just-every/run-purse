import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {harness} from './purse-harness.mjs';
import {dispositionFixture,identity} from './budget-disposition-fixture.mjs';
import {createPortability} from '@runeditrun/rer/modules/portability';
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import {reauthenticateErasure} from './erasure-flow.mjs';

test('Reviewed quarter disposition moves unchanged 60 and 40 shares exactly once with current independent authority and portable history',async()=>{
 const h=await harness();let restored;
 try {
  const f=await dispositionFixture(h),before=await f.rows(),meta=(await h.db.prepare('SELECT revision FROM p_meta').all()).results,review=await f.preview();
  assert.deepEqual((await h.db.prepare('SELECT revision FROM p_meta').all()).results,meta,'Preview changes no global state revision');
  assert.deepEqual(await f.rows(),before,'Preview persists no records');
  assert.deepEqual(review.source.map(row=>row.amountMinor).sort(),[40000,60000]);assert.deepEqual(review.destination.map(row=>row.amountMinor).sort(),[40000,60000]);
  await f.unchanged(()=>f.amend(review,{consent:false},409));await f.unchanged(()=>f.amend(review,{needDate:'2027-06-15'},409));
  await f.unchanged(()=>f.amend(review,{},403,f.buyer));
  const r=await f.amend(review);await f.unchanged(()=>f.amend(review,{},409));
  const original=[[200000,0,60000,0,140000],[200000,0,40000,0,160000],[200000,0,0,0,200000],[200000,0,0,0,200000]];
  assert.deepEqual(await f.figures(),original,'Draft retains the original commitment without a duplicate reservation');
  await f.cmd('submit',{id:r.id,revision:2});
  await f.unchanged(()=>f.decide(r,h.owner,403));
  await f.decide(r);await f.unchanged(()=>f.cmd('convert',{id:r.id,revision:2},f.buyer,409));
  await f.decide(r,f.firstOwner);await f.unchanged(()=>f.cmd('convert',{id:r.id,revision:2},f.buyer,409));
  await f.decide(r,f.secondOwner);assert.deepEqual(await f.figures(),original,'All approvals preserve the source commitment until issuance');
  const o=await f.cmd('convert',{id:r.id,revision:2},f.buyer);
  await f.cmd('member',{email:identity(2804),name:'synthetic-purse-2804',roles:['requester'],active:true});
  await f.unchanged(()=>f.cmd('issue',{id:o.id,revision:2,reason:'Refuse revoked budget owner'},f.buyer,409));
  await f.cmd('member',{email:identity(2804),name:'synthetic-purse-2804',roles:['approver'],active:true});
  // A later unrelated purchase consumes destination capacity after all approvals.
  const newBudget=f.budgets[2];await f.cmd('policy',{...newBudget,budgetMinor:50000});
  await f.unchanged(()=>f.cmd('issue',{id:o.id,revision:2,reason:'Refuse changed destination budget'},f.buyer,409));
  await f.cmd('policy',{...newBudget,budgetMinor:200000});
  const renewed=await f.amend(await f.preview(f.o,2));await f.approveMove(renewed);
  const prepared=await f.cmd('convert',{id:r.id,revision:3},f.buyer);
  const competing=await f.cmd('request',{...f.input,title:'synthetic-purse-2817 competing destination reservation',needDate:'2027-05-15',lines:f.input.lines.map(line=>({...line,unitMinor:250000}))},f.hidden);await f.cmd('submit',{id:competing.id,revision:1},f.hidden);
  await f.unchanged(()=>f.cmd('issue',{id:prepared.id,revision:3,reason:'Refuse newly exhausted capacity'},f.buyer,409));
  await f.cmd('decision',{id:competing.id,revision:1,decision:'rejected',reason:'Release independently rejected competing request'},f.approver);
  const results=await Promise.all([1,2].map(()=>h.send('/api/purse/command/issue',{id:prepared.id,revision:3,reason:'Once-only quarter issuance'},f.buyer)));
  assert.deepEqual(results.map(row=>row.status).sort(),[200,409]);
  assert.deepEqual(await f.figures(),[[200000,0,0,0,200000],[200000,0,0,0,200000],[200000,0,60000,0,140000],[200000,0,40000,0,160000]],'Exactly 1000 moves with no invented capacity or duplicate exposure');
  await f.unchanged(()=>f.cmd('issue',{id:prepared.id,revision:3,reason:'Replay'},f.buyer,409));
  const data=(await h.state()).data,events=data.commitment.filter(row=>row.kind?.startsWith('budget-period-'));
  assert.deepEqual(events.map(row=>row.amountMinor).sort((a,b)=>a-b),[-100000,100000]);
  assert.equal(data.order.find(row=>row.id===f.o.id).status,'amended');
  await f.purchase({title:'synthetic-purse-2810 hidden purchase',needDate:'2027-05-15'},f.hidden);
  const scoped=await f.positions(f.requester),position=scoped.find(row=>row.id===f.budgets[2].id),anonymous=position.sources.find(row=>row.hidden);
  assert.equal(position.committedMinor,120000);assert.equal(anonymous.committedMinor,60000);assert.ok(!JSON.stringify(anonymous).includes('2810'));assert.equal(anonymous.request,undefined);assert.equal(anonymous.order,undefined);
  const audit=await h.send('/api/purse/audit.csv',undefined,h.owner);assert.equal(audit.status,200);assert.ok(audit.value.includes('budget-disposition-issued'));
  const service=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive=join(h.dir,'synthetic-purse-2811.rer');await exportArchive(service,archive,[]);
  restored=await harness();await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[]);
  assert.deepEqual((await restored.db.prepare("SELECT * FROM p_records WHERE kind IN ('request','revision','order','commitment') ORDER BY kind,id").all()).results,(await h.db.prepare("SELECT * FROM p_records WHERE kind IN ('request','revision','order','commitment') ORDER BY kind,id").all()).results);
  assert.equal((await restored.db.prepare('SELECT * FROM p_budget_disposition_authority').all()).results.length,0,'Restore retains chronology without consent authority');
  assert.deepEqual((await restored.state()).data.periodBudgets.map(row=>[row.id,row.committedMinor]).sort(),(await f.positions()).map(row=>[row.id,row.committedMinor]).sort());
  await restored.command('receipt',{order:prepared.id,line:prepared.lines[0].id,event:'receive',quantity:'0.1',reason:'Current owner receives restored issued goods',ownerOverride:true});
  const continued=(await restored.state()).data.periodBudgets;assert.equal(continued.find(row=>row.id===f.budgets[2].id).committedMinor,120000,'Restored issued supply continues without replaying old consent or duplicating exposure');
  const continuity=await harness();try {
   const c=await dispositionFixture(continuity),increased=await c.cmd('amend',{...c.r,reason:'Review an increased allocation split',lines:c.r.lines.map(line=>({...line,unitMinor:110000,allocations:line.allocations.map(code=>({...code,basisPoints:5000}))}))});
   await c.cmd('submit',{id:c.r.id,revision:2});await c.decide(increased);
   assert.deepEqual((await c.figures()).slice(0,2),[[200000,5000,60000,0,135000],[200000,5000,40000,0,155000]],'The unissued increase reserves its own allocation shares');
   await c.cmd('amend',{...c.r,revision:2,reason:'Discard the unissued increase and restore the original split'});
   assert.deepEqual((await c.figures()).slice(0,2),[[200000,0,60000,0,140000],[200000,0,40000,0,160000]],'Discarding an unissued amendment releases its exact reservation while preserving the original commitment');
   const tiny=await c.purchase({title:'synthetic-purse-2821 rounded commitment',lines:c.input.lines.map(line=>({...line,unitMinor:1}))}),tinyAmendment=await c.amend(await c.preview(tiny.o,1));
   await c.cmd('submit',{id:tinyAmendment.id,revision:2});await c.decide(tinyAmendment);await c.decide(tinyAmendment,c.firstOwner);await c.cmd('convert',{id:tinyAmendment.id,revision:2,issue:true},c.buyer);
   const roundedFigures=[[200000,0,60000,0,140000],[200000,0,40000,0,160000],[200000,0,1,0,199999],[200000,0,0,0,200000]];assert.deepEqual(await c.figures(),roundedFigures,'Rounded zero shares create no extra exposure or approval spending');
   const tinyArchive=join(continuity.dir,'synthetic-purse-2822.rer');await exportArchive(await createPortability({db:continuity.db,buckets:{ORIGINALS:continuity.originals},policy:portability}),tinyArchive,[]);
   const roundedRestore=await harness();try {await importArchive(await createPortability({db:roundedRestore.db,buckets:{ORIGINALS:roundedRestore.originals},policy:portability}),tinyArchive,[]);const budgets=(await roundedRestore.state()).data.periodBudgets;assert.deepEqual(c.budgets.map(b=>{const row=budgets.find(row=>row.id===b.id);return [row.amountMinor,row.reservedMinor,row.committedMinor,row.actualMinor,row.availableMinor];}),roundedFigures,'A rounded commitment remains restorable with exact currency amounts');}finally{await roundedRestore.close();}
  }finally{await continuity.close();}
 }finally{await restored?.close();await h.close();}
});

test('Unsafe quarter moves refuse changed sources, insufficient capacity, unreviewed amendments and restored or erased consent',async()=>{
 const h=await harness();let restored;
 try {
  const f=await dispositionFixture(h),review=await f.preview();
  const zero=await f.purchase({title:'synthetic-purse-2823 no remaining commitment',lines:f.input.lines.map(line=>({...line,unitMinor:0}))});await f.unchanged(()=>f.cmd('budget-disposition-preview',{id:zero.o.id,revision:1,needDate:'2027-05-15'},h.owner,409));
  const deposit=await f.purchase({title:'Native deposit boundary',lines:f.input.lines.map(line=>({...line,unitMinor:100})),poDetails:{deposit:{basis:'amount',amount:'0.10',trigger:'issue'}}});
  await f.unchanged(()=>f.cmd('budget-disposition-preview',{id:deposit.o.id,revision:1,needDate:'2027-05-15'},h.owner,409));
  // Policy version binds every allocation, including the non-primary share.
  await f.cmd('policy',{...f.budgets[3],budgetMinor:200001});await f.unchanged(()=>f.amend(review,{},409));
  await f.cmd('policy',{...f.budgets[3],budgetMinor:30000});
  await f.unchanged(()=>f.cmd('budget-disposition-preview',{id:f.o.id,revision:1,needDate:'2027-05-15'},h.owner,409));
  await f.cmd('policy',{...f.budgets[3],budgetMinor:200000});
  const ordinary=await f.cmd('amend',{...f.r,needDate:'2027-05-15',reason:'Unreviewed cross-period amendment'});
  await f.unchanged(()=>f.cmd('submit',{id:ordinary.id,revision:2},h.owner,409));
  const fresh=await f.amend(await f.preview(f.o,2));await f.approveMove(fresh);const prepared=await f.cmd('convert',{id:f.r.id,revision:3},f.buyer);
  const service=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive=join(h.dir,'synthetic-purse-2812.rer');await exportArchive(service,archive,[]);
  restored=await harness();await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[]);
  assert.equal((await restored.send('/api/purse/command/issue',{id:prepared.id,revision:3,reason:'Old consent is inert'},restored.owner)).status,409);
  await f.cmd('member',{email:identity(2803),name:'synthetic-purse-2803',roles:['approver'],active:false});await reauthenticateErasure(h);
  const meta=(await h.send('/api/purse/erasure',undefined,h.owner)).value;
  const erasure=await h.send('/api/purse/erasure/preview',{kind:'member',id:identity(2803),revision:meta.revision},h.owner);assert.equal(erasure.status,200,JSON.stringify(erasure.value));
  assert.equal((await h.send('/api/purse/erasure/execute',{...erasure.value.subject,revision:erasure.value.revision,review:erasure.value.review,fingerprint:erasure.value.fingerprint,consent:true},h.owner)).status,200);
  assert.ok(!JSON.stringify(await f.rows()).includes(identity(2803)));await f.unchanged(()=>f.cmd('issue',{id:prepared.id,revision:3,reason:'Erased consent cannot authorize'},f.buyer,409));
  const erasedArchive=join(h.dir,'synthetic-purse-2819.rer');await exportArchive(service,erasedArchive,[]);
  await restored.close();restored=await harness({empty:true});const erasedTarget=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});
  await assert.rejects(importArchive(erasedTarget,archive,[],erasedArchive),/erasure_epoch/);await importArchive(erasedTarget,erasedArchive,[]);
  assert.ok(!JSON.stringify((await restored.db.prepare('SELECT * FROM p_records').all()).results).includes(identity(2803)));assert.equal((await restored.db.prepare('SELECT * FROM p_budget_disposition_authority').all()).results.length,0);
  const received=await f.purchase({title:'synthetic-purse-2813 receiving boundary'});
  await f.cmd('receipt',{order:received.o.id,line:received.o.lines[0].id,event:'receive',quantity:'0.1',reason:'Original receiving evidence',ownerOverride:true});
  await f.unchanged(()=>f.cmd('budget-disposition-preview',{id:received.o.id,revision:1,needDate:'2027-05-15'},h.owner,409));
  const serviceOrder=await f.purchase({title:'synthetic-purse-2818 service boundary',lines:f.input.lines.map(line=>({...line,unitMinor:1000,service:{mode:'amount'}}))});
  await f.unchanged(()=>f.cmd('budget-disposition-preview',{id:serviceOrder.o.id,revision:1,needDate:'2027-05-15'},h.owner,409));
  const billed=await f.purchase({title:'synthetic-purse-2814 bill boundary'});
  await f.cmd('invoice',{order:billed.o.id,reference:'synthetic-purse-2815',source:'Original bill evidence',allocations:[{line:billed.o.lines[0].id,quantity:'0.1',amountMinor:10000}]},f.buyer);
  await f.unchanged(()=>f.cmd('budget-disposition-preview',{id:billed.o.id,revision:1,needDate:'2027-05-15'},h.owner,409));
 }finally{await restored?.close();await h.close();}
});
