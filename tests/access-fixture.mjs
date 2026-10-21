import {createEmailIntakeEdge} from './email-intake-fixture.mjs';
import {accessSources} from './access-sources-fixture.mjs';
import {createHash} from 'node:crypto';
import {harness} from './purse-harness.mjs';
export async function accessFixture({withSources=false}={}){
 const edge=withSources?await createEmailIntakeEdge():undefined;
 const h=await harness({...(edge?{mailRequest:edge.mailRequest}:{}),protectedKey:createHash('sha256').update('synthetic-purse-201').digest('hex')});
 try{
 const cmd=h.command,cookies={owner:h.owner};
 await cmd('business',{name:'Canyon Field Services',currencies:['USD'],locations:['Denver','Boston'],costCentres:['Facilities','Engineering'],projects:['Safety','IT']});
 for(const role of ['admin','requester','approver','buyer','receiver','ap-clerk','finance-viewer','auditor'])cookies[role]=await h.member(role+'@example.test',[role]);
 cookies.other=await h.member('engineering@example.test',['requester']);
 const scope={departments:['Facilities'],locations:['Denver'],projects:['Safety'],entities:['main']};
 for(const role of ['requester','buyer','receiver','ap-clerk','finance-viewer','auditor'])await cmd('member',{email:role+'@example.test',name:role,grants:[{role,scope}]});
 await cmd('member',{email:'engineering@example.test',name:'Engineering requester',grants:[{role:'requester',scope:{departments:['Engineering'],locations:['Boston'],projects:['IT'],entities:['main']}}]});
 await cmd('access-role',{name:'Receiving lead',permissions:['receive','po.read'],scope:{locations:['Denver']}},cookies.admin);
 cookies.lead=await h.member('receiving-lead@example.test',['receiver']);
 await cmd('member',{email:'receiving-lead@example.test',name:'Receiving lead',grants:[{role:'receiving-lead',scope:{locations:['Denver']}}]});
 const suppliers=[];for(const name of ['Prairie Safety Supply','Atlantic Engineering Supply'])suppliers.push(await cmd('supplier',{name,status:'preferred',reason:'Reviewed supplier for current purchasing',contacts:[{name:'Supplier sales',email:'sales'+suppliers.length+'@example.test'}]}));
 for(const [index,s]of suppliers.entries()){const revision=(await h.send('/api/purse/supplier-protected/'+s.id,undefined,h.owner)).value.revision;const response=await h.send('/api/purse/supplier-protected/'+s.id+'/store',{revision,values:{tin:index?'736291854':'628194735',bankRouting:'384729165',bankAccount:index?'927364819052':'836291047562'},reason:'Reviewed private tax and bank source',evidence:'Private supplier register'},h.owner);if(response.status!==200)throw new Error(JSON.stringify(response.value));}
 for(const project of ['Safety','IT'])await cmd('policy',{name:project+' purchasing',currency:'USD',category:'Equipment',project,approver:'approver@example.test',limitMinor:1000000,budgetMinor:1000000});
 const draft=(i,title)=>({title,supplier:suppliers[i].id,currency:'USD',needDate:'2026-11-18',location:i?'Boston':'Denver',costCentre:i?'Engineering':'Facilities',terms:'Net 30; original supplier terms',lines:[{description:i?'Private engineering sensor':'Denver safety kits',quantity:'10',unitMinor:i?7000:1000,category:'Equipment',project:i?'IT':'Safety'}]});
 const requests=[],orders=[],invoices=[],sources=[];
 for(const i of [0,1]){
  const cookie=i?cookies.other:cookies.requester,r=await cmd('request',draft(i,i?'Engineering sensor order':'Facilities safety order'),cookie);requests.push(r);
  await cmd('submit',{id:r.id,revision:r.revision},cookie);await cmd('decision',{id:r.id,revision:r.revision,decision:'approved',reason:'Reviewed exact supplier and budget'},cookies.approver);
  const o=await cmd('convert',{id:r.id,revision:r.revision},h.owner);await cmd('issue',{id:o.id,revision:o.revision,reason:'Approved document issued manually'},h.owner);orders.push(o);
  const inv=await cmd('invoice',{order:o.id,reference:i?'PRIVATE-ENG-204':'FAC-203',source:'Original supplier invoice',allocations:[{line:o.lines[0].id,quantity:'10',amountMinor:o.totalMinor}]},h.owner);invoices.push(inv);
  sources.push(await cmd('invoice-source',{order:o.id,document:{name:i?'private-engineering.txt':'facilities-original.txt',mediaType:'text/plain',base64:Buffer.from(i?'Private engineering original':'Facilities invoice original').toString('base64')}},h.owner));
 }
 await cmd('member',{email:'approver@example.test',name:'Approver',grants:[{role:'approver',scope}]});
 const pending=[];for(const i of [0,1]){const cookie=i?cookies.other:cookies.requester,r=await cmd('request',draft(i,i?'Engineering approval waiting':'Facilities approval waiting'),cookie);await cmd('submit',{id:r.id,revision:r.revision},cookie);pending.push(r);}
 const result={h,cookies,scope,suppliers,requests,orders,invoices,sources,pending,draft};
 if(withSources)Object.assign(result,await accessSources(result,edge));return result;
 }catch(error){await h.close();throw error;}
}
