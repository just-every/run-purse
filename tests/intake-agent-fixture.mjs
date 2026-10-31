import { harness } from './purse-harness.mjs';
export const intakeEmail = n => ['synthetic-purse-'+n,'example.test'].join('@');
export async function intakeAgentFixture() {
 const h=await harness({worker:'tests/accrual-worker.ts',clock:'2026-10-29T17:00:00.000Z',protectedKey:'42'.repeat(32)}),cmd=h.command;
 await cmd('business',{name:'synthetic-purse-1',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Site']});
 const requester=await h.member(intakeEmail(2),['requester']),other=await h.member(intakeEmail(3),['requester']),buyer=await h.member(intakeEmail(4),['buyer']),approver=await h.member(intakeEmail(5),['approver']);
 const supplier=await cmd('supplier',{name:'synthetic-purse-6',status:'preferred',reason:'Reviewed native supplier'},buyer);
 const item=await cmd('catalogue',{supplier:supplier.id,description:'Portable laptop',currency:'USD',unitMinor:25000,category:'Equipment',project:'Site',approved:true,partNumber:'synthetic-purse-7'},buyer);
 const policy=await cmd('policy',{name:'Equipment approval',currency:'USD',category:'Equipment',project:'Site',approver:intakeEmail(5),limitMinor:1000000,budgetMinor:5000000,approvalSteps:[]});
 const form=await cmd('intake-form',{name:'Equipment requests',purchaseType:'equipment',active:true,consent:true,defaults:{category:'Equipment',project:'Site',costCentre:'Operations',location:'Denver',currency:'USD'}});
 const create=async(cookie=requester,glAccount='6100')=>{
  const request=await cmd('request',{title:'synthetic-purse-8',supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Operations',terms:'Net 30',intakeForm:form.id,answers:{},customFields:{},lines:[{catalogue:item.id,quantity:'1',unitMinor:25000,category:'Equipment',project:'Site',glAccount,customFields:{}}]},cookie);
  await cmd('submit',{id:request.id,revision:1},cookie);await cmd('decision',{id:request.id,revision:1,decision:'approved',reason:'Reviewed native catalogue history'},approver);return request;
 };
 const history=await create();
 const controls={agent:'AGENT-001',purchaseType:'equipment',version:0,enabled:true,cadenceDays:1,maxChases:2,reason:'Owner permits reviewed deterministic draft preparation'};
 const enable=async(enabled=true)=>{const old=(await h.state()).data.agentPolicy.find(row=>row.agent==='AGENT-001'&&row.purchaseType==='equipment');return cmd('agent-policy',{...controls,version:old?.version??0,enabled});};
 const input={intakeForm:form.id,need:'We need a laptop for a new colleague',needDate:'2026-12-01',terms:'Net 30'};
 const run=async(extra={},cookie=requester)=>cmd('intake-agent-run',{...input,quantity:'3',...extra},cookie);
 return {h,cmd,requester,other,buyer,approver,supplier,item,policy,form,history,controls,enable,input,run,create,close:()=>h.close()};
}
