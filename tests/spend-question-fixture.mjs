import {harness} from './purse-harness.mjs';
export async function spendQuestionFixture(){
 const h=await harness(),cmd=h.command;
 try{
 await cmd('business',{name:'Front Range Operations',currencies:['USD','CAD'],locations:['Denver'],costCentres:['Operations','Research'],projects:['Network']});
 const requester=await h.member('synthetic-purse-3101@example.test',['requester']),colleague=await h.member('synthetic-purse-3102@example.test',['requester']),approver=await h.member('synthetic-purse-3103@example.test',['approver']),finance=await h.member('synthetic-purse-3104@example.test',['finance-viewer']);
 await cmd('member',{email:'synthetic-purse-3101@example.test',name:'Operations requester',active:true,grants:[{role:'requester',scope:{departments:['Operations']},departmentRead:true}]});
 const supplier=await cmd('supplier',{name:'Canyon Network Supply',status:'preferred',reason:'Reviewed native supplier'});
 await cmd('policy',{name:'Equipment authority',currency:'USD',category:'*',project:'*',approver:'synthetic-purse-3103@example.test',limitMinor:500000,budgetMinor:3000000});
 const draft={title:'Network refresh',supplier:supplier.id,currency:'USD',needDate:'2026-11-15',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Managed network equipment',quantity:'10',unitMinor:10000,category:'Software',project:'Network',glAccount:'6200'}]};
 async function submit(input,cookie){const r=await cmd('request',input,cookie);await cmd('submit',{id:r.id,revision:1},cookie);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Reviewed native authority'},approver);return r;}
 const request=await submit(draft,requester),other=await submit({...draft,title:'Operations monitoring',lines:draft.lines.map(l=>({...l,unitMinor:4000}))},colleague),hidden=await submit({...draft,title:'Private research infrastructure',costCentre:'Research',lines:draft.lines.map(l=>({...l,unitMinor:9000}))},colleague);
 const order=await cmd('convert',{id:request.id,revision:1});await cmd('issue',{id:order.id,revision:1,reason:'Issued confirmed exact scope'});
 const invoice=await cmd('invoice',{order:order.id,reference:'CANYON-2026-11',source:'Recorded supplier invoice',allocations:[{line:order.lines[0].id,quantity:'2',amountMinor:20000}]});
 await cmd('agent-policy',{agent:'AGENT-011',purchaseType:'*',version:0,enabled:true,cadenceDays:1,maxChases:2,reason:'Enable scoped native spend questions'});
 const questions=[
  'Show committed spend by department from 2026-10-01 through 2026-12-31',
  'How much was reserved for department Operations from 2026-10-01 through 2026-12-31',
  'Show actual spend by supplier all recorded dates',
 ];
 const expected=[{metric:'committed',filters:{groupBy:'department',from:'2026-10-01',through:'2026-12-31'},amountMinor:100000},{metric:'reserved',filters:{groupBy:'supplier',from:'2026-10-01',through:'2026-12-31',department:'Operations'},amountMinor:40000},{metric:'actual',filters:{groupBy:'supplier'},amountMinor:20000}];
 return {expected,h,cmd,requester,colleague,approver,finance,supplier,request,other,hidden,order,invoice,questions,close:()=>h.close()};
 }catch(e){await h.close();throw e;}
}
