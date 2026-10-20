import assert from 'node:assert/strict'
import {join} from 'node:path'
import {session,api,current} from './browser-journey.mjs'

export async function orderChasingJourney(browser,root,origin,width,evidence){
 const buyer=await session(browser,root,origin,'buyer',width),requester=await session(browser,root,origin,'requester',width),approver=await session(browser,root,origin,'approver',width),owner=await session(browser,root,origin,'owner',width)
 try{
  const tag=width+' '+crypto.randomUUID().slice(0,6)
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(Date.now())
  const today=['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-')
  const day=offset=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10)
  const input={name:'Canyon Industrial Supply '+tag,status:'preferred',reason:'Approved field equipment supplier',contacts:[{name:'Casey Morgan',email:'orders@canyon-'+width+'.example.test'}]}
  const duplicate=await api(buyer.context,origin,'supplier-duplicates',input)
  const supplier=await api(buyer.context,origin,'supplier',{...input,duplicateFingerprint:duplicate.fingerprint,duplicateReason:'Separate operating division and approved order contact '+tag})
  const category='Follow-up '+tag
  await api(owner.context,origin,'policy',{name:'Site equipment '+tag,currency:'USD',category,project:'Fitout',approver:'approver@dev.localhost',limitMinor:1000000,budgetMinor:5000000})
  const r=await api(requester.context,origin,'request',{title:'Safety harness replacement '+tag,supplier:supplier.id,currency:'USD',needDate:day(7),location:'Brisbane',costCentre:'Operations',terms:'Supplier quote CI-842; Net 30',lines:[{description:'Site lifting harness',quantity:'4',unitMinor:12500,category,project:'Fitout'}]})
  await api(requester.context,origin,'submit',{id:r.id,revision:1});await api(approver.context,origin,'decision',{id:r.id,revision:1,decision:'approved',reason:'Site safety equipment approved'})
  const o=await api(buyer.context,origin,'convert',{id:r.id,revision:1});await api(buyer.context,origin,'issue',{id:o.id,revision:1,reason:'Approved document issued through existing supplier channel'})
  const source='Supplier email CI-842: delivery promised yesterday; buyer recorded the reply '+tag
  await api(buyer.context,origin,'supplier-order-evidence',{order:o.id,version:0,promisedDate:day(-1),source})
  await buyer.page.reload();await buyer.page.getByRole('navigation').getByRole('button',{name:'Orders',exact:true}).click();await buyer.page.getByRole('row').filter({hasText:o.number}).getByRole('button',{name:'Open order',exact:true}).click()
  const panel=buyer.page.getByRole('heading',{name:'Supplier follow-up',exact:true}).locator('..')
  await panel.getByLabel('Automatic supplier chases',{exact:true}).selectOption('yes');await panel.getByLabel('Days between chase attempts',{exact:true}).fill('1');await panel.getByLabel('Chase attempt limit before escalation',{exact:true}).fill('1');await panel.getByLabel('Escalation buyer email',{exact:true}).fill('buyer@dev.localhost')
  await panel.getByRole('button',{name:'Save chase schedule',exact:true}).click()
  await panel.getByRole('button',{name:'Process due supplier chases',exact:true}).click();await panel.getByText('Suppressed locally',{exact:true}).first().waitFor()
  const before=(await current(buyer.context,origin)).data.orderChaseEvent.filter(e=>e.order===o.id)
  assert.equal(before.filter(e=>e.kind==='chase').length,1);assert.equal(before.filter(e=>e.kind==='escalation').length,1)
  assert.equal((await current(buyer.context,origin)).data.orderChasePolicy.find(p=>p.order===o.id).version,1,'Processing is a read/dispatch action, never a schedule reset')
  await panel.getByText('Buyer-recorded supplier replies and promises',{exact:true}).click();await panel.getByText(source,{exact:false}).waitFor()
  await panel.screenshot({path:join(evidence,`PO-003-buyer-${width}.png`)})
  await requester.page.reload();await requester.page.getByRole('navigation').getByRole('button',{name:'Orders',exact:true}).click();await requester.page.getByRole('row').filter({hasText:o.number}).getByRole('button',{name:'Open order',exact:true}).click()
  const requesterPanel=requester.page.getByRole('heading',{name:'Supplier follow-up',exact:true}).locator('..')
  await requesterPanel.getByText('Buyer-recorded supplier replies and promises',{exact:true}).click();await requesterPanel.getByText(source,{exact:false}).waitFor()
  assert.equal(await requesterPanel.getByRole('button',{name:'Save chase schedule',exact:true}).count(),0)
  await requesterPanel.screenshot({path:join(evidence,`PO-003-requester-${width}.png`)})
  await buyer.page.getByLabel('Closure reason',{exact:true}).fill('Supplier wrote off the remaining shipment; replacement sourced separately')
  await buyer.page.getByRole('button',{name:'Close PO balance',exact:true}).click();await buyer.page.getByRole('heading',{name:o.number+' · closed',exact:true}).waitFor()
  await panel.getByRole('button',{name:'Process due supplier chases',exact:true}).click()
  assert.deepEqual((await current(buyer.context,origin)).data.orderChaseEvent.filter(e=>e.order===o.id),before)
  await panel.screenshot({path:join(evidence,`PO-003-closed-${width}.png`)})
  for(const page of [buyer.page,requester.page])assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`PO-003 fits ${width}px`)
  return {clause:'PO-003',width,order:o.id}
 }catch(e){await buyer.page.screenshot({path:join(evidence,`PO-003-failure-${width}.png`),fullPage:true}).catch(()=>{});throw e}finally{await buyer.context.close();await requester.context.close();await approver.context.close();await owner.context.close()}
}
