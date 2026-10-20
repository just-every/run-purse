import assert from 'node:assert/strict'
import {join} from 'node:path'
import {session,api,current} from './browser-journey.mjs'

export async function supplierDocumentsJourney(browser,root,origin,width,evidence){
 const buyer=await session(browser,root,origin,'buyer',width)
 try{
  const suffix=String(width)+' '+crypto.randomUUID().slice(0,6)
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(Date.now())
  const today=['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-')
  const day=offset=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10)
  const input={name:'Summit Lifting Services '+suffix,status:'preferred',reason:'Site equipment supplier; current safety review',contacts:[{name:'Casey Adams',email:'compliance@summit.example.test'}]};
  const review=await api(buyer.context,origin,'supplier-duplicates',input)
  const supplier=await api(buyer.context,origin,'supplier',{...input,duplicateFingerprint:review.fingerprint,duplicateReason:'Reviewed separate field-service division with its own insurance policy '+suffix})
  await buyer.page.reload();await buyer.page.getByRole('navigation').getByRole('button',{name:'Suppliers',exact:true}).click()
  await buyer.page.getByRole('row').filter({hasText:supplier.name}).getByRole('button',{name:'Open',exact:true}).click()
  const panel=buyer.page.getByRole('heading',{name:'Supplier document compliance',exact:true}).locator('..')
  await panel.getByLabel('Private compliance file',{exact:true}).setInputFiles({name:'Summit-COI-2026.txt',mimeType:'text/plain',buffer:Buffer.from('Certificate of insurance: Summit Lifting Services\nPolicy GL-842\nExpiration '+day(-1)+'\n')})
  await panel.getByRole('button',{name:'Upload private compliance evidence',exact:true}).click();await buyer.page.getByRole('link',{name:'Summit-COI-2026.txt',exact:true}).waitFor()
  await panel.getByLabel('Document type',{exact:true}).selectOption('insurance')
  const file=(await current(buyer.context,origin)).data.attachment.find(f=>f.record===supplier.id&&f.name==='Summit-COI-2026.txt')
  await panel.getByLabel('Reviewed evidence file',{exact:true}).selectOption(file.id)
  await panel.getByLabel('Document expiry',{exact:true}).fill(day(-1));await panel.getByLabel('Required for new POs',{exact:true}).selectOption('yes')
  await panel.getByRole('button',{name:'Save document review',exact:true}).click();await panel.getByText('Lapsed',{exact:true}).waitFor()
  await panel.getByRole('button',{name:'Process due document reminders',exact:true}).click();await panel.getByText('supplier: suppressed locally; owner: suppressed locally',{exact:false}).waitFor()
  await buyer.page.screenshot({path:join(evidence,`SUPPLIER-004-lapsed-${width}.png`),fullPage:true})
  await panel.getByRole('button',{name:'Request refreshed document',exact:true}).click()
  const uploadLink=panel.getByRole('link',{name:'Open supplier refresh upload',exact:true});await uploadLink.waitFor()
  const publicContext=await browser.newContext({viewport:{width,height:1000}})
  try{
   const supplierPage=await publicContext.newPage();await supplierPage.goto(await uploadLink.getAttribute('href'))
   await supplierPage.getByLabel('Document',{exact:true}).setInputFiles({name:'Summit-COI-renewal.txt',mimeType:'text/plain',buffer:Buffer.from('Renewed certificate of insurance: Summit Lifting Services\nPolicy GL-842-R\nExpiration '+day(365)+'\n')})
   await supplierPage.screenshot({path:join(evidence,`SUPPLIER-004-supplier-upload-${width}.png`),fullPage:true})
   const sent=supplierPage.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.startsWith('/api/purse/supplier-refresh/'));await supplierPage.getByRole('button',{name:'Submit document',exact:true}).click();const response=await sent;const headers=await response.request().allHeaders();assert.equal(response.status(),200,JSON.stringify({status:response.status(),origin:headers.origin,site:headers['sec-fetch-site'],body:(await response.text()).match(/<h1>(.*?)<\/h1>/)?.[1]}));await supplierPage.getByRole('heading',{name:'Document submitted',exact:true}).waitFor()
   await supplierPage.screenshot({path:join(evidence,`SUPPLIER-004-supplier-submitted-${width}.png`),fullPage:true})
   assert.equal(await supplierPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  }finally{await publicContext.close()}
  await buyer.page.reload();await buyer.page.getByRole('navigation').getByRole('button',{name:'Suppliers',exact:true}).click();await buyer.page.getByRole('row').filter({hasText:supplier.name}).getByRole('button',{name:'Open',exact:true}).click()
  await panel.getByRole('heading',{name:'Supplier upload awaiting review',exact:true}).waitFor();await panel.getByText('Lapsed',{exact:true}).waitFor()
  await buyer.page.screenshot({path:join(evidence,`SUPPLIER-004-pending-review-${width}.png`),fullPage:true})
  await panel.getByLabel('Reviewed replacement expiry',{exact:true}).fill(day(365));await panel.getByRole('button',{name:'Accept refreshed document',exact:true}).click()
  await panel.getByText('Current',{exact:true}).waitFor();await panel.getByText('insurance review history',{exact:true}).click()
  await buyer.page.screenshot({path:join(evidence,`SUPPLIER-004-refreshed-${width}.png`),fullPage:true})
  const document=(await current(buyer.context,origin)).data.supplierDocument.find(d=>d.supplier===supplier.id)
  assert.equal(document.history[0].attachment,file.id);assert.notEqual(document.attachment,file.id);assert.equal(document.compliance.lapsed,false)
  assert.equal(await buyer.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`SUPPLIER-004 fits ${width}px`)
  return {clause:'SUPPLIER-004',width,supplier:supplier.id,document:document.id}
 }catch(e){await buyer.page.screenshot({path:join(evidence,`SUPPLIER-004-failure-${width}.png`),fullPage:true}).catch(()=>{});throw e}finally{await buyer.context.close()}
}
