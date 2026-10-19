import assert from 'node:assert/strict'
import {join} from 'node:path'
import {session,api,current} from './browser-journey.mjs'
export async function payablesJourney(browser,root,origin,width,evidence){
 const owner=await session(browser,root,origin,'owner',width),buyer=await session(browser,root,origin,'buyer',width),requester=await session(browser,root,origin,'requester',width),approver=await session(browser,root,origin,'approver',width),receiver=await session(browser,root,origin,'receiver',width);
 try{
  const category='Cash planning '+width+' '+crypto.randomUUID().slice(0,6),reference='CASH-'+width+'-'+crypto.randomUUID().slice(0,6);
  const business=(await current(owner.context,origin)).data.business[0];
  if(!business.locations.includes('Denver'))await api(owner.context,origin,'business',{...business,locations:[...business.locations,'Denver']});
  await api(owner.context,origin,'policy',{name:'Cash forecast '+width,currency:'USD',category,project:'Fitout',approver:'approver@dev.localhost',limitMinor:1000000,budgetMinor:5000000});
  const supplier=(await current(buyer.context,origin)).data.supplier.find(s=>s.status==='preferred'&&!s.mergedInto);
  const r=await api(requester.context,origin,'request',{title:'Field safety equipment '+width,supplier:supplier.id,currency:'USD',needDate:'2026-11-18',location:'Denver',costCentre:'Operations',terms:'2/10 Net 30',lines:[{description:'Safety harness',quantity:'10',unitMinor:10000,category,project:'Fitout'}]});
  await api(requester.context,origin,'submit',{id:r.id,revision:1});await api(approver.context,origin,'decision',{id:r.id,revision:1,decision:'approved',reason:'Approved field equipment budget'});
  const o=await api(buyer.context,origin,'convert',{id:r.id,revision:1});await api(buyer.context,origin,'issue',{id:o.id,revision:1,reason:'Supplier terms confirmed'});
  await api(receiver.context,origin,'receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'10',reason:'Received ten harnesses'});
  const i=await api(buyer.context,origin,'invoice',{order:o.id,reference,source:'Supplier invoice dated 31 October',allocations:[{line:o.lines[0].id,quantity:'6',amountMinor:60000}]});
  for(const flag of i.flags??[])await api(buyer.context,origin,'invoice-risk-review',{invoice:i.id,flag:flag.id,version:(await current(buyer.context,origin)).data.invoice.find(x=>x.id===i.id).riskVersion,reason:'Separate received PO and distinct supplier reference for '+width+' cash planning'});
  await buyer.page.reload();await buyer.page.getByRole('navigation').getByRole('button',{name:'Orders',exact:true}).click();
  const panel=buyer.page.getByRole('heading',{name:'Payment terms and cash requirements',exact:true}).locator('..');
  await panel.getByText('Record bill terms and cash-planning approval',{exact:true}).click();
  const invoice=panel.getByRole('heading',{name:`${reference} · ${o.number} · USD 600.00`,exact:true}).locator('..');
  await invoice.getByLabel('Invoice date',{exact:true}).fill('2026-10-31');await invoice.getByLabel('Payment term',{exact:true}).selectOption('2/10 Net 30');await invoice.getByLabel('Terms evidence',{exact:true}).fill('Supplier signed invoice terms');await invoice.getByRole('button',{name:'Save bill terms',exact:true}).click();
  await invoice.getByText('Due 2026-11-30 · 2% discount through 2026-11-10',{exact:true}).waitFor();await buyer.page.screenshot({path:join(evidence,`AP-003-terms-${width}.png`),fullPage:true});await invoice.getByLabel('Cash-planning approval reason',{exact:true}).fill('Exact invoice and receipt reviewed');await invoice.getByRole('button',{name:'Approve for cash planning',exact:true}).click();
  await invoice.getByText('Approved for cash planning · 2/10 Net 30 · Due 2026-11-30',{exact:true}).waitFor();
  const bill=panel.getByRole('row').filter({has:buyer.page.getByText(reference,{exact:true})});
  await bill.getByText('2026-11-30',{exact:true}).first().waitFor();await bill.getByText('USD 12.00 through 2026-11-10',{exact:false}).waitFor();
  await panel.getByText('Expected invoices and source POs',{exact:true}).click();await panel.getByLabel('Forecast PO',{exact:true}).selectOption(o.id);await panel.getByLabel('Expected invoice date',{exact:true}).fill('2026-11-30');await panel.getByLabel('Forecast reason',{exact:true}).fill('Supplier bills remainder at month end');await Promise.all([buyer.page.waitForResponse(response=>response.url().endsWith('/api/purse/command/cash-expectation')&&response.request().method()==='POST'&&response.status()===200),panel.getByRole('button',{name:'Save expected invoice date',exact:true}).click()]);
  const data=(await current(buyer.context,origin)).data,cash=data.cashRequirements;
  assert.equal(cash.bills.find(b=>b.invoice===i.id).amountMinor,60000);assert.equal(cash.commitments.find(c=>c.order===o.id).amountMinor,40000);assert.equal(cash.commitments.find(c=>c.order===o.id).expectedDate,'2026-11-30');
  const expected=cash.weeks.find(w=>w.currency==='USD'&&w.week==='2026-11-30');
  const row=panel.getByRole('row').filter({has:buyer.page.getByText('2026-11-30',{exact:true})}).filter({has:buyer.page.getByText('USD',{exact:true})});
  await row.getByText('USD '+(expected.totalMinor/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),{exact:true}).waitFor();
  await panel.scrollIntoViewIfNeeded();await buyer.page.screenshot({path:join(evidence,`AP-003-cash-${width}.png`),fullPage:true});
  await bill.getByRole('button',{name:o.number,exact:true}).click();await buyer.page.getByRole('heading',{name:o.number+' · issued',exact:true}).waitFor();await buyer.page.getByRole('heading',{name:'Invoice '+reference,exact:true}).waitFor();
  await buyer.page.screenshot({path:join(evidence,`AP-003-source-${width}.png`),fullPage:true});
  await requester.page.reload();await requester.page.getByRole('navigation').getByRole('button',{name:'Orders',exact:true}).click();assert.equal(await requester.page.getByRole('heading',{name:'Payment terms and cash requirements',exact:true}).count(),0);
  assert.equal(await buyer.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`AP-003 fits ${width}`);
  return {clause:'AP-003',width,invoice:i.id,order:o.id};
 }finally{for(const s of [owner,buyer,requester,approver,receiver])await s.context.close()}
}
