import test from 'node:test'
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'

test('AUDIT-001 owner filters a PO history and exports exact decision policy, revisions and grants through native HTTP',async t=>{
 const h=await harness();t.after(()=>h.close());const {command:cmd,send}=h;
 await cmd('business',{name:'Front Range Field Services',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Equipment']});
 const requester=await h.member('requester@example.test',['requester']),approver=await h.member('approver@example.test',['approver']),buyer=await h.member('buyer@example.test',['buyer']);
 const supplier=await cmd('supplier',{name:'Canyon Supply',status:'preferred',reason:'Known equipment vendor'},buyer);
 const policyInput={name:'Equipment authority',currency:'USD',category:'Equipment',project:'Equipment',approver:'approver@example.test',limitMinor:100000,budgetMinor:200000};
 const p=await cmd('policy',policyInput);
 const draft={title:'Field safety kit',supplier:supplier.id,currency:'USD',needDate:'2026-11-15',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Harness',quantity:'10',unitMinor:1000,category:'Equipment',project:'Equipment'}]};
 const r=await cmd('request',draft,requester);await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Equipment allowance confirmed'},approver);
 const o=await cmd('convert',{id:r.id,revision:1},buyer);await cmd('issue',{id:o.id,revision:1,reason:'Supplier document issued externally'},buyer);
 await cmd('amend',{...draft,id:r.id,revision:1,lines:[{...draft.lines[0],id:r.lines[0].id,quantity:'12'}],reason:'Add two replacement harnesses'},buyer);
 await cmd('policy',{...policyInput,id:p.id,name:'Later policy',limitMinor:50000});
 const logged=await send('/api/purse/audit?subject='+encodeURIComponent(o.number),undefined,h.owner);assert.equal(logged.status,200);
 const events=logged.value.events;assert.ok(events.length>=5);assert.ok(events.every(e=>[r.id,o.id].includes(e.record)));assert.ok(events.every(e=>e.actor&&e.email&&e.at&&e.action));
 const decision=events.find(e=>e.action==='decision'),amendment=events.find(e=>e.action==='amend');
 assert.equal(decision.evidence.approval.policySnapshot.name,'Equipment authority');assert.equal(decision.evidence.approval.policySnapshot.limitMinor,100000);assert.equal(decision.evidence.revision.totalMinor,10000);assert.equal(decision.evidence.approval.reason,'Equipment allowance confirmed');
 assert.equal(amendment.evidence.before.lines[0].quantity,'10');assert.equal(amendment.evidence.revision.lines[0].quantity,'12');assert.equal(amendment.reason,'Add two replacement harnesses');
 const selected=await send('/api/purse/audit?subject='+o.id+'&action=amend&from='+amendment.at.slice(0,10)+'&through='+amendment.at.slice(0,10),undefined,h.owner);assert.deepEqual(selected.value.events.map(e=>e.id),[amendment.id]);
 const csv=await send('/api/purse/audit.csv?subject='+o.number,undefined,h.owner);assert.equal(csv.status,200);assert.match(csv.headers.get('content-disposition'),/purse-audit.csv/);assert.match(csv.value,/Equipment authority/);assert.match(csv.value,/Add two replacement harnesses/);assert.ok(!csv.value.includes('Later policy'));
 const grants=await send('/api/purse/audit?action=member',undefined,h.owner);assert.ok(grants.value.events.some(e=>e.record==='buyer@example.test'&&e.roles.includes('buyer')));
 const before=(await h.state()).data;
 for(const path of ['/api/purse/audit','/api/purse/audit.csv','/api/purse/audit?subject='+o.number]){
  assert.equal((await send(path,undefined,'')).status,401);assert.equal((await send(path,undefined,requester)).status,403);assert.equal((await send(path,undefined,buyer)).status,403);
 }
 assert.equal((await send('/api/purse/audit?from=2026-02-30',undefined,h.owner)).status,400);assert.deepEqual((await h.state()).data,before);
});

import {erasureFlow} from './erasure-flow.mjs';
import {restoreHoldFlow,retentionFlow} from './erasure-retention-flow.mjs';
test('ERASURE-001 native reviewed owner erasure anonymizes financial audit, RFQ and email originals, retains encrypted tax/evidence and fences archive resurrection',erasureFlow);
test('ERASURE-001 retention clock lists expired TIN, bank and W-9 values, erases them only on confirmation, and refuses buyer, auditor, token and agent at every door',retentionFlow);
test('ERASURE-001 a journal-less fresh restore is held until the native owner acknowledges, then restores labelled erasure history unverified',restoreHoldFlow);
