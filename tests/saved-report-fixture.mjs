import {createHash} from 'node:crypto';
import {harness} from './purse-harness.mjs';
export const reportMail = number => 'synthetic-purse-' + number + String.fromCharCode(64) + 'example.test';
export async function savedReportFixture() {
 let uncertain=false;
 const h=await harness({mail:message=>uncertain&&message.subject.startsWith('Saved report:')?new Response('',{status:503}):Response.json({id:crypto.randomUUID()}),protectedKey:createHash('sha256').update('synthetic-purse-4123').digest('hex')}),cmd=h.command;
 try {
  await cmd('business',{name:'synthetic-purse-4100',currencies:['USD','CAD'],locations:['Denver'],costCentres:['Operations','Research'],projects:['Network']});
  const finance=await h.member(reportMail(4101),['finance-viewer']),requester=await h.member(reportMail(4102),['requester']),approver=await h.member(reportMail(4103),['approver']);
  await cmd('member',{email:reportMail(4101),name:'Scoped finance',active:true,grants:[{role:'finance-viewer',scope:{departments:['Operations']}}]});
  const supplier=await cmd('supplier',{name:'@synthetic-purse-4104',status:'preferred',reason:'Reviewed native supplier'});
  const meta=(await h.send('/api/purse/supplier-protected/'+supplier.id,undefined,h.owner)).value;
  const protectedValues={tin:'987651234',bankAccount:'9876543215678',bankRouting:'123456789'};
  const protectedResult=await h.send('/api/purse/supplier-protected/'+supplier.id+'/store',{revision:meta.revision,values:protectedValues,reason:'Synthetic protected export exclusion',evidence:'synthetic-purse-4105'},h.owner);
  if(protectedResult.status!==200)throw Error(JSON.stringify(protectedResult.value));
  for(const currency of ['USD','CAD'])await cmd('policy',{name:'synthetic-purse-4106-'+currency,currency,category:'*',project:'*',approver:reportMail(4103),limitMinor:500000,budgetMinor:3000000});
  const form=await cmd('intake-form',{name:'synthetic-purse-4107',purchaseType:'goods',consent:true,headerFields:[{id:'region',label:'Region',type:'text'}],lineFields:[{id:'grant',label:'Grant code',type:'text'}]});
  const draft={title:'=1+1',supplier:supplier.id,currency:'USD',needDate:'2027-01-15',location:'Denver',costCentre:'Operations',terms:'Net 30',intakeForm:form.id,customFields:{region:'synthetic-purse-4108'},lines:[{description:'+synthetic-purse-4109,"quoted"',quantity:'1',unitMinor:10001,category:'Equipment',project:'Network',glAccount:'6200',customFields:{grant:'-synthetic-purse-4110'},allocations:[{costCentre:'Operations',project:'Network',glAccount:'6200',basisPoints:6000},{costCentre:'Operations',project:'Network',glAccount:'6300',basisPoints:4000}]}]};
  async function submit(input) { const request=await cmd('request',input,requester);await cmd('submit',{id:request.id,revision:1},requester);await cmd('decision',{id:request.id,revision:1,decision:'approved',reason:'Reviewed exact native authority'},approver);return request; }
  const request=await submit(draft),order=await cmd('convert',{id:request.id,revision:1});await cmd('issue',{id:order.id,revision:1,reason:'Issue exact native terms'});
  await cmd('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'0.4',reason:'Accepted partial delivery'});
  const invoice=await cmd('invoice',{order:order.id,reference:'synthetic-purse-4111',source:'Private original context',allocations:[{line:order.lines[0].id,quantity:'0.4',amountMinor:4000}]});
  const unsplit={...draft,glAccount:'6400',intakeForm:undefined,customFields:{},lines:[{description:'synthetic-purse-4112',quantity:'1',unitMinor:3000,category:'Equipment',project:'Network',glAccount:'6400'}]};
  const reserved=await submit({...unsplit,title:'synthetic-purse-4113'}),cad=await submit({...unsplit,title:'synthetic-purse-4114',currency:'CAD',lines:unsplit.lines.map(line=>({...line,unitMinor:5003}))});
  const hidden=await submit({...unsplit,title:'synthetic-purse-4115',costCentre:'Research',lines:unsplit.lines.map(line=>({...line,unitMinor:7000}))});
  const save=async(filters={},name='synthetic-purse-4116',cookie=finance)=>h.send('/api/purse/saved-reports',{name,filters},cookie);
  return {reportMailUncertain:value=>{uncertain=value;},h,cmd,finance,requester,approver,supplier,form,request,order,invoice,reserved,cad,hidden,protectedValues,draft,submit,save,close:()=>h.close()};
 } catch(error) { await h.close();throw error; }
}
