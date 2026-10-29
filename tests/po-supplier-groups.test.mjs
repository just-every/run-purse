import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createPortability} from '@runeditrun/rer/modules/portability';
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs';
import {harness} from './purse-harness.mjs';
import {supplierGroupsFixture,groupMail} from './po-supplier-groups-fixture.mjs';
import {documentProfileFixture} from './document-profile-fixture.mjs';
import {termsPdf} from './po-documents-fixtures.mjs';
import {reauthenticateErasure} from './erasure-flow.mjs';
import {pdfContent} from './pdf-content.mjs';

test('Native supplier groups reconcile source lines, frozen originals, separate invoice balances, budget sources and restored history',async t=>{
 const h=await harness();t.after(()=>h.close());const f=await supplierGroupsFixture(h),{cmd,buyer}=f;
 const terms=await termsPdf('synthetic-purse-8140 original terms'),certificate=await termsPdf('synthetic-purse-8141 Colorado certificate');
 const profile=await cmd('po-profile',{...documentProfileFixture(f.business,'Denver'),id:(await h.state()).data.poProfile[0].id,version:1,termsFile:{name:'synthetic-purse-8140.pdf',base64:terms},certificate:{name:'synthetic-purse-8141.pdf',base64:certificate,supplierStates:['CO']}});
 const source=await f.create(),result=await f.convert(source),groups=result.supplierOrders;assert.equal(groups.length,2);assert.deepEqual(groups.map(group=>group.totalMinor),[60000,40000]);assert.equal(new Set(groups.flatMap(group=>group.lines.map(line=>line.sourceLine))).size,2);assert.deepEqual(groups.map(group=>group.lines[0].sourceLine),source.lines.map(line=>line.id));
 let state=(await h.state()).data;assert.deepEqual(f.policies.map(policy=>{const position=state.periodBudgets.find(row=>row.id===policy.id);return [position.reservedMinor,position.committedMinor]}),[[60000,0],[40000,0]]);
 const issued=await cmd('issue',{id:groups[1].id,revision:2,reason:'Issue the exact supplier groups together'},buyer);assert.ok(issued.supplierOrders.every(group=>group.status==='issued'));state=(await h.state()).data;
 assert.deepEqual(f.policies.map(policy=>{const p=state.periodBudgets.find(row=>row.id===policy.id);return [p.reservedMinor,p.committedMinor,p.actualMinor]}),[[0,60000,0],[0,40000,0]]);
 const report=await f.report();assert.deepEqual(report.totals,[{currency:'USD',reservedMinor:0,committedMinor:100000,actualMinor:0}]);assert.deepEqual(report.rows.map(row=>[row.order,row.supplier,row.amountMinor]).sort(),groups.map(group=>[group.id,group.supplier,group.totalMinor]).sort());
 await cmd('po-profile',{...documentProfileFixture(f.business,'Denver'),id:profile.id,version:profile.version,standardTerms:'Changed current terms'});
 await cmd('supplier',{...f.suppliers[1],name:'Changed supplier name',reason:'Later supplier edit'});
 for(const [index,group]of groups.entries()) {const response=await h.mf.dispatchFetch(h.origin+'/api/purse/order-pdf/'+group.id,{headers:{cookie:buyer}});assert.equal(response.status,200);const bytes=new Uint8Array(await response.arrayBuffer()),printed=await pdfContent(bytes);assert.ok(printed.text.includes(f.suppliers[index].name));assert.ok(printed.text.includes('synthetic-purse-8140 original terms'));assert.equal(printed.text.includes('synthetic-purse-8141 Colorado certificate'),index===0);assert.ok(!printed.text.includes('Changed current terms'));const html=await h.send('/api/purse/download/order/'+group.id,undefined,buyer);assert.ok(html.value.includes(terms));assert.equal(html.value.includes(certificate),index===0);}
 await cmd('receipt',{order:groups[0].id,line:groups[0].lines[0].id,event:'receive',quantity:'1',reason:'First supplier delivered',ownerOverride:true});
 state=(await h.state()).data;assert.equal(state.commitment.reduce((sum,event)=>sum+event.amountMinor,0),40000);assert.deepEqual((await f.report()).rows.filter(row=>row.kind==='committed').map(row=>[row.order,row.amountMinor]),[[groups[1].id,40000]]);
 const bill=await cmd('invoice',{order:groups[0].id,reference:'synthetic-purse-8142',source:'Exact group invoice',allocations:[{line:groups[0].lines[0].id,quantity:'1',amountMinor:60000}]},buyer);assert.equal(bill.balance.faceMinor,60000);assert.equal(bill.balance.remainingMinor,60000);assert.equal(bill.flags.length,0);
 const second=await cmd('invoice',{order:groups[1].id,reference:'synthetic-purse-8143',source:'Second supplier group invoice',allocations:[{line:groups[1].lines[0].id,quantity:'1',amountMinor:40000}]},buyer);assert.equal(second.balance.faceMinor,40000);assert.equal(second.balance.billedMinor,0);assert.ok(!second.flags.some(flag=>flag.code==='po-balance'));
 const excess=await cmd('invoice',{order:groups[0].id,reference:'synthetic-purse-8144',source:'Excess group invoice',allocations:[{line:groups[0].lines[0].id,quantity:'0.001',amountMinor:1}]},buyer);assert.equal(excess.balance.remainingMinor,0);assert.ok(excess.flags.some(flag=>flag.code==='po-balance'));const payable=await cmd('payable-terms',{invoice:excess.id,version:0,invoiceDate:excess.invoiceDate,term:'Net 30',reason:'Retain unresolved source'},buyer);await cmd('approve-payable',{invoice:excess.id,version:payable.version,reason:'Risk cannot be bypassed'},buyer,409);
 const audit=await h.send('/api/purse/audit.csv?subject='+groups[1].id,undefined,h.owner);assert.equal(audit.status,200);for(const value of ['buyer-conversion-edit','sourceRevision','supplier','100000'])assert.ok(audit.value.includes(value),value);
 // Header-only tax and explicit line tax both remain exact through preparation and issuance.
 for(const explicit of [false,true]){
  const taxed=await f.create({taxMinor:6000,...(explicit?{charges:[{kind:'tax',description:'Supplied line tax',amountMinor:6000}],lines:f.draft.lines.map((line,index)=>({...line,lineTaxMinor:index?0:6000}))}:{})});
  const prepared=await f.convert(taxed),expected=explicit?[66000,40000]:[63600,42400];
  assert.deepEqual(prepared.supplierOrders.map(group=>group.totalMinor),expected);
  assert.equal(prepared.supplierOrders.reduce((sum,group)=>sum+group.taxMinor,0),6000);
  const reserved=(await f.report()).rows.filter(row=>row.request===taxed.id&&row.kind==='reserved');
  assert.deepEqual(reserved.map(row=>[row.supplier,row.amountMinor]).sort(),prepared.supplierOrders.map(group=>[group.supplier,group.totalMinor]).sort());
  const budgets=(await h.state()).data.periodBudgets;
  assert.deepEqual(f.policies.map(policy=>budgets.find(row=>row.id===policy.id).sources.filter(row=>row.request===taxed.id).reduce((sum,row)=>sum+row.reservedMinor,0)),expected);
  const issued=await cmd('issue',{id:prepared.id,revision:2,reason:'Issue all supplied header and line tax once'},buyer);
  assert.ok(issued.supplierOrders.every(group=>group.status==='issued'));
  assert.deepEqual(issued.supplierOrders.map(group=>group.totalMinor),expected);
  const report=(await f.report()).rows.filter(row=>row.request===taxed.id);
  assert.ok(report.every(row=>row.kind==='committed'));
  assert.deepEqual(report.map(row=>[row.supplier,row.amountMinor]).sort(),issued.supplierOrders.map(group=>[group.supplier,group.totalMinor]).sort());
  const committed=(await h.state()).data.periodBudgets;
  assert.deepEqual(f.policies.map(policy=>committed.find(row=>row.id===policy.id).sources.filter(row=>row.request===taxed.id).reduce((sum,row)=>sum+row.committedMinor,0)),expected);
 }
 const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true);
 const archive=join(h.dir,'synthetic-purse-8145.rer');await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive,[]);const restored=await harness();t.after(()=>restored.close());await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[]);for(const kind of ['request','revision','order','invoice','commitment','audit']){const select=async db=>(await db.prepare('SELECT * FROM p_records WHERE kind=? ORDER BY id').bind(kind).all()).results;assert.deepEqual(await select(restored.db),await select(h.db),kind);}
 assert.equal((await restored.send('/api/purse/command/issue',{id:groups[0].id,revision:2,reason:'Replay cannot restore authority'},buyer)).status,401);
 await cmd('amend',{...f.draft,id:source.id,revision:2,reason:'Grouped liabilities cannot migrate'},f.requester,409);await cmd('need-date-edit',{id:source.id,revision:2,needDate:'2026-11-02',reason:'Grouped history cannot be migrated'},f.requester,409);
 await cmd('member',{email:groupMail(8101),name:'Inactive requester awaiting erasure',roles:['requester'],active:false});
 await reauthenticateErasure(h);
 const inventory=await h.send('/api/purse/erasure',undefined,h.owner),preview=await h.send('/api/purse/erasure/preview',{kind:'member',id:groupMail(8101),revision:inventory.value.revision},h.owner);assert.equal(preview.status,200,JSON.stringify(preview.value));
 const erased=await h.send('/api/purse/erasure/execute',{...preview.value.subject,revision:preview.value.revision,review:preview.value.review,fingerprint:preview.value.fingerprint,consent:true},h.owner);assert.equal(erased.status,200,JSON.stringify(erased.value));
 assert.equal((await h.send('/api/purse/state',undefined,f.requester)).status,401);assert.equal((await h.send('/api/purse/command/convert',{id:source.id,revision:2},f.requester)).status,401);
 const erasedRows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.ok(erasedRows.every(row=>!row.value.includes(groupMail(8101))));assert.equal(validatePurchasingArchive(erasedRows),true);
 const journal=join(h.dir,'synthetic-purse-8146.rer');await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),journal,[]);
 const fenced=await harness({empty:true});t.after(()=>fenced.close());await assert.rejects(importArchive(await createPortability({db:fenced.db,buckets:{ORIGINALS:fenced.originals},policy:portability}),archive,[],journal),/erasure_epoch/);assert.equal((await fenced.db.prepare('SELECT count(*) AS n FROM p_records').first()).n,0);

});

test('Supplier group conversion fences complete-request variance, required budget owners, stale authority and concurrent once-only issuance',async t=>{
 const h=await harness();t.after(()=>h.close());const f=await supplierGroupsFixture(h,{budgetMinor:100000,absoluteMinor:5000}),{cmd,buyer}=f;
 const r=await f.create(),edit=f.edits(r,{lines:[{id:r.lines[0].id,unitMinor:64000},{id:r.lines[1].id,supplier:f.suppliers[1].id,unitMinor:44000}]});
 const pending=await f.convert(r,{conversionEdits:edit,issue:true});assert.equal(pending.status,'pending');assert.equal(pending.buyerConversion.withinLimit,false);assert.equal((await h.state()).data.order.length,0);await cmd('convert',{id:r.id,revision:2,issue:true},buyer,409);
 const route=(await h.state()).data.request.find(row=>row.id===r.id).approvalRoute;assert.ok(route.some(step=>step.email===groupMail(8104)));assert.ok(route.some(step=>step.email===groupMail(8105)));
 for(const [cookie,email]of [[f.approver,groupMail(8102)],[f.ownerA,groupMail(8104)],[f.ownerB,groupMail(8105)]]){await cmd('decision',{id:r.id,revision:2,decision:'approved',reason:'Required exact purchase and budget owner decision'},cookie);if(email!==groupMail(8105))await cmd('convert',{id:r.id,revision:2,issue:true},buyer,409);}
 const prepared=await cmd('convert',{id:r.id,revision:2},buyer);assert.deepEqual(prepared.supplierOrders.map(group=>group.totalMinor),[64000,44000]);
 const captures=await Promise.all(prepared.supplierOrders.map(group=>h.send('/api/purse/command/issue',{id:group.id,revision:2,reason:'Concurrent group issue'},buyer)));assert.equal(captures.filter(response=>response.status===200).length,1);assert.ok(captures.every(response=>[200,409].includes(response.status)));
 let state=(await h.state()).data;assert.equal(state.order.length,2);assert.ok(state.order.every(order=>order.status==='issued'));assert.equal(state.commitment.reduce((sum,event)=>sum+event.amountMinor,0),108000);assert.deepEqual(f.policies.map(policy=>state.periodBudgets.find(position=>position.id===policy.id).committedMinor),[64000,44000]);
 // Another budget is used for independent charge and concurrency cases.
 for(const policy of f.policies)await cmd('policy',{...policy,budgetMinor:10000000});
 const cents=await f.create(),charges=f.edits(cents,{charges:[{kind:'freight',description:'Supplied freight',amountMinor:1},{kind:'tax',description:'Supplied tax',amountMinor:1},{kind:'other',description:'Supplied handling',amountMinor:1}]});const split=await f.convert(cents,{conversionEdits:charges,issue:true});assert.deepEqual(split.supplierOrders.map(group=>group.totalMinor),[60003,40000]);assert.equal(split.supplierOrders.flatMap(group=>group.charges).reduce((sum,charge)=>sum+charge.amountMinor,0),3);const chargeState=(await h.state()).data;assert.deepEqual(f.policies.map(policy=>chargeState.commitment.filter(event=>event.request===cents.id).reduce((sum,event)=>sum+(event.budgetAllocations.find(share=>share.policy===policy.id)?.amountMinor??0),0)),[60003,40000]);assert.deepEqual((await f.report()).rows.filter(row=>row.request===cents.id&&row.kind==='committed').map(row=>[row.supplier,row.amountMinor]).sort(),split.supplierOrders.map(group=>[group.supplier,group.totalMinor]).sort());
 // Supplied tax cannot dilute the price limit on an approved line's item value.
 await cmd('member',{email:groupMail(8103),name:'Group buyer',active:true,grants:[{role:'buyer',scope:{},limits:{percent:10,quantityPercent:15}}]});
 for(const [quantity,allowed]of [['1.10',true],['1.11',false]]){
  const taxed=await f.create({taxMinor:6000,charges:[{kind:'tax',description:'Supplied line tax',amountMinor:6000}],lines:f.draft.lines.map((line,index)=>({...line,lineTaxMinor:index?0:6000}))});
  const changed=await f.convert(taxed,{conversionEdits:f.edits(taxed,{lines:[{id:taxed.lines[0].id,quantity},{id:taxed.lines[1].id,supplier:f.suppliers[1].id}]}),issue:true});
  if(allowed){assert.equal(changed.status,'issued');assert.deepEqual(changed.supplierOrders.map(group=>group.totalMinor),[72000,40000]);}
  else{
   assert.equal(changed.status,'pending');assert.equal(changed.buyerConversion.withinLimit,false);
   const before=(await h.state()).data;assert.equal(before.order.filter(order=>order.request===taxed.id).length,0);const pendingRows=(await f.report()).rows.filter(row=>row.request===taxed.id);assert.ok(pendingRows.every(row=>row.kind==='reserved'));assert.equal(pendingRows.reduce((sum,row)=>sum+row.amountMinor,0),112600);
   await cmd('convert',{id:taxed.id,revision:2,issue:true},buyer,409);assert.deepEqual((await h.state()).data,before);
   await cmd('decision',{id:taxed.id,revision:2,decision:'approved',reason:'Fresh approval for the over-limit line'},f.approver);
   const renewed=await cmd('convert',{id:taxed.id,revision:2,issue:true},buyer);assert.equal(renewed.status,'issued');assert.deepEqual(renewed.supplierOrders.map(group=>group.totalMinor),[72600,40000]);
  }
 }
 await cmd('member',{email:groupMail(8103),name:'Group buyer',active:true,grants:[{role:'buyer',scope:{},limits:{absoluteMinor:5000,percent:10,quantityPercent:0}}]});
 const concurrent=await f.create(),attempts=await Promise.all([1,2].map(()=>h.send('/api/purse/command/convert',{id:concurrent.id,revision:1,conversionEdits:f.edits(concurrent)},buyer)));assert.equal(attempts.filter(response=>response.status===200).length,1);assert.equal((await h.state()).data.order.filter(order=>order.request===concurrent.id).length,2);
 const refused=await f.create(),blocked=await cmd('supplier',{name:'synthetic-purse-8150',status:'blocked',reason:'Purchasing hold'}),form=await cmd('intake-form',{name:'synthetic-purse-8151',purchaseType:'goods',active:true,consent:true,defaults:{category:'goods',currency:'USD',location:'Denver',costCentre:'Operations',project:'General'},questions:[],headerFields:[],lineFields:[],requiredFiles:[]}),proposal=await cmd('intake-draft',{fields:{intakeForm:form.id,lines:[]},proposal:{name:'synthetic-purse-8152',contactEmail:groupMail(8153).replace('example.test','synthetic-purse-8153.test'),reason:'Pending vendor review',consent:true}},f.requester);
 for(const supplier of [blocked.id,proposal.fields.supplier]){const before=(await h.state()).data;await cmd('convert',{id:refused.id,revision:1,conversionEdits:f.edits(refused,{lines:[{id:refused.lines[1].id,supplier}]})},buyer,409);assert.deepEqual((await h.state()).data,before);}
 const held=await f.create(),heldOrders=(await f.convert(held)).supplierOrders;const sourceBefore=(await h.state()).data;await cmd('issue',{id:heldOrders[0].id,revision:1,reason:'Stale group revision refused'},buyer,409);assert.deepEqual((await h.state()).data,sourceBefore);await cmd('member',{email:groupMail(8102),name:'Revoked purchase approver',roles:['requester'],active:true});const revoked=(await h.state()).data;await cmd('issue',{id:heldOrders[0].id,revision:2,reason:'Revoked approval cannot issue any group'},buyer,409);assert.deepEqual((await h.state()).data,revoked);await cmd('member',{email:groupMail(8102),name:'Current purchase approver',roles:['approver'],active:true});await cmd('member',{email:groupMail(8103),name:'Revoked buyer',roles:['requester'],active:true});const unchanged=(await h.state()).data;await cmd('issue',{id:heldOrders[0].id,revision:2,reason:'Revoked issue refused'},buyer,403);await cmd('convert',{id:refused.id,revision:1,conversionEdits:f.edits(refused)},buyer,403);assert.deepEqual((await h.state()).data,unchanged);
 assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records').all()).results),true);
});
