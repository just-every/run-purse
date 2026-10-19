import assert from 'node:assert/strict'
import {join} from 'node:path'
import {session,api,current} from './browser-journey.mjs'

export async function supplierPerformanceJourney(browser,root,origin,width,evidence,supplier){
 const buyer=await session(browser,root,origin,'buyer',width),requester=await session(browser,root,origin,'requester',width),approver=await session(browser,root,origin,'approver',width)
 try{
  const owner=await session(browser,root,origin,'owner',width)
  let request
  try{
   await api(owner.context,origin,'policy',{name:'Supplier performance '+width,currency:'AUD',category:'Service performance '+width,project:'Fitout',approver:'approver@dev.localhost',limitMinor:1000000,budgetMinor:5000000})
   request=await api(requester.context,origin,'request',{title:'Site repair kits '+width,supplier:supplier.id,currency:'AUD',needDate:'2026-11-30',location:'Brisbane',costCentre:'Operations',terms:'Net 30; supplier quote SR-82',lines:[{description:'Repair kits',quantity:'5',unitMinor:4000,category:'Service performance '+width,project:'Fitout'}]})
   await api(requester.context,origin,'submit',{id:request.id,revision:1})
   await api(approver.context,origin,'decision',{id:request.id,revision:1,decision:'approved',reason:'Site equipment approved'})
  }finally{await owner.context.close()}
  const order=await api(buyer.context,origin,'convert',{id:request.id,revision:1})
  await api(buyer.context,origin,'issue',{id:order.id,revision:1,reason:'Issued through existing supplier channel'})
  await buyer.page.reload();await buyer.page.getByRole('navigation').getByRole('button',{name:'Suppliers',exact:true}).click();await buyer.page.getByRole('row').filter({hasText:supplier.name}).getByRole('button',{name:'Open',exact:true}).click()
  const panel=buyer.page.getByRole('heading',{name:'Supplier performance',exact:true}).locator('..')
  await panel.getByLabel('Purchase order for communication',{exact:true}).selectOption(order.id)
  const promisedDate=new Date(Date.now()-86400000).toISOString().slice(0,10)
  await panel.getByLabel('Supplier-promised date',{exact:true}).fill(promisedDate)
  await panel.getByLabel('Acknowledged at (ISO timestamp with time zone)',{exact:true}).fill(new Date().toISOString())
  await panel.getByLabel('Supplier communication source',{exact:true}).fill('Supplier email SR-82: promised yesterday; acknowledgment time recorded by buyer')
  await panel.getByRole('button',{name:'Save supplier communication',exact:true}).click()
  await panel.getByText('Supplier communication history · '+order.number,{exact:true}).waitFor()
  const receiver=await session(browser,root,origin,'receiver',width)
  try{
   await api(receiver.context,origin,'receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'2',reason:'Repair kits arrived after promised date'})
   await api(receiver.context,origin,'receipt',{order:order.id,line:order.lines[0].id,event:'reject',quantity:'1',reason:'Broken connector on arrival'})
   await api(receiver.context,origin,'receipt',{order:order.id,line:order.lines[0].id,event:'return',quantity:'1',reason:'Faulty accepted kit returned'})
  }finally{await receiver.context.close()}
  const invoice=await api(buyer.context,origin,'invoice',{order:order.id,reference:'SR-82-'+width,source:'Supplier invoice PDF SR-82',allocations:[{line:order.lines[0].id,quantity:'2',amountMinor:8500}]})
  await buyer.page.reload();await buyer.page.getByRole('navigation').getByRole('button',{name:'Suppliers',exact:true}).click();await buyer.page.getByRole('row').filter({hasText:supplier.name}).getByRole('button',{name:'Open',exact:true}).click()
  await panel.getByLabel('Issue purchase order',{exact:true}).selectOption(order.id);await panel.getByLabel('Issue category',{exact:true}).selectOption('damaged');await panel.getByLabel('Issue description',{exact:true}).fill('Broken connector; supplier replacement requested '+width)
  await panel.getByRole('button',{name:'Save supplier issue',exact:true}).click()
  const issue=(await current(buyer.context,origin)).data.supplierScorecards.find(s=>s.supplier===supplier.id).issues.rows.find(i=>i.orderId===order.id)
  assert.ok(issue)
  for(const summary of await panel.locator(':scope > details > summary').all())await summary.click()
  await panel.getByText('Broken connector; supplier replacement requested '+width,{exact:false}).waitFor()
  await buyer.page.screenshot({path:join(evidence,`SUPPLIER-005-open-${width}.png`),fullPage:true})
  const form=panel.getByRole('heading',{name:'damaged · open',exact:true}).locator('..')
  await form.getByLabel('Resolution reason',{exact:true}).fill('Supplier accepted return and confirmed replacement '+width)
  await form.getByRole('button',{name:'Resolve issue',exact:true}).click()
  await panel.getByText('Resolution: Supplier accepted return and confirmed replacement '+width,{exact:false}).waitFor()
  await buyer.page.screenshot({path:join(evidence,`SUPPLIER-005-resolved-${width}.png`),fullPage:true})
  const card=(await current(buyer.context,origin)).data.supplierScorecards.find(s=>s.supplier===supplier.id)
  assert.ok(card.delivery.rows.some(r=>r.orderId===order.id&&r.onTime===false));assert.ok(card.quality.rows.some(r=>r.orderId===order.id&&r.event==='reject'));assert.ok(card.invoiceAccuracy.rows.some(r=>r.invoiceId===invoice.id&&r.exception));assert.ok(card.acknowledgment.rows.some(r=>r.orderId===order.id&&r.elapsedMs!==null));assert.equal(card.issues.rows.find(i=>i.issueId===issue.issueId).status,'resolved')
  assert.equal(await buyer.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`SUPPLIER-005 fits ${width}px`)
  return {clause:'SUPPLIER-005',width,order:order.id}
 }catch(error){await buyer.page.screenshot({path:join(evidence,`SUPPLIER-005-failure-${width}.png`),fullPage:true}).catch(()=>{});throw error}finally{await buyer.context.close();await requester.context.close();await approver.context.close()}
}
