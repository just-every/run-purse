import assert from 'node:assert/strict'
import {join} from 'node:path'
import {session,api,current} from './browser-journey.mjs'

export async function agreementsEmptyJourney(owner,width,evidence){
 await owner.page.setViewportSize({width,height:1000});await owner.page.getByRole('navigation').getByRole('button',{name:'Agreements',exact:true}).click();
 await owner.page.getByText('Set up your business in Settings before recording agreements.',{exact:true}).waitFor();
 assert.equal(await owner.page.getByRole('button',{name:'Confirm agreement terms',exact:true}).count(),0,'CONTRACT-001 empty installation offers setup before a record form');
 assert.equal(await owner.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'CONTRACT-001 empty workspace fits '+width);
 await owner.page.screenshot({path:join(evidence,`CONTRACT-001-empty-${width}.png`)});return {clause:'CONTRACT-001',width,emptyWorkspace:true};
}

export async function agreementsJourney(browser,root,origin,width,evidence,{siteOrigin}={}){
 const owner=await session(browser,root,origin,'owner',width),buyer=await session(browser,root,origin,'buyer',width),requester=await session(browser,root,origin,'requester',width),approver=await session(browser,root,origin,'approver',width);
 try{
  const tag=width+'-'+crypto.randomUUID().slice(0,6),name='Annual maintenance '+tag,reference='AGR-'+tag;
  const data=(await current(owner.context,origin)).data,business=data.business[0],supplier=data.supplier.find(s=>s.status==='preferred'&&!s.mergedInto);
  await api(owner.context,origin,'policy',{name:'Agreement budget '+tag,currency:'USD',category:'Agreement '+tag,project:business.projects[0],approver:'approver@dev.localhost',limitMinor:2000000,budgetMinor:4000000});
  const r=await api(requester.context,origin,'request',{title:'Agreement service '+tag,supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:business.locations[0],costCentre:business.costCentres[0],terms:'Net 30',lines:[{description:'Maintenance visit '+tag,quantity:'10',unitMinor:10000,category:'Agreement '+tag,project:business.projects[0]}]});
  await api(requester.context,origin,'submit',{id:r.id,revision:1});await api(approver.context,origin,'decision',{id:r.id,revision:1,decision:'approved',reason:'Agreement service authorized'});
  const order=await api(buyer.context,origin,'convert',{id:r.id,revision:1});await api(buyer.context,origin,'issue',{id:order.id,revision:1,reason:'Approved service order issued in existing channel'});
  const invoice=await api(buyer.context,origin,'invoice',{order:order.id,reference:'SERVICE-'+tag,source:'Original invoice for service visits '+tag,allocations:[{line:order.lines[0].id,quantity:'6',amountMinor:60000}]});
  await owner.page.reload();await owner.page.getByRole('navigation').getByRole('button',{name:'Agreements',exact:true}).click();
  await owner.page.getByRole('heading',{name:'Agreements',exact:true}).waitFor();
  const fill=async(label,value)=>owner.page.getByLabel(label,{exact:true}).fill(String(value));
  await fill('Agreement name',name);await fill('Agreement reference',reference);await owner.page.getByLabel('Agreement supplier',{exact:true}).selectOption(supplier.id);await owner.page.getByLabel('Agreement currency',{exact:true}).selectOption('USD');
  await fill('Parties','Canyon Services and maintenance supplier');await fill('Start date','2026-01-01');await fill('End date','2027-01-30');await fill('Notice days',60);await fill('Payment terms','Net 30');await fill('Reminder days before notice deadline (comma-separated)','30, 7');
  await fill('CLM provider','Locket');await fill('CLM reference','LOCK-'+tag);await fill('CLM URL','https://example.test/locket/'+tag);
  await fill('Signature provider','Inkwell');await fill('Signature reference','INK-'+tag);await fill('Signature URL','https://example.test/inkwell/'+tag);await owner.page.getByLabel('Recorded signature status',{exact:true}).selectOption('signed');await fill('Signature status evidence','Owner-recorded signing receipt '+tag);await fill('Confirmation or correction reason','Owner reviewed agreement terms '+tag);
  const before=(await current(owner.context,origin)).data.agreement.length;
  await owner.page.getByRole('button',{name:'Confirm agreement terms',exact:true}).click();assert.equal((await current(owner.context,origin)).data.agreement.length,before,'CONTRACT-001 nothing saved without explicit owner confirmation');
  await owner.page.screenshot({path:join(evidence,`CONTRACT-001-confirm-${width}.png`),fullPage:true});
  await owner.page.getByLabel('Owner confirmation',{exact:true}).selectOption('confirm');let savedResponse=owner.page.waitForResponse(r=>r.url().endsWith('/command/agreement'));
  await owner.page.getByRole('button',{name:'Confirm agreement terms',exact:true}).click();assert.equal((await savedResponse).status(),200);await owner.page.getByRole('heading',{name:name+' · version 1',exact:true}).waitFor();
  const agreement=(await current(owner.context,origin)).data.agreement.find(a=>a.reference===reference);assert.ok(agreement);assert.equal(agreement.noticeDeadline,'2026-12-01');
  const region=owner.page.getByRole('region',{name:'Agreement detail'});await region.getByRole('link',{name:'Locket · LOCK-'+tag,exact:true}).waitFor();await region.getByText(/owner-recorded; not provider-verified/).waitFor();
  await owner.page.getByLabel('Invoice evidence',{exact:true}).selectOption(invoice.id);await fill('Attribution reason','Six service visits under '+reference);const attributed=owner.page.waitForResponse(r=>r.url().endsWith('/command/agreement-invoice'));await owner.page.getByRole('button',{name:'Attribute invoice evidence',exact:true}).click();assert.equal((await attributed).status(),200);
  await region.getByText('Invoice '+invoice.reference,{exact:true}).click();await region.getByText('Source: Original invoice for service visits '+tag,{exact:true}).waitFor();await region.getByRole('link',{name:'Download source PO '+order.number,exact:true}).waitFor();
  assert.equal((await current(owner.context,origin)).data.agreement.find(a=>a.id===agreement.id).spend.totals[0].amountMinor,60000);
  assert.equal(await owner.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'CONTRACT-001 agreement/detail/source fits '+width);
  await owner.page.screenshot({path:join(evidence,`CONTRACT-001-detail-${width}.png`),fullPage:true});
  await fill('Notice days',90);await fill('Confirmation or correction reason','Corrected notice period from original '+tag);await owner.page.getByLabel('Owner confirmation',{exact:true}).selectOption('confirm');savedResponse=owner.page.waitForResponse(r=>r.url().endsWith('/command/agreement'));await owner.page.getByRole('button',{name:'Confirm agreement terms',exact:true}).click();assert.equal((await savedResponse).status(),200);await owner.page.getByRole('heading',{name:name+' · version 2',exact:true}).waitFor();
  await region.getByText('Auto-renewal: Yes · 90-day notice · deadline 2026-11-01',{exact:true}).waitFor();await region.getByText('Confirmation and correction history',{exact:true}).click();await region.getByText('Owner reviewed agreement terms '+tag,{exact:false}).waitFor();
  await owner.page.screenshot({path:join(evidence,`CONTRACT-001-correction-${width}.png`),fullPage:true});
  await buyer.page.goto(origin+'/app?agreement='+agreement.id);await buyer.page.getByRole('heading',{name:name+' · version 2',exact:true}).waitFor();assert.equal(await buyer.page.getByRole('button',{name:'Confirm agreement terms',exact:true}).count(),0,'Buyer cannot confirm owner agreement terms');assert.equal(await buyer.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await buyer.page.screenshot({path:join(evidence,`CONTRACT-001-buyer-${width}.png`),fullPage:true});
  assert.equal((await current(requester.context,origin)).data.agreement.length,0);assert.equal(await requester.page.getByRole('navigation').getByRole('button',{name:'Agreements',exact:true}).count(),0);
  await buyer.page.goto(origin+'/app?search=1');await buyer.page.getByRole('heading',{name:'Search purchasing records',exact:true}).waitFor();await buyer.page.getByLabel('Number, supplier or text',{exact:true}).fill(reference);await buyer.page.getByLabel('Record type',{exact:true}).selectOption('agreement');await buyer.page.getByRole('button',{name:'Search records',exact:true}).click();await buyer.page.getByRole('link',{name,exact:true}).waitFor();await buyer.page.getByRole('link',{name,exact:true}).click();await buyer.page.getByRole('region',{name:'Purchasing record'}).waitFor();
  await buyer.page.screenshot({path:join(evidence,`CONTRACT-001-search-${width}.png`),fullPage:true});
  assert.ok(siteOrigin,'CONTRACT-001 uses rer dev’s declared run-site preview');const contract=await owner.context.newPage();const response=await contract.goto(siteOrigin+'/contract?q=CONTRACT-001#clauses');assert.equal(response.status(),200);const clause=contract.locator('[data-id="CONTRACT-001"]');await clause.waitFor();assert.equal(await clause.getAttribute('data-status'),'partial');await clause.scrollIntoViewIfNeeded();assert.equal(await contract.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Contract fits '+width);await contract.screenshot({path:join(evidence,`CONTRACT-001-contract-${width}.png`)});await clause.screenshot({path:join(evidence,`CONTRACT-001-contract-row-${width}.png`)});await contract.close();
  return {clause:'CONTRACT-001',slice:'Round A, partial',width,agreement:agreement.id,invoice:invoice.id,order:order.id};
 }catch(error){await owner.page.screenshot({path:join(evidence,`CONTRACT-001-failure-${width}.png`),fullPage:true});throw error;}finally{await owner.context.close();await buyer.context.close();await requester.context.close();await approver.context.close()}
}
