
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'

export async function spend_reportFlow(){
{
 // REPORT-001 scoped HTTP dashboards filter source rows, preserve cents/currencies and distinguish reservations, issued commitments and invoice evidence
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
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

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // BUDGET-001 dated department exposure reserves pending, commits buyer changes and retains received unbilled value
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
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
 const report=await h.send('/api/purse/spend-report?from=2027-01-15&through=2027-01-15&groupBy=department',undefined,requester);assert.equal(report.status,200);assert.deepEqual(report.value.groups.map(group=>[group.label,group.committedMinor]),[['Operations',62400],['Research',41600]]);assert.deepEqual(report.value.rows.map(row=>[row.department,row.policy,row.amountMinor]).sort(),[['Operations',operations.id,62400],['Research',research.id,41600]]);assert.ok(report.value.budgets.every(budget=>![operations.id,research.id].includes(budget.id)),'Dated positions are reported once, separately from undated outstanding-authority budgets');
 await cmd('invoice',{order:splitOrder.id,reference:'synthetic-purse-2215',source:'Final split supplier bill',allocations:[{line:splitOrder.lines[0].id,quantity:'1',amountMinor:104000}]},buyer);
 assert.deepEqual([(await position(operations.id)).committedMinor,(await position(operations.id)).actualMinor,(await position(research.id)).committedMinor,(await position(research.id)).actualMinor],[0,62400,0,41600]);

 const q2ops=await cmd('policy',{...operations,id:undefined,name:'Q2 Operations',budgetPeriod:{from:'2027-04-01',through:'2027-06-30'}}),q2research=await cmd('policy',{...research,id:undefined,name:'Q2 Research',budgetMinor:100000,budgetPeriod:{from:'2027-04-01',through:'2027-06-30'}});
 const originalSplit=await cmd('request',{...input,needDate:'2027-04-15',lines:input.lines.map(line=>({...line,allocations:[{costCentre:'Operations',project:'General',basisPoints:6000},{costCentre:'Research',project:'General',basisPoints:4000}]}))},requester);await cmd('submit',{id:originalSplit.id,revision:1},requester);await decision(originalSplit);
 const originalOrder=await cmd('convert',{id:originalSplit.id,revision:1},buyer);await cmd('issue',{id:originalOrder.id,revision:originalOrder.revision,reason:'Issue original split'},buyer);assert.deepEqual([(await position(q2ops.id)).committedMinor,(await position(q2research.id)).committedMinor],[60000,40000]);
 await cmd('invoice',{order:originalOrder.id,reference:'synthetic-purse-2216',source:'Original split bill',allocations:[{line:originalOrder.lines[0].id,quantity:'1',amountMinor:100000}]},buyer);assert.deepEqual([(await position(q2ops.id)).committedMinor,(await position(q2ops.id)).actualMinor,(await position(q2research.id)).committedMinor,(await position(q2research.id)).actualMinor],[0,60000,0,40000]);
 await cmd('policy',{...research,budgetPeriod:null},h.owner,409);
 // A quarterly budget is one full combination, not independently interchangeable dimensions.
 await cmd('business',{name:'synthetic-purse-2220',currencies:['USD'],locations:['Austin','Denver'],costCentres:['Operations','Research'],projects:['General']});
 const form=await cmd('intake-form',{name:'synthetic-purse-2221',purchaseType:'goods',consent:true,headerFields:[{id:'event',label:'Event',type:'choice',options:['synthetic-purse-2222','synthetic-purse-2223']}],lineFields:[{id:'grant',label:'Grant',type:'text'}]});
 const dimensionInput={...input,intakeForm:form.id,customFields:{event:'synthetic-purse-2222'},glAccount:'synthetic-purse-2224',needDate:'2027-07-15',lines:input.lines.map(line=>({...line,customFields:{grant:'synthetic-purse-2225'},allocations:[{costCentre:'Operations',project:'General',location:'Austin',glAccount:'synthetic-purse-2224',basisPoints:6000},{costCentre:'Research',project:'General',location:'Denver',glAccount:'synthetic-purse-2226',basisPoints:4000}]}))};
 const combined=await cmd('policy',{...p,id:undefined,name:'synthetic-purse-2227',budgetPeriod:{from:'2027-07-01',through:'2027-09-30'},location:'Austin',glAccount:'synthetic-purse-2224',budgetFields:{form:form.id,header:{event:'synthetic-purse-2222'},line:{grant:'synthetic-purse-2225'}}});
 const separate=await cmd('policy',{...combined,id:undefined,name:'synthetic-purse-2228',costCentre:'Research',location:'Denver',glAccount:'synthetic-purse-2226'});
 const lowTier=await cmd('policy',{...combined,id:undefined,name:'synthetic-purse-2234',limitMinor:50000});
 await cmd('policy',{...combined,id:undefined,budgetFields:{form:form.id,header:{unknown:'synthetic-purse-2222'},line:{}}},h.owner,400);
 const wrong=await cmd('request',{...dimensionInput,lines:dimensionInput.lines.map(line=>({...line,allocations:line.allocations.map((code,index)=>index?{...code,glAccount:'synthetic-purse-2229'}:code)}))},requester);await cmd('submit',{id:wrong.id,revision:1},requester,409);assert.equal((await position(combined.id)).reservedMinor,0);assert.equal((await position(separate.id)).reservedMinor,0);
 const wrongHeader=await cmd('request',{...dimensionInput,customFields:{event:'synthetic-purse-2223'}},requester);await cmd('submit',{id:wrongHeader.id,revision:1},requester,409);
 const combinedRequest=await cmd('request',dimensionInput,requester),submitted=await cmd('submit',{id:combinedRequest.id,revision:1},requester);assert.equal(submitted.policy,combined.id);await decision(submitted);assert.equal((await position(lowTier.id)).reservedMinor,0,'The selected higher authority tier keeps its primary budget identity');
 assert.deepEqual([(await position(combined.id)).reservedMinor,(await position(separate.id)).reservedMinor],[60000,40000]);
 const combinedOrder=await cmd('convert',{id:submitted.id,revision:1},buyer);await cmd('issue',{id:combinedOrder.id,revision:1,reason:'Issue exact native dimension shares'},buyer);
 assert.deepEqual([(await position(combined.id)).committedMinor,(await position(separate.id)).committedMinor],[60000,40000]);
 const combinedInvoice=await cmd('invoice',{order:combinedOrder.id,reference:'synthetic-purse-2230',source:'Exact combined native invoice',allocations:[{line:combinedOrder.lines[0].id,quantity:'0.5',amountMinor:50000}]},buyer);
 assert.deepEqual([(await position(combined.id)).committedMinor,(await position(combined.id)).actualMinor,(await position(separate.id)).committedMinor,(await position(separate.id)).actualMinor],[30000,30000,20000,20000]);
 const dimensionsReport=await h.send('/api/purse/spend-report?groupBy=glAccount&department=Research&location=Denver&glAccount=synthetic-purse-2226',undefined,h.owner);assert.equal(dimensionsReport.status,200);assert.deepEqual(dimensionsReport.value.rows.filter(row=>row.request===submitted.id).map(row=>[row.kind,row.amountMinor,row.policy,row.order,row.invoice??null]),[['committed',40000,separate.id,combinedOrder.id,null],['actual',20000,separate.id,combinedOrder.id,combinedInvoice.id]]);
 const customReport=await h.send('/api/purse/spend-report?groupBy='+encodeURIComponent('line:'+form.id+':grant'),undefined,h.owner);assert.equal(customReport.status,200);assert.ok(customReport.value.groups.some(group=>group.value==='synthetic-purse-2225'&&group.actualMinor===50000));
 for(const changes of [{location:'Denver'},{glAccount:'synthetic-purse-2226'},{budgetFields:null}])await cmd('policy',{...combined,...changes},h.owner,409);
 const denied=await h.member('synthetic-purse-2231@example.test',['approver']);await cmd('member',{email:'synthetic-purse-2231@example.test',name:'synthetic-purse-2232',active:true,grants:[{role:'approver',scope:{departments:['Research'],locations:['Austin']}}]});assert.equal(await position(separate.id,denied),undefined);
 const hiddenCombined=await cmd('request',{...dimensionInput,title:'synthetic-purse-2235'},otherRequester);await cmd('submit',{id:hiddenCombined.id,revision:1},otherRequester);await decision(hiddenCombined);
 const privateCombined=await position(combined.id,requester);assert.equal(Object.hasOwn(privateCombined,'authorityLimitMinor'),false,'A budget grant does not reveal private purchase approval caps');assert.deepEqual([privateCombined.reservedMinor,privateCombined.committedMinor,privateCombined.actualMinor,privateCombined.availableMinor],[60000,30000,30000,80000]);assert.equal(privateCombined.sources.find(source=>source.hidden).reservedMinor,60000);assert.ok(!JSON.stringify(privateCombined).includes(hiddenCombined.id));assert.ok(!JSON.stringify(privateCombined).includes('synthetic-purse-2235'));
 const locationReader=await h.member('synthetic-purse-2237@example.test',['approver']);await cmd('member',{email:'synthetic-purse-2237@example.test',name:'synthetic-purse-2237',active:true,grants:[{role:'approver',scope:{departments:['Operations','Research'],locations:['Austin']}}]});
 assert.equal((await h.state(locationReader)).data.request.some(request=>request.id===combinedRequest.id),false,'A complete read grant must cover the explicit location of every allocation');
 const privateReport=await h.send('/api/purse/spend-report?groupBy=glAccount',undefined,requester);assert.equal(privateReport.status,200);assert.ok(!JSON.stringify(privateReport.value).includes(combinedInvoice.id));assert.ok(!JSON.stringify(privateReport.value).includes(hiddenCombined.id));
 // Explicit overlap cannot choose financial custody by UUID, and does not hide the existing chronology.
 await cmd('policy',{...separate,active:false});
 const disabledAllocation=await cmd('request',{...dimensionInput,title:'synthetic-purse-2236'},requester);await cmd('submit',{id:disabledAllocation.id,revision:1},requester,409);
 assert.equal((await position(separate.id)).actualMinor,20000,'A disabled allocation budget blocks new funding while retaining recorded actual');
 await cmd('policy',{...separate,active:true});
 await cmd('policy',{...combined,id:undefined,name:'synthetic-purse-2233'});
 const ambiguous=await cmd('request',dimensionInput,requester);await cmd('submit',{id:ambiguous.id,revision:1},requester,409);
 assert.equal((await h.state()).data.request.find(request=>request.id===ambiguous.id).budgetReview.complete,false);
 assert.deepEqual((await h.state()).data.request.find(request=>request.id===ambiguous.id).approvalPreview,[],'Ambiguous funding offers no approval route while the draft remains readable');
 assert.deepEqual((await h.state()).data.request.find(request=>request.id===combinedRequest.id).approvalPreview.map(step=>step.id),['primary'],'Recorded approval routes remain readable after a conflicting budget is added');
 assert.equal((await position(combined.id)).actualMinor,30000);

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // Spend questions recompute exact finance figures and department sources, refuse unknown facts and obey owner pause and current scope
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const {spendQuestionFixture}=await import('./spend-question-fixture.mjs');const f=await spendQuestionFixture();t.after(()=>f.close());const {h,cmd}=f;
 const ask=(question,cookie=f.finance)=>cmd('spend-question',{question},cookie);
 for(const [index,question] of f.questions.entries()){const expected=f.expected[index],answer=await ask(question);assert.equal(answer.status,'answered',JSON.stringify(answer));assert.equal(answer.metric,expected.metric);assert.deepEqual(answer.filters,expected.filters);assert.equal(answer.figures.find(figure=>figure.currency==='USD').amountMinor,expected.amountMinor);const report=await h.send('/api/purse/spend-report?'+new URLSearchParams(expected.filters),undefined,f.finance);assert.equal(report.status,200);assert.deepEqual(answer.report,report.value);assert.deepEqual(answer.figures,report.value.totals.map(total=>({currency:total.currency,amountMinor:total[answer.metric+'Minor'],metric:answer.metric})));assert.ok(answer.report.rows.length);assert.equal(answer.model,'none');assert.equal(answer.provider,'none');assert.ok(answer.references.every(ref=>ref.version));}
 const scoped=await ask('Show reserved spend by department all recorded dates',f.requester);assert.equal(scoped.status,'answered');assert.equal(scoped.metric,'reserved');assert.deepEqual(scoped.filters,{groupBy:'department'});assert.equal(scoped.figures.find(figure=>figure.currency==='USD').amountMinor,40000);assert.ok(scoped.report.rows.some(row=>row.request===f.other.id),'Department grant includes the colleague');assert.ok(scoped.report.rows.every(row=>row.department==='Operations'));assert.ok(!JSON.stringify(scoped).includes(f.hidden.id));assert.deepEqual(scoped.report,(await h.send(scoped.reportUrl,undefined,f.requester)).value);
 const actual=await ask(f.questions[2]);assert.ok(actual.report.rows.some(row=>row.invoice===f.invoice.id&&row.order===f.order.id));assert.equal((await h.send('/api/purse/download/order/'+f.order.id,undefined,f.finance)).status,200);
 for(const question of ['Which suppliers did we pay over $50,000 last year without a PO?','Show committed spend over $500 all recorded dates','Show committed spend for department Research all recorded dates']){const answer=await ask(question,f.requester);assert.equal(answer.status,'declined');assert.ok(answer.reason);assert.equal(answer.report,undefined);}
 assert.equal((await h.send('/api/purse/command/spend-question',{question:f.questions[0]},'')).status,401);
 await cmd('spend-question',{question:f.questions[0],bankAccount:'synthetic-purse-3105'},f.finance,400);
 const run=(await ask(f.questions[0],f.requester)).id;await cmd('member',{email:'synthetic-purse-3101@example.test',name:'Research scope changed',active:true,grants:[{role:'requester',scope:{departments:['Research']},departmentRead:true}]});assert.equal((await h.send('/api/purse/download/agentRun/'+run,undefined,f.requester)).status,403);
 await cmd('agent-pause',{agent:'AGENT-011',reason:'Pause native spend questions'});await cmd('spend-question',{question:f.questions[0]},f.finance,409);
 const records=(await h.state()).data.agentRun.filter(run=>run.agent==='AGENT-011');assert.ok(records.some(run=>run.status==='declined'));assert.ok(records.every(run=>run.messages.length===0&&run.proposals.length===0));

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // Supplier group report sources retain charge cents and each allocation through partial receiving, closure and reopening
 const cleanups=[];const t={after:fn=>cleanups.push(fn)};
 try {

 const {supplierGroupsFixture}=await import('./po-supplier-groups-fixture.mjs'),h=await harness();t.after(()=>h.close());const f=await supplierGroupsFixture(h),{cmd,buyer}=f;
 const request=await f.create({lines:[{...f.draft.lines[0],quantity:'2',unitMinor:15000},{...f.draft.lines[1],unitMinor:20000},{...f.draft.lines[0],description:'synthetic-purse-8160',unitMinor:50000}]}),converted=await f.convert(request,{issue:true,conversionEdits:f.edits(request,{lines:[{id:request.lines[2].id,supplier:f.suppliers[1].id}],charges:[{kind:'freight',description:'Supplied freight',amountMinor:7},{kind:'tax',description:'Supplied tax',amountMinor:3},{kind:'other',description:'Supplied handling',amountMinor:1}]})}),groups=converted.supplierOrders;
 assert.deepEqual(groups.map(group=>group.totalMinor),[50005,50006]);
 const figures=async()=>{const state=(await h.state()).data,events=state.commitment.filter(event=>event.request===request.id);return f.policies.map(policy=>events.reduce((sum,event)=>sum+(event.budgetAllocations.find(share=>share.policy===policy.id)?.amountMinor??0),0));};
 assert.deepEqual(await figures(),[80009,20002]);
 assert.deepEqual((await f.report()).rows.filter(row=>row.request===request.id).map(row=>[row.line,row.amountMinor]).sort(),[[request.lines[0].id,30003],[request.lines[1].id,20002],[request.lines[2].id,50006]].sort());
 await cmd('receipt',{order:groups[0].id,line:request.lines[0].id,event:'receive',quantity:'1',reason:'One source unit received'});
 assert.deepEqual(await figures(),[65008,20002]);assert.equal((await f.report()).totals[0].committedMinor,85010);
 await cmd('close-order',{id:groups[1].id,version:0,reason:'Close only the second supplier remainder'},buyer);assert.deepEqual(await figures(),[15002,20002]);assert.equal((await f.report()).totals[0].committedMinor,35004);
 const positions=(await h.state()).data.periodBudgets;assert.deepEqual(f.policies.map(policy=>positions.find(position=>position.id===policy.id).committedMinor),[30003,20002]);
 await cmd('reopen-order',{id:groups[1].id,version:1,reason:'Reopen the exact supported balance'},buyer);assert.deepEqual(await figures(),[65008,20002]);assert.equal((await f.report()).totals[0].committedMinor,85010);
 await cmd('close-order',{id:groups[0].id,version:0,line:request.lines[1].id,reason:'Close only the Research line in a mixed-code group'},buyer);assert.deepEqual(await figures(),[65008,0]);const closedPositions=(await h.state()).data.periodBudgets;assert.deepEqual(f.policies.map(policy=>closedPositions.find(position=>position.id===policy.id).committedMinor),[80009,0]);assert.equal((await f.report()).totals[0].committedMinor,65008);

 } finally {for(const close of cleanups.reverse())await close();}
}
}
