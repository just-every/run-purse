import {harness} from './purse-harness.mjs';
export async function agentGovernanceFixture(options) {
 const h=await harness(options),cmd=h.command;
 await cmd('business',{name:'Summit field services',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Site']});
 const buyer=await h.member('buyer@example.test',['buyer']),requester=await h.member('requester@example.test',['requester']),other=await h.member('other@example.test',['requester']),approver=await h.member('approver@example.test',['approver']);
 const supplier=await cmd('supplier',{name:'Summit industrial equipment',status:'preferred',reason:'Approved site supplier',contacts:[{name:'Casey Morgan',email:'orders@summit.example.test'}]},buyer);
 await cmd('policy',{name:'Site equipment',currency:'USD',category:'Equipment',project:'Site',approver:'approver@example.test',limitMinor:1000000,budgetMinor:5000000});
 const day=offset=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
 const purchase=async(title,category='Equipment')=>{
  const r=await cmd('request',{title,supplier:supplier.id,currency:'USD',needDate:day(20),location:'Denver',costCentre:'Operations',terms:'Supplier quote; Net 30',lines:[{description:'Lifting harness',quantity:'4',unitMinor:12500,category,project:'Site'}]},requester);
  await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Site safety equipment'},approver);
  const o=await cmd('convert',{id:r.id,revision:1},buyer);return cmd('issue',{id:o.id,revision:1,reason:'Approved document issued through existing supplier channel'},buyer);
 };
 const order=await purchase('Replacement lifting harnesses');
 const controls={agent:'AGENT-003',purchaseType:'Equipment',version:0,enabled:true,cadenceDays:1,maxChases:2,reason:'Owner enables acknowledge and delivery-timing follow-up only'};
 const schedule={order:order.id,version:0,agent:'AGENT-003',enabled:true,cadenceDays:1,maxChases:2,escalateTo:'buyer@example.test'};
 const tick=async days=>{const r=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+new Date(day(days)+'T17:00:00Z').getTime());if(r.status!==200)throw new Error(await r.text());};
 return {h,cmd,buyer,requester,other,approver,supplier,order,day,purchase,controls,schedule,tick,close:()=>h.close()};
}
