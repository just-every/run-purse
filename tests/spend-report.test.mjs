import test from 'node:test'
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'

test('REPORT-001 scoped HTTP dashboards filter source rows, preserve cents/currencies and distinguish reservations, issued commitments and invoice evidence',async t=>{
 const h=await harness();t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'Front Range Field Services',currencies:['USD','CAD'],locations:['Denver','Boulder'],costCentres:['Operations','IT'],projects:['Safety','Network']});
 const requester=await h.member('requester@example.test',['requester']),other=await h.member('other@example.test',['requester']),approver=await h.member('approver@example.test',['approver']);
 const supplier=await cmd('supplier',{name:'Canyon Supply',status:'preferred',reason:'Established supplier'});
 const usd=await cmd('policy',{name:'US equipment',currency:'USD',category:'*',project:'*',approver:'approver@example.test',limitMinor:100000,budgetMinor:1000000});
 await cmd('policy',{name:'Canadian equipment',currency:'CAD',category:'*',project:'*',approver:'approver@example.test',limitMinor:100000,budgetMinor:1000000});
 const draft={title:'Safety and network equipment',supplier:supplier.id,currency:'USD',needDate:'2026-11-15',location:'Denver',costCentre:'Operations',terms:'Net 30',freightMinor:1,taxMinor:0,lines:[{description:'Safety harness',quantity:'10',unitMinor:1000,category:'Safety',project:'Safety'},{description:'Router',quantity:'10',unitMinor:1000,category:'IT',project:'Network'}]};
 async function approve(input,cookie=requester){const r=await cmd('request',input,cookie);await cmd('submit',{id:r.id,revision:r.revision},cookie);await cmd('decision',{id:r.id,revision:r.revision,decision:'approved',reason:'Reviewed'},approver);return r}
 const r=await approve(draft);const cad=await approve({...draft,title:'Canadian network',currency:'CAD',location:'Boulder',costCentre:'IT',freightMinor:0,lines:[draft.lines[1]]},other);
 async function report(query='',cookie=h.owner){const res=await h.send('/api/purse/spend-report'+query,undefined,cookie);assert.equal(res.status,200,JSON.stringify(res.value));return res.value}
 let dashboard=await report();assert.deepEqual(dashboard.totals,[{currency:'CAD',reservedMinor:10000,committedMinor:0,actualMinor:0},{currency:'USD',reservedMinor:20001,committedMinor:0,actualMinor:0}]);
 const o=await cmd('convert',{id:r.id,revision:1});await cmd('issue',{id:o.id,revision:1,reason:'Issued externally'});
 dashboard=await report('?groupBy=project&department=Operations&from=2026-11-15&through=2026-11-15');
 assert.deepEqual(dashboard.totals,[{currency:'USD',reservedMinor:0,committedMinor:20001,actualMinor:0}]);
 assert.deepEqual(dashboard.groups.map(g=>[g.label,g.committedMinor]),[['Network',10000],['Safety',10001]]);assert.ok(dashboard.rows.every(row=>row.order===o.id&&row.request===r.id));
 assert.equal(dashboard.budgets[0].budgetMinor,1000000);assert.equal(dashboard.budgets[0].availableMinor,979999);
 await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'5',reason:'Five harnesses accepted'});
 await cmd('close-order',{id:o.id,version:0,reason:'Remaining harnesses no longer needed',line:o.lines[0].id,quantity:'5'});
 dashboard=await report('?groupBy=project&department=Operations');assert.equal(dashboard.groups.length,1);assert.equal(dashboard.groups[0].label,'Network');assert.equal(dashboard.groups[0].committedMinor,10001,'closed/received lines take no share of remaining cents');
 const invoice=await cmd('invoice',{order:o.id,reference:'CS-2042',source:'Supplier original',allocations:[{line:o.lines[1].id,quantity:'2',amountMinor:2100}]});
 dashboard=await report('?supplier='+supplier.id);const actual=dashboard.rows.find(row=>row.invoice===invoice.id);assert.equal(actual.amountMinor,2100);assert.equal(actual.exception,true);assert.equal(actual.reference,'CS-2042');
 const actualDay=invoice.at.slice(0,10);assert.equal((await report('?from='+actualDay+'&through='+actualDay)).totals.find(t=>t.currency==='USD').actualMinor,2100);
 assert.equal((await report('?from=2026-12-01')).rows.length,0);
 const own=await report('',requester);assert.ok(own.rows.every(row=>row.request===r.id));assert.ok(!JSON.stringify(own).includes(cad.id));assert.equal((await report('?department=IT',requester)).rows.length,0);
 for(const dimension of ['department','project','location','supplier','category']){const grouped=await report('?groupBy='+dimension);for(const group of grouped.groups)for(const kind of ['reserved','committed','actual'])assert.equal(group[kind+'Minor'],group.rows.filter(row=>row.kind===kind).reduce((n,row)=>n+row.amountMinor,0));}
 const renewalDraft={...draft,title:'Amendment authority',freightMinor:0,lines:[draft.lines[1]]};
 const renewal=await approve(renewalDraft),original=await cmd('convert',{id:renewal.id,revision:1});await cmd('issue',{id:original.id,revision:1,reason:'Original scope issued'});
 const amended=await cmd('amend',{...renewalDraft,id:renewal.id,revision:1,lines:[{...renewalDraft.lines[0],id:renewal.lines[0].id,quantity:'20'}],reason:'Double network allowance'});await cmd('submit',{id:amended.id,revision:2},requester);await cmd('decision',{id:amended.id,revision:2,decision:'approved',reason:'Extra allowance reviewed'},approver);
 let amendmentRows=(await report()).rows.filter(row=>row.request===renewal.id);assert.equal(amendmentRows.filter(row=>row.kind==='committed').reduce((n,row)=>n+row.amountMinor,0),10000);assert.equal(amendmentRows.filter(row=>row.kind==='reserved').reduce((n,row)=>n+row.amountMinor,0),10000);
 const replacement=await cmd('convert',{id:renewal.id,revision:2});await cmd('issue',{id:replacement.id,revision:2,reason:'Amendment issued'});amendmentRows=(await report()).rows.filter(row=>row.request===renewal.id);assert.equal(amendmentRows.length,1);assert.equal(amendmentRows[0].amountMinor,20000);assert.equal(amendmentRows[0].order,replacement.id);assert.equal(amendmentRows[0].kind,'committed');
 assert.equal((await h.send('/api/purse/spend-report',undefined,'')).status,401);assert.equal((await h.send('/api/purse/spend-report?groupBy=bankAccount',undefined,h.owner)).status,400);assert.equal((await h.send('/api/purse/spend-report?from=2026-02-30',undefined,h.owner)).status,400);assert.equal((await h.send('/api/purse/spend-report?from=2026-12-01&through=2026-01-01',undefined,h.owner)).status,400);
});
