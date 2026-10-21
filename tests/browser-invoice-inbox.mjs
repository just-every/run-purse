import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {session,api,current} from './browser-journey.mjs';

/** INVOICE-001: held AP mail arrives through real signed ingress in the imported fixture archive. */
export async function invoiceInboxJourney(browser,root,origin,width,evidence){
 const owner=await session(browser,root,origin,'owner',width),buyer=await session(browser,root,origin,'buyer',width),requester=await session(browser,root,origin,'requester',width),approver=await session(browser,root,origin,'approver',width);
 try{
  let data=(await current(buyer.context,origin)).data;const capture=data.apInvoiceEmail.find(c=>c.providerEmailId==='browser_ap_invoice_'+width);assert.ok(capture);assert.equal(capture.status,'held');
  assert.equal((await current(requester.context,origin)).data.apInvoiceEmail.length,0,'Requesters never see AP mail');
  let supplier=data.supplier.find(s=>s.name==='Canyon Field Supply');
  if(!supplier){const profile={name:'Canyon Field Supply',status:'preferred',reason:'Field equipment supplier',contacts:[{name:'Jordan',email:'invoices@canyon.example.test'}],remitTo:'Canyon Field Supply, 1550 Market Street, Denver CO 80202'};const duplicates=await api(buyer.context,origin,'supplier-duplicates',profile);supplier=await api(buyer.context,origin,'supplier',{...profile,...(duplicates.matches.length?{duplicateFingerprint:duplicates.fingerprint,duplicateReason:'Distinct field supplier and source invoice, shared purchasing contact reviewed'}:{})});}
  const business=data.business[0];await api(owner.context,origin,'policy',{name:'AP inbox '+width,currency:'USD',category:'AP inbox',project:'*',approver:'approver@dev.localhost',limitMinor:1000000,budgetMinor:5000000});
  const request=await api(requester.context,origin,'request',{title:'INVOICE-001 field kits '+width,supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:business.locations[0],costCentre:business.costCentres[0],terms:'Net 30',lines:[{description:'Field inspection kit',quantity:'10',unitAmount:'50.00',category:'AP inbox',project:business.projects[0]}]});
  await api(requester.context,origin,'submit',{id:request.id,revision:1});await api(approver.context,origin,'decision',{id:request.id,revision:1,decision:'approved',reason:'Field kit requirement approved'});const order=await api(buyer.context,origin,'convert',{id:request.id,revision:1});await api(buyer.context,origin,'issue',{id:order.id,revision:1,reason:'Issued approved supplier document'});
  await owner.page.reload();await owner.page.getByRole('navigation').getByRole('button',{name:'Orders',exact:true}).click();
  const settings=owner.page.getByRole('region',{name:'Supplier invoice inbox'});await settings.getByText('AP email address',{exact:true}).click();assert.equal(await settings.getByLabel('AP email address',{exact:true}).inputValue(),'ap@example.test');
  await buyer.page.reload();await buyer.page.getByRole('navigation').getByRole('button',{name:'Orders',exact:true}).click();
  const inbox=buyer.page.getByRole('region',{name:'Supplier invoice inbox'});assert.equal(await inbox.getByText('AP email address',{exact:true}).count(),0,'Only the owner changes the AP address');
  await inbox.getByRole('row').filter({hasText:'Supplier invoice '+width}).getByRole('button',{name:'Open AP email',exact:true}).click();
  const draft=buyer.page.getByRole('region',{name:'AP email draft'});await draft.getByText('Held: Sender matches no supplier contact',{exact:true}).waitFor();
  const href=await draft.getByRole('link',{name:'quote.pdf',exact:true}).getAttribute('href'),file=await buyer.context.request.get(origin+href);assert.equal(file.status(),200);assert.equal(createHash('sha256').update(await file.body()).digest('hex'),capture.files[0].sha256,'The AP original downloads byte for byte');
  assert.equal(await buyer.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await buyer.page.screenshot({path:join(evidence,`INVOICE-001-held-${width}.png`),fullPage:true});
  await draft.getByLabel('Assign to supplier',{exact:true}).selectOption(supplier.id);await draft.getByLabel('Assignment reason',{exact:true}).fill('Supplier confirmed its billing mailbox by phone');
  const assigned=buyer.page.waitForResponse(r=>r.url().endsWith('/api/purse/command/invoice-inbox-assign'));await draft.getByRole('button',{name:'Assign AP email',exact:true}).click();assert.equal((await assigned).status(),200);
  await draft.getByLabel('Purchase order for quote.pdf',{exact:true}).selectOption(order.id);
  const started=buyer.page.waitForResponse(r=>r.url().endsWith('/api/purse/command/invoice-extract'));await draft.getByRole('button',{name:'Start invoice reading: quote.pdf',exact:true}).click();assert.equal((await started).status(),200);
  await draft.getByText(/invoice reading started/).waitFor();
  data=(await current(buyer.context,origin)).data;const source=data.invoiceSource.find(s=>s.apInvoiceEmail===capture.id);assert.ok(source);assert.equal(source.order,order.id);assert.equal(source.apSender,capture.providerSender);
  assert.ok(data.invoiceReading.some(r=>r.source===source.id));assert.equal(data.invoice.filter(i=>i.order===order.id).length,0,'Starting a reading creates no invoice evidence');
  assert.equal(await buyer.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await buyer.page.screenshot({path:join(evidence,`INVOICE-001-reading-${width}.png`),fullPage:true});
  return {clause:'INVOICE-001',width,capture:capture.id,source:source.id};
 }catch(error){await buyer.page.screenshot({path:join(evidence,`INVOICE-001-buyer-failure-${width}.png`),fullPage:true});throw error;}finally{for(const s of [owner,buyer,requester,approver])await s.context.close();}
}
