export const email = n => 'synthetic-purse-'+n+String.fromCharCode(64)+'example.test';
export async function budgetFixture(h) {
 const cmd=h.command;
 await cmd('business',{name:'synthetic-purse-2500',currencies:['USD','EUR'],locations:['Denver','Austin'],costCentres:['Operations','Research'],projects:['Office']});
 const requester=await h.member(email(2501),['requester']),approver=await h.member(email(2502),['approver']),owner=await h.member(email(2503),['finance-viewer']);
 await cmd('member',{email:email(2503),name:'Budget steward',grants:[{role:'finance-viewer',scope:{departments:['Operations'],locations:['Denver'],projects:['Office']}}],active:true});
 const outside=await h.member(email(2504),['requester']);
 const supplier=await cmd('supplier',{name:'synthetic-purse-2505',status:'preferred',reason:'Reviewed native budget supplier'});
 const base={category:'Office',project:'Office',costCentre:'Operations',location:'Denver',glAccount:'6100',budgetPeriod:{from:'2027-01-01',through:'2027-03-31'},approver:email(2502),limitMinor:1000000,budgetMinor:200000,overBudget:'block',approvalSteps:[]};
 const usd=await cmd('policy',{...base,name:'Operations quarter',currency:'USD'}),eur=await cmd('policy',{...base,name:'Euro quarter',currency:'EUR'});
 const csv='budget,amount,currency,department,location,project,glAccount,owner,thresholds\nops,1000.01,USD,Ops,DEN,Office,GL6100,Steward,80;95\neuro,1200.23,EUR,Ops,DEN,Office,GL6100,Steward,80\n';
 const fields='budget,amount,currency,department,location,project,glAccount,owner,thresholds'.split(',');
 const mapping={columns:Object.fromEntries(fields.map(field=>[field,field])),budgets:{ops:usd.id,euro:eur.id},dimensions:{department:{Ops:'Operations'},location:{DEN:'Denver'},project:{Office:'Office'},glAccount:{GL6100:'6100'}},owners:{Steward:email(2503)}};
 const input={csv,mapping};
 const preview=async(input,code=200,cookie=h.owner)=>{const response=await h.send('/api/purse/budget-import/preview',input,cookie);if(response.status!==code)throw Error('preview '+response.status+': '+JSON.stringify(response.value));return response.value;};
 const commit=(review,more={},code=200,cookie=h.owner)=>cmd('budget-import-commit',{...input,fingerprint:review.fingerprint,review:review.review,consent:true,...more},cookie,code);
 const purchase=async(amountMinor,title='Budget exposure source')=>{const request=await cmd('request',{title,supplier:supplier.id,currency:'USD',needDate:'2027-02-15',location:'Denver',costCentre:'Operations',glAccount:'6100',terms:'Net 30',lines:[{description:'Quarter supplies',quantity:'1',unitMinor:amountMinor,category:'Office',project:'Office'}]},requester);await cmd('submit',{id:request.id,revision:1},requester);return request;};
 return {input,preview,commit,purchase,requester,approver,owner,outside,usd,eur,supplier};
}
