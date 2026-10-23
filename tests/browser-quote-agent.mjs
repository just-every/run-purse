import assert from 'node:assert/strict';
import {join} from 'node:path';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {session,api,current} from './browser-journey.mjs';

/** Parent journey runner owns browser lifetime and calls this at 1440 and 390. No live inbox delivery is claimed. */
export async function quoteAgentJourney(browser,root,origin,width,evidence){
 const owner=await session(browser,root,origin,'owner',width),buyer=await session(browser,root,origin,'buyer',width),requester=await session(browser,root,origin,'requester',width);
 try{
  const tag='synthetic-purse-'+width+'-'+crypto.randomUUID().slice(0,6),business=(await current(owner.context,origin)).data.business[0],category='Quote analysis '+tag;
  await api(owner.context,origin,'agent-policy',{agent:'AGENT-002',purchaseType:category,enabled:true,cadenceDays:1,maxChases:2,version:0,reason:'Owner enables native quote analysis'});
  const suppliers=[];for(let i=0;i<3;i++){const input={name:`Quote analysis supplier ${i} ${tag}`,status:'active',reason:'Nominated for quotation',contacts:[{name:'Sales',email:`supplier-${i}-${tag}@example.test`}]};const review=await api(buyer.context,origin,'supplier-duplicates',input);suppliers.push(await api(buyer.context,origin,'supplier',{...input,duplicateFingerprint:review.fingerprint,duplicateReason:'Buyer reviewed distinct supplier and contact'}));}
  const request=await api(requester.context,origin,'request',{title:'Quote agent safety kits '+tag,supplier:suppliers[0].id,currency:'USD',needDate:'2026-12-01',location:business.locations[0],costCentre:business.costCentres[0],terms:'Net 30',lines:[{description:'Safety kit',quantity:'10',unit:'kit',partNumber:'KIT',unitMinor:100000,category,project:business.projects[0]}]});
  const rfq=await api(buyer.context,origin,'rfq-create',{request:request.id,revision:1,scope:'Ten safety kits, KIT specification',suppliers:suppliers.map(supplier=>supplier.id),questions:[],deadline:new Date(Date.now()+86400000).toISOString(),reminderAt:new Date(Date.now()+3600000).toISOString()});
  const open=async()=>{await buyer.page.reload();await buyer.page.getByRole('navigation').getByRole('button',{name:'Requests',exact:true}).click();await buyer.page.getByRole('article').filter({hasText:request.title}).getByRole('button',{name:'Open request'}).click();};
  await open();const region=buyer.page.getByRole('region',{name:'Quote collection agent'});await region.getByText('Quote agent · RFQ revision 1',{exact:true}).click();
  await region.getByRole('checkbox').check();await region.getByLabel('Quote agent consent reason',{exact:true}).fill('Buyer approves these native requirements and invitation contacts');await region.getByRole('button',{name:'Approve RFQ for quote agent',exact:true}).click();await region.getByRole('button',{name:'Run quote normalization',exact:true}).waitFor();
  await buyer.page.screenshot({path:join(evidence,`AGENT-002-consent-${width}.png`),fullPage:true});
  const lines=(price,quantity,tax)=>['Currency: USD','Description | Qty | Unit Price | Unit',`Safety kit | ${quantity} | ${price} | kit`,'Freight: 0',...(tax?['Tax: 0']:[]),'Lead time: Seven days','Validity: Thirty days','Terms: Net 30'];
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),page=doc.addPage();lines('1000','10',true).forEach((line,i)=>page.drawText(line,{x:30,y:780-i*22,size:10,font}));
  const files=[{name:'synthetic-purse-0.pdf',mediaType:'application/pdf',base64:Buffer.from(await doc.save()).toString('base64')},
   {name:'synthetic-purse-1.txt',mediaType:'text/plain',base64:Buffer.from(lines('900','9',true).join('\n')).toString('base64')},
   {name:'synthetic-purse-2.eml',mediaType:'message/rfc822',base64:Buffer.from('Content-Type: text/plain; charset=utf-8\r\n\r\n'+lines('800','10',false).join('\r\n')).toString('base64')}];
  for(let i=0;i<3;i++){
   const invitation=await buyer.context.request.post(origin+'/api/purse/rfq/send',{headers:{origin},data:{rfq:rfq.id,supplier:suppliers[i].id}});assert.equal(invitation.status(),200);const issued=await invitation.json();
   const response=await buyer.context.request.post(issued.url,{headers:{origin},data:{currency:'USD',freightAmount:'0',taxAmount:'0',leadTime:'Seven days',validity:'Thirty days',conditions:'Net 30',answers:[],lines:rfq.lines.map(line=>({requestLine:line.id,description:line.description,quantity:line.quantity,unit:line.unit,partNumber:line.partNumber,unitAmount:String(1000-i*100)})),files:[files[i]]}});assert.equal(response.status(),200,await response.text());
  }
  const execution=buyer.page.waitForResponse(response=>response.url().endsWith('/api/purse/command/quote-agent-run'));await region.getByRole('button',{name:'Run quote normalization',exact:true}).click();const response=await execution;assert.equal(response.status(),200);const run=await response.json();assert.equal(run.comparison.length,3);assert.equal(run.comparison.filter(row=>row.eligible).length,1);assert.equal(run.recommendations[0].supplier,suppliers[0].id);
  await region.getByText('Original item quantity or unit differs from the specification',{exact:false}).waitFor();await region.getByText('Original does not state taxAmount',{exact:false}).waitFor();
  await region.getByText('Original: synthetic-purse-0.pdf',{exact:true}).click();await region.getByRole('link',{name:'Download exact supplier original',exact:true}).first().waitFor();
  await buyer.page.screenshot({path:join(evidence,`AGENT-002-normalized-${width}.png`),fullPage:true});assert.equal(await buyer.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  let data=(await current(buyer.context,origin)).data;assert.equal(data.quoteAward.filter(row=>row.request===request.id).length,0);assert.equal(data.request.find(row=>row.id===request.id).revision,1);assert.equal(data.request.find(row=>row.id===request.id).status,'draft');
  await region.getByText('Review a supplier clarification',{exact:true}).click();await region.getByLabel('Clarification supplier',{exact:true}).selectOption(suppliers[0].id);await region.getByLabel('Supplier clarification question',{exact:true}).fill('Can you approve different payment terms?');await region.getByRole('button',{name:'Prepare specification answer',exact:true}).click();await region.getByText('buyer-escalation',{exact:false}).waitFor();
  await buyer.page.screenshot({path:join(evidence,`AGENT-002-escalation-${width}.png`),fullPage:true});assert.equal(await buyer.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await region.getByRole('button',{name:'Record buyer review without award',exact:true}).first().click();
  data=(await current(buyer.context,origin)).data;assert.equal(data.quoteAward.filter(row=>row.request===request.id).length,0);assert.equal(data.decision.filter(row=>row.request===request.id).length,0);
  const denied=await requester.context.request.post(origin+'/api/purse/command/quote-agent-run',{headers:{origin},data:{rfq:rfq.id,revision:1}});assert.equal(denied.status(),403);
  return {clause:'AGENT-002',width,request:request.id,rfq:rfq.id,run:run.id,mode:run.mode,providerQualification:'NOT RUN: no three live supplier inboxes'};
 }finally{await owner.context.close();await buyer.context.close();await requester.context.close();}
}
