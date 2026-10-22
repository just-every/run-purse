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

test('BUDGET-001 dated department exposure reserves pending, commits buyer changes and retains received unbilled value',async t=>{
 const h=await harness();t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'synthetic-purse-2201',currencies:['USD'],locations:['Austin'],costCentres:['Operations','Research'],projects:['General']});
 const requester=await h.member('synthetic-purse-2202@example.test',['requester']),approver=await h.member('synthetic-purse-2203@example.test',['approver']),buyer=await h.member('synthetic-purse-2204@example.test',['buyer']);
 const owner=await h.member('synthetic-purse-2210@example.test',['approver']);
 const supplier=await cmd('supplier',{name:'synthetic-purse-2205',status:'preferred',reason:'Reviewed budget supplier'});
 const p=await cmd('policy',{name:'Quarterly Operations',currency:'USD',category:'*',project:'*',costCentre:'Operations',approver:'synthetic-purse-2203@example.test',limitMinor:500000,budgetMinor:200000,approvalSteps:[],budgetPeriod:{from:'2026-10-01',through:'2026-12-31'}});
 await cmd('buyer-role-limit',{role:'buyer',entity:'main',limits:{percent:10,quantityPercent:0}});
 const input={title:'synthetic-purse-2206',supplier:supplier.id,currency:'USD',needDate:'2026-11-01',location:'Austin',costCentre:'Operations',terms:'Net 30',lines:[{description:'synthetic-purse-2207',quantity:'1',unitMinor:100000,category:'goods',project:'General'}]};
 const position=async(policy=p.id,cookie=h.owner)=>(await h.state(cookie)).data.periodBudgets.find(budget=>budget.id===policy);
 const decision=(r,cookie=approver)=>cmd('decision',{id:r.id,revision:r.revision,decision:'approved',reason:'Reviewed exact quarter purchase'},cookie);
 const r=await cmd('request',input,requester);await cmd('submit',{id:r.id,revision:1},requester);assert.equal((await position()).reservedMinor,100000);assert.equal((await position(p.id,requester)).availableMinor,100000);await decision(r);
 const order=await cmd('convert',{id:r.id,revision:1,conversionEdits:{lines:[{id:r.lines[0].id,unitMinor:104000}],charges:[{kind:'freight',description:'Delivery',amountMinor:2500}],reason:'Supplier current price and freight'}},buyer);await cmd('issue',{id:order.id,revision:order.revision,reason:'Issue current quarter commitment'},buyer);
 let budget=await position();assert.deepEqual([budget.reservedMinor,budget.committedMinor,budget.actualMinor,budget.availableMinor],[0,106500,0,93500]);
 const invoice={order:order.id,reference:'synthetic-purse-2208',source:'Recorded supplier invoice',allocations:[{line:order.lines[0].id,quantity:'0.5',amountMinor:56500}]};await cmd('invoice',invoice,buyer);await cmd('invoice',invoice,buyer);
 budget=await position();assert.deepEqual([budget.committedMinor,budget.actualMinor,budget.availableMinor],[50000,56500,93500]);
 await cmd('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'1',reason:'Physical receipt',ownerOverride:true});assert.equal((await position()).committedMinor,50000,'Receiving never releases the received unbilled financial exposure');
 await cmd('invoice',{...invoice,reference:'synthetic-purse-2209',allocations:[{...invoice.allocations[0],amountMinor:50000}]},buyer);budget=await position();assert.deepEqual([budget.committedMinor,budget.actualMinor,budget.availableMinor],[0,106500,93500]);assert.equal(budget.sources[0].invoiceIds.length,2);
 const poor=await cmd('request',input,requester);await cmd('submit',{id:poor.id,revision:1},requester,409);
 await cmd('policy',{...p,overBudget:'owner',budgetOwner:'synthetic-purse-2210@example.test'});
 const routed=await cmd('submit',{id:poor.id,revision:1},requester);assert.equal(routed.budgetOwnerReview,true);assert.equal((await position()).reservedMinor,0);await decision(routed);assert.equal((await position()).reservedMinor,0);await decision(routed,owner);assert.equal((await position()).reservedMinor,100000);
 const raised=await cmd('convert',{id:poor.id,revision:1,conversionEdits:{lines:[],freightMinor:1,reason:'One further cent requires new budget authority'}},buyer);assert.equal(raised.conversionRouted,true);assert.equal(raised.status,'pending');assert.equal((await h.state()).data.order.filter(order=>order.request===poor.id).length,0);await decision(raised);await decision(raised,owner);
 const authorized=await cmd('convert',{id:poor.id,revision:raised.revision},buyer);await cmd('issue',{id:authorized.id,revision:authorized.revision,reason:'Issue newly budget-approved amount'},buyer);assert.equal((await position()).committedMinor,100001);
 for(const changes of [{budgetPeriod:{from:'2026-11-01',through:'2027-01-31'}},{budgetPeriod:null},{costCentre:'Research'}])await cmd('policy',{...p,...changes},h.owner,409);
 const otherRequester=await h.member('synthetic-purse-2211@example.test',['requester']);const hidden=await cmd('request',{...input,title:'synthetic-purse-2212 private purchase',lines:input.lines.map(line=>({...line,unitMinor:50000}))},otherRequester);await cmd('submit',{id:hidden.id,revision:1},otherRequester);await decision(hidden);await decision(hidden,owner);
 const scoped=await position(p.id,requester),complete=await position();assert.deepEqual([scoped.amountMinor,scoped.reservedMinor,scoped.committedMinor,scoped.actualMinor,scoped.availableMinor],[complete.amountMinor,complete.reservedMinor,complete.committedMinor,complete.actualMinor,complete.availableMinor]);
 const anonymous=scoped.sources.find(source=>source.hidden);assert.equal(anonymous.reservedMinor,50000);assert.equal(anonymous.request,undefined);assert.equal(anonymous.order,undefined);assert.ok(!JSON.stringify(scoped).includes(hidden.id));assert.ok(!JSON.stringify(scoped).includes('synthetic-purse-2212'));
 const restricted=await h.member('synthetic-purse-2214@example.test',['approver']);await cmd('member',{email:'synthetic-purse-2214@example.test',name:'Research only',active:true,grants:[{role:'approver',scope:{departments:['Research']}}]});assert.equal(await position(p.id,restricted),undefined);
 const outside=await cmd('request',{...input,needDate:'2027-04-01'},requester);await cmd('submit',{id:outside.id,revision:1},requester,409);
 const research=await cmd('policy',{...p,id:undefined,name:'Q1 Research',costCentre:'Research',budgetMinor:40500,budgetPeriod:{from:'2027-01-01',through:'2027-03-31'},overBudget:'owner',budgetOwner:'synthetic-purse-2210@example.test'});
 const operations=await cmd('policy',{...p,id:undefined,name:'Q1 Operations',budgetPeriod:{from:'2027-01-01',through:'2027-03-31'}});
 const split=await cmd('request',{...input,needDate:'2027-01-15',lines:input.lines.map(line=>({...line,allocations:[{costCentre:'Operations',project:'General',basisPoints:6000},{costCentre:'Research',project:'General',basisPoints:4000}]}))},requester);await cmd('submit',{id:split.id,revision:1},requester);await decision(split);
 assert.equal((await position(operations.id)).reservedMinor,60000);assert.equal((await position(research.id)).reservedMinor,40000);
 const splitEdit=await cmd('convert',{id:split.id,revision:1,conversionEdits:{lines:[{id:split.lines[0].id,unitMinor:104000}],reason:'Each allocation requires its own budget authority'}},buyer);assert.equal(splitEdit.status,'pending');assert.ok(splitEdit.approvalRoute.some(step=>step.id==='budget-owner:'+research.id));assert.equal((await position(operations.id)).reservedMinor,0);assert.equal((await position(research.id)).reservedMinor,0);
 await decision(splitEdit);await decision(splitEdit,owner);
 const splitOrder=await cmd('convert',{id:split.id,revision:splitEdit.revision},buyer);await cmd('issue',{id:splitOrder.id,revision:splitOrder.revision,reason:'Issue allocations under independent owner authority'},buyer);
 assert.equal((await position(operations.id)).committedMinor,62400);assert.equal((await position(research.id)).committedMinor,41600);
 const report=await h.send('/api/purse/spend-report?from=2027-01-15&through=2027-01-15&groupBy=department',undefined,requester);assert.equal(report.status,200);assert.deepEqual(report.value.groups.map(group=>[group.label,group.committedMinor]),[['Operations',62400],['Research',41600]]);
 await cmd('invoice',{order:splitOrder.id,reference:'synthetic-purse-2215',source:'Final split supplier bill',allocations:[{line:splitOrder.lines[0].id,quantity:'1',amountMinor:104000}]},buyer);
 assert.deepEqual([(await position(operations.id)).committedMinor,(await position(operations.id)).actualMinor,(await position(research.id)).committedMinor,(await position(research.id)).actualMinor],[0,62400,0,41600]);

 const q2ops=await cmd('policy',{...operations,id:undefined,name:'Q2 Operations',budgetPeriod:{from:'2027-04-01',through:'2027-06-30'}}),q2research=await cmd('policy',{...research,id:undefined,name:'Q2 Research',budgetMinor:100000,budgetPeriod:{from:'2027-04-01',through:'2027-06-30'}});
 const originalSplit=await cmd('request',{...input,needDate:'2027-04-15',lines:input.lines.map(line=>({...line,allocations:[{costCentre:'Operations',project:'General',basisPoints:6000},{costCentre:'Research',project:'General',basisPoints:4000}]}))},requester);await cmd('submit',{id:originalSplit.id,revision:1},requester);await decision(originalSplit);
 const originalOrder=await cmd('convert',{id:originalSplit.id,revision:1},buyer);await cmd('issue',{id:originalOrder.id,revision:originalOrder.revision,reason:'Issue original split'},buyer);assert.deepEqual([(await position(q2ops.id)).committedMinor,(await position(q2research.id)).committedMinor],[60000,40000]);
 await cmd('invoice',{order:originalOrder.id,reference:'synthetic-purse-2216',source:'Original split bill',allocations:[{line:originalOrder.lines[0].id,quantity:'1',amountMinor:100000}]},buyer);assert.deepEqual([(await position(q2ops.id)).committedMinor,(await position(q2ops.id)).actualMinor,(await position(q2research.id)).committedMinor,(await position(q2research.id)).actualMinor],[0,60000,0,40000]);
 await cmd('policy',{...research,budgetPeriod:null},h.owner,409);
});
