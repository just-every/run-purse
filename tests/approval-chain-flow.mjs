import assert from 'node:assert/strict';
export async function approvalChainFlow(h) {
 const {command:cmd,state,send}=h;
 await cmd('business',{name:'synthetic-purse-3100',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Office']});
 const emails=Array.from({length:7},(_,n)=>`synthetic-purse-${3101+n}@example.test`),cookies=[];
 for(const email of emails)cookies.push(await h.member(email,['requester','approver','buyer']));
 const [requester,manager,f1,f2,f3,it,security]=cookies;
 const supplier=await cmd('supplier',{name:'synthetic-purse-3110',status:'preferred',reason:'Reviewed'});
 const policy=await cmd('policy',{name:'Native conditional chain',currency:'USD',category:'*',project:'Office',approver:emails[1],limitMinor:10000000,budgetMinor:100000000,approvalSteps:[{emails:emails.slice(2,5),mode:'any',minMinor:1000001},{emails:emails.slice(5),mode:'all',purchaseType:'software'}]});
 const input=(amount,category='Software')=>({title:'Conditional software purchase',supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Software purchase',quantity:'1',unitMinor:amount,category,project:'Office'}]});
 const create=async(amount,category='Software',who=requester)=>cmd('request',input(amount,category),who);
 const read=async(id,who=h.owner)=>(await state(who)).data.request.find(r=>r.id===id);
 const decide=async(r,who,chainStep,decision='approved',expected=200)=>cmd('decision',{id:r.id,revision:r.revision,chainStep,approvalAttempt:(await read(r.id)).approvalAttempt,decision,reason:'Exact chain reviewed'},who,expected);
 for(const [amount,category,count]of [[1000000,'Equipment',1],[1000001,'Equipment',2],[1000000,'Software',3],[1200000,'Software',4]]){
  const r=await create(amount,category);const preview=(await read(r.id,requester)).approvalPreview;assert.equal(preview.length,count);
  const expected=['primary',...(amount>1000000?['step-0']:[]),...(category==='Software'?emails.slice(5).map((email,index)=>'step-1:'+index):[])];assert.deepEqual(preview.map(step=>step.id),expected);if(amount>1000000)assert.ok(preview.find(step=>step.id==='step-0').reason.includes('USD 10,000.01'));if(category==='Software')assert.ok(preview.find(step=>step.id==='step-1:0').reason.includes('software'));
  await cmd('submit',{id:r.id,revision:1},requester);assert.deepEqual((await read(r.id)).approvalRoute.map(step=>step.id),expected);
 }
 const r=await create(1200000);await cmd('submit',{id:r.id,revision:1},requester);
 await decide(r,it,'step-1:0','approved',403);
 await decide(r,manager,'primary');
 for(const cookie of [f1,f2,f3]){const view=await read(r.id,cookie);assert.equal(view.mayApprove,true);assert.equal(view.approvalStep,'step-0');}
 await decide(r,f2,'step-0');
 const decisions=(await state()).data.decision.filter(d=>d.request===r.id);assert.equal(decisions.find(d=>d.chainStep==='step-0').email,emails[3]);
 for(const cookie of [f1,f2,f3])assert.equal((await read(r.id,cookie)).mayApprove,false);
 const stale=await send('/api/purse/command/decision',{id:r.id,revision:1,chainStep:'step-0',approvalAttempt:(await read(r.id)).approvalAttempt,decision:'approved',reason:'Old pool action'},f1);assert.equal(stale.status,409);assert.ok(stale.value.error.includes(emails[3]));
 assert.equal((await read(r.id,it)).mayApprove,true);assert.equal((await read(r.id,security)).mayApprove,true);
 await decide(r,security,'step-1:1');assert.equal((await read(r.id)).status,'pending');assert.equal((await read(r.id,it)).mayApprove,true);assert.equal((await read(r.id,security)).mayApprove,false);
 await decide(r,it,'step-1:0');assert.equal((await read(r.id)).status,'approved');
 const order=await cmd('convert',{id:r.id,revision:1},f1);await cmd('issue',{id:order.id,revision:1,reason:'Approved exact route'},f1);
 const log=await send('/api/purse/audit?subject='+r.id,undefined,h.owner);const events=log.value.events.filter(e=>e.action==='decision');assert.equal(events.length,4);assert.deepEqual(new Set(events.map(e=>e.chainStep)),new Set(['primary','step-0','step-1:0','step-1:1']));assert.ok(events.every(e=>e.route.length===4&&e.policyVersion));
 const csv=await send('/api/purse/audit.csv?subject='+r.id,undefined,h.owner);assert.equal(csv.status,200);assert.ok(csv.value.includes(emails[3]));assert.ok(csv.value.includes('Native conditional chain'));
 const changed=await cmd('amend',{...input(900000,'Equipment'),id:r.id,revision:1,lines:order.lines.map(line=>({...line,unitMinor:900000,category:'Equipment'})),reason:'Lower amount and different purchase type'},requester);await cmd('submit',{id:changed.id,revision:2},requester);assert.deepEqual((await read(r.id)).approvalRoute.map(s=>s.id),['primary']);await decide(changed,f2,'step-0','approved',403);
 const self=await create(1200000,'Equipment',f1);await cmd('submit',{id:self.id,revision:1},f1);await decide(self,manager,'primary');assert.deepEqual((await read(self.id)).approvalRoute[1].emails,emails.slice(3,5));assert.equal((await read(self.id,f1)).mayApprove,false);await decide(self,f1,'step-0','approved',403);
 const race=await create(1200000,'Equipment');await cmd('submit',{id:race.id,revision:1},requester);await decide(race,manager,'primary');
 const raceAttempt=(await read(race.id)).approvalAttempt;
 const outcomes=await Promise.all([f1,f3].map(cookie=>send('/api/purse/command/decision',{id:race.id,revision:1,chainStep:'step-0',approvalAttempt:raceAttempt,decision:'approved',reason:'Concurrent exact decision'},cookie)));assert.equal(outcomes.filter(x=>x.status===200).length,1);assert.equal(outcomes.filter(x=>x.status===409).length,1);assert.equal((await state()).data.decision.filter(d=>d.request===race.id&&d.chainStep==='step-0').length,1);
 const winner=(await state()).data.decision.find(d=>d.request===race.id&&d.chainStep==='step-0');const member=(await state()).data.member.find(m=>m.email===winner.email);await cmd('member',{...member,active:false});await cmd('convert',{id:race.id,revision:1},h.owner,409);await cmd('member',{...member,active:true});
 for(const decision of ['returned','rejected']){const next=await create(1200000,'Equipment');await cmd('submit',{id:next.id,revision:1},requester);await decide(next,manager,'primary');const oldAttempt=(await read(next.id)).approvalAttempt;await decide(next,f3,'step-0',decision);assert.equal((await read(next.id)).status,decision);assert.equal((await read(next.id,f1)).mayApprove,false);await decide(next,f1,'step-0','approved',409);const renewed=await cmd('submit',{id:next.id,revision:1},requester);assert.equal(renewed.revision,2);assert.equal((await read(next.id,manager)).mayApprove,true);assert.equal((await read(next.id,f1)).mayApprove,false);await decide(renewed,manager,'primary');const replay=await send('/api/purse/command/decision',{id:next.id,revision:renewed.revision,chainStep:'step-0',approvalAttempt:oldAttempt,decision:'approved',reason:'Old submission'},f1);assert.equal(replay.status,409);await decide(renewed,f1,'step-0');assert.equal((await read(next.id)).status,'approved');}
 return {requester,manager,f1,f2,f3,it,security,emails,supplier,policy,input,create,read,decide};
}
