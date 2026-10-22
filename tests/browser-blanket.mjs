import {blanketKinds} from './browser-blanket-kinds.mjs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {session,api,current} from './browser-journey.mjs';
import {pdfContent} from './pdf-content.mjs';

export async function blanketJourney(browser,root,origin,width,evidence){
 const owner=await session(browser,root,origin,'owner',width),requester=await session(browser,root,origin,'requester',width),approver=await session(browser,root,origin,'approver',width),buyer=await session(browser,root,origin,'buyer',width);
 try{
  const tag=width+'-'+crypto.randomUUID().slice(0,8),business=(await current(owner.context,origin)).data.business[0];
  const profile={name:'Mountain Maintenance '+tag,status:'preferred',reason:'Annual site maintenance supplier',contacts:[{name:'Jordan',email:'maintenance-'+tag+'@example.test'}]};
  const duplicates=await api(buyer.context,origin,'supplier-duplicates',profile);
  const supplier=await api(buyer.context,origin,'supplier',{...profile,...(duplicates.matches.length?{duplicateFingerprint:duplicates.fingerprint,duplicateReason:'Separate maintenance supplier fixture; similar register names reviewed'}:{})});
  const category='Blanket maintenance '+tag;
  await api(owner.context,origin,'policy',{name:'Annual maintenance '+tag,currency:'USD',category,project:'*',approver:'approver@dev.localhost',limitMinor:10000000,budgetMinor:10000000});
  const page=requester.page;await page.reload();await page.getByRole('navigation').getByRole('button',{name:'Requests',exact:true}).click();await page.getByRole('button',{name:'New purchase request'}).click();
  for(const [name,value]of Object.entries({'Request title':'Annual maintenance '+tag,'Need date':'2026-12-31','Description':'Site maintenance supply units','Quantity':'24','Unit price':'1000.00','Category':category,'Freight':'0.00','Supplied tax':'0.00','Supplier-supplied terms':'Annual cap, Net 30'}))await page.getByLabel(name,{exact:true}).fill(value);
  for(const [name,value]of Object.entries({'Supplier':supplier.id,'Currency':'USD','Location':business.locations[0],'Cost centre':business.costCentres[0],'Project':business.projects[0]}))await page.getByLabel(name,{exact:true}).selectOption(value);
  await page.getByRole('checkbox',{name:'Blanket PO · approved total is the cap',exact:true}).check();await page.getByLabel('Blanket valid from',{exact:true}).fill('2026-01-01');await page.getByLabel('Blanket valid through',{exact:true}).fill('2026-12-31');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'PO-005 request fits '+width);await page.screenshot({path:join(evidence,`PO-005-request-${width}.png`),fullPage:true});
  const saved=page.waitForResponse(r=>r.url().endsWith('/command/request'));await page.getByRole('button',{name:'Save request draft',exact:true}).click();assert.equal((await saved).status(),200);
  const r=(await current(requester.context,origin)).data.request.find(r=>r.title==='Annual maintenance '+tag);assert.ok(r);assert.equal(r.poDetails.blanket.validThrough,'2026-12-31');
  await api(requester.context,origin,'submit',{id:r.id,revision:1});await api(approver.context,origin,'decision',{id:r.id,revision:1,decision:'approved',reason:'Annual maintenance cap reviewed'});const o=await api(buyer.context,origin,'convert',{id:r.id,revision:1});await api(buyer.context,origin,'issue',{id:o.id,revision:1,reason:'Approved supplier document recorded as issued'});
  for(const [index,q]of ['6','5','4'].entries())await api(buyer.context,origin,'invoice',{order:o.id,reference:'MAINT-'+tag+'-'+index,source:'Monthly supplier invoice '+index,invoiceDate:'2026-10-'+(21+index),allocations:[{line:o.lines[0].id,quantity:q,amountMinor:Number(q)*100000}]});
  await buyer.page.reload();await buyer.page.getByRole('navigation').getByRole('button',{name:'Orders',exact:true}).click();await buyer.page.getByRole('row').filter({has:buyer.page.getByText(o.number,{exact:true})}).getByRole('button',{name:'Open order',exact:true}).click();
  const balance=buyer.page.getByRole('region',{name:'Blanket balance'});await balance.getByText('Approved cap $24,000.00 · Invoice evidence $15,000.00 · Remaining cap $9,000.00',{exact:true}).waitFor();await balance.screenshot({path:join(evidence,`PO-005-balance-${width}.png`)});
  const download=buyer.page.waitForEvent('download');await buyer.page.getByRole('link',{name:'Download purchase order PDF',exact:true}).click();const file=await download;await file.saveAs(join(evidence,`PO-005-${width}.pdf`));const response=await buyer.context.request.get(origin+'/api/purse/order-pdf/'+o.id);const content=await pdfContent(new Uint8Array(await response.body()));assert.ok(content.text.includes('USD 24000.00'));assert.ok(content.text.includes('2026-12-31'));
  await buyer.page.getByText('Add invoice evidence',{exact:true}).click();await buyer.page.getByLabel('Invoice reference',{exact:true}).fill('MAINT-OVER-'+tag);await buyer.page.getByLabel('Evidence source',{exact:true}).fill('Additional supplier invoice exceeding annual cap');await buyer.page.locator('form').filter({has:buyer.page.getByRole('button',{name:'Save invoice evidence',exact:true})}).getByLabel('PO line',{exact:true}).selectOption(o.lines[0].id);await buyer.page.getByLabel('Invoice quantity',{exact:true}).fill('10');await buyer.page.getByLabel('Invoice amount',{exact:true}).fill('10000.00');
  const recorded=buyer.page.waitForResponse(r=>r.url().endsWith('/command/invoice'));await buyer.page.getByRole('button',{name:'Save invoice evidence',exact:true}).click();assert.equal((await recorded).status(),200);
  await balance.getByText('Over cap by $1,000.00. Review invoice risk and matching exceptions.',{exact:true}).waitFor();await buyer.page.getByRole('heading',{name:'Invoice MAINT-OVER-'+tag,exact:true}).locator('..').getByRole('heading',{name:'Invoice exceeds remaining PO value · Open',exact:true}).waitFor();assert.equal(await buyer.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'PO-005 order fits '+width);await buyer.page.screenshot({path:join(evidence,`PO-005-held-${width}.png`),fullPage:true});
  const state=(await current(buyer.context,origin)).data;assert.equal(state.order.find(p=>p.id===o.id).blanketPosition.remainingMinor,0);assert.equal(state.commitment.filter(e=>e.request===r.id).reduce((n,e)=>n+e.amountMinor,0),0);
  const kinds=await blanketKinds({owner,requester,approver,buyer},origin,width,evidence,{supplier,business,category,blanket:o});
  return {clause:'PO-005',width,order:o.id,...kinds};
 }finally{for(const s of [owner,requester,approver,buyer])await s.context.close();}
}
