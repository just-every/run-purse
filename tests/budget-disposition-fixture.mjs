import assert from 'node:assert/strict';
export const identity=n=>'synthetic-purse-'+n+String.fromCharCode(64)+'example.test';
export async function dispositionFixture(h) {
 const cmd=h.command;
 await cmd('business',{name:'synthetic-purse-2800',currencies:['USD'],locations:['Denver'],costCentres:['Operations','Research'],projects:['Office']});
 const requester=await h.member(identity(2801),['requester']),approver=await h.member(identity(2802),['approver']);
 const firstOwner=await h.member(identity(2803),['approver']),secondOwner=await h.member(identity(2804),['approver']);
 const buyer=await h.member(identity(2805),['buyer']),hidden=await h.member(identity(2806),['requester']);
 const supplier=await cmd('supplier',{name:'synthetic-purse-2807',status:'preferred',reason:'Reviewed budget transfer supplier'});
 const base={currency:'USD',category:'synthetic-purse-2808',project:'Office',approver:identity(2802),limitMinor:1000000,budgetMinor:200000,overBudget:'owner',budgetOwner:identity(2803),approvalSteps:[]};
 const budgets=[];for(const [period,from,through] of [['old','2027-01-01','2027-03-31'],['new','2027-04-01','2027-06-30']])for(const department of ['Operations','Research'])budgets.push(await cmd('policy',{...base,name:period+' '+department+' quarter',costCentre:department,budgetOwner:department==='Operations'?identity(2803):identity(2804),budgetPeriod:{from,through}}));
 const input={title:'Quarterly equipment',supplier:supplier.id,currency:'USD',needDate:'2027-02-15',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Equipment',quantity:'1',unitMinor:100000,category:base.category,project:'Office',allocations:[{costCentre:'Operations',project:'Office',basisPoints:6000},{costCentre:'Research',project:'Office',basisPoints:4000}]}]};
 async function decide(request,cookie=approver,status=200) {return cmd('decision',{id:request.id,revision:request.revision,decision:'approved',reason:'Exact purchase and allocation reviewed'},cookie,status);}
 async function purchase(extra={},cookie=requester){const r=await cmd('request',{...input,...extra},cookie);await cmd('submit',{id:r.id,revision:1},cookie);await decide(r);const o=await cmd('convert',{id:r.id,revision:1},buyer);await cmd('issue',{id:o.id,revision:1,reason:'Original reviewed issuance'},buyer);return {r,o};}
 const source=await purchase();
 const preview=async(o=source.o,revision=source.r.revision,cookie=h.owner,needDate='2027-05-15')=>cmd('budget-disposition-preview',{id:o.id,revision,needDate},cookie);
 const amend=async(review,extra={},status=200,cookie=h.owner)=>cmd('budget-disposition-amend',{id:review.order,revision:review.sourceRevision,needDate:review.needDate,review:review.review,consent:true,reason:'Move unchanged remaining supply into next quarter',...extra},cookie,status);
 const positions=async(cookie=h.owner)=>(await h.state(cookie)).data.periodBudgets;
 const figures=async()=>{const rows=await positions();return budgets.map(b=>{const row=rows.find(row=>row.id===b.id);return [row.amountMinor,row.reservedMinor,row.committedMinor,row.actualMinor,row.availableMinor];});};
 async function approveMove(r){await cmd('submit',{id:r.id,revision:r.revision});await decide(r);await decide(r,firstOwner);await decide(r,secondOwner);}
 const rows=async()=> (await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results;
 const unchanged=async(action)=>{const before=await rows();await action();assert.deepEqual(await rows(),before,'Refused operation changes no purchasing or money records');};
 return {cmd,requester,approver,firstOwner,secondOwner,buyer,hidden,supplier,budgets,input,...source,preview,amend,positions,figures,approveMove,decide,purchase,rows,unchanged};
}
