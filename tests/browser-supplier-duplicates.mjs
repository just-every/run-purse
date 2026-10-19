import assert from 'node:assert/strict'
import {join} from 'node:path'
import {session,api,current} from './browser-journey.mjs'

export async function supplierDuplicatesJourney(browser,root,origin,width,evidence){
 const tag=width+'-'+crypto.randomUUID().slice(0,6),buyer=await session(browser,root,origin,'buyer',width),owner=await session(browser,root,origin,'owner',width)
 try{
  const serial=String(parseInt(tag.split('-')[1],16)).padStart(7,'0').slice(-7),tin='98-'+serial,bankAccount='000'+width+serial,address='100 Market Street, Suite '+tag+', Denver CO'
  const original=await api(buyer.context,origin,'supplier',{name:'Summit Facility Supply '+tag,dba:'Mountain Equipment '+tag,address,phone:'+1 303 '+serial,contacts:[{name:'Alex',email:'orders@summit-'+tag+'.example'}],status:'active',reason:'Approved facilities distributor '+tag,matching:{tin,bankRouting:'021000021',bankAccount}})
  await buyer.page.getByRole('navigation').getByRole('button',{name:'Suppliers',exact:true}).click()
  const inputName='SUMMIT, FACILITY SUPPLY '+tag
  const fillCandidate=async()=>{
   await buyer.page.getByLabel('Supplier name',{exact:true}).fill(inputName)
   await buyer.page.getByLabel('Doing business as',{exact:true}).fill('Mountain Equipment '+tag)
   await buyer.page.getByLabel('Address',{exact:true}).fill(address.replaceAll(',',''))
   await buyer.page.getByLabel('Supplier phone',{exact:true}).fill('303'+serial)
   await buyer.page.getByLabel('Reason',{exact:true}).fill('Supplier proposed by office manager '+tag)
   await buyer.page.getByLabel('Contact name',{exact:true}).fill('Riley')
   await buyer.page.getByLabel('Contact email',{exact:true}).fill('sales@summit-'+tag+'.example')
   await buyer.page.getByLabel('Matching-only TIN',{exact:true}).fill(tin)
   await buyer.page.getByLabel('Matching-only bank routing number',{exact:true}).fill('021000021')
   await buyer.page.getByLabel('Matching-only bank account number',{exact:true}).fill(bankAccount)
   await buyer.page.getByRole('button',{name:'Save supplier',exact:true}).click()
   await buyer.page.getByRole('heading',{name:'Possible duplicate suppliers',exact:true}).waitFor()
  }
  const count=(await current(buyer.context,origin)).data.supplier.length
  await fillCandidate()
  assert.equal((await current(buyer.context,origin)).data.supplier.length,count)
  const review=buyer.page.getByRole('heading',{name:'Possible duplicate suppliers',exact:true}).locator('..')
  await review.getByRole('row').filter({hasText:original.name}).getByText('TIN (matching-only)',{exact:false}).waitFor()
  await buyer.page.screenshot({path:join(evidence,`SUPPLIER-003-duplicates-${width}.png`),fullPage:true})
  await review.getByRole('row').filter({hasText:original.name}).getByRole('button',{name:'Open existing supplier',exact:true}).click()
  await buyer.page.getByRole('heading',{name:'Edit '+original.name,exact:true}).waitFor()
  assert.equal(await buyer.page.getByLabel('Supplier name',{exact:true}).inputValue(),original.name)
  await buyer.page.getByRole('button',{name:'Add another supplier',exact:true}).click()
  await fillCandidate()
  await buyer.page.getByLabel('Why these are separate suppliers',{exact:true}).fill('Separate operating company sharing a purchasing office; buyer reviewed the incorporation evidence '+tag)
  await buyer.page.getByRole('button',{name:'Create separate supplier after review',exact:true}).click()
  await buyer.page.getByRole('heading',{name:'Edit '+inputName,exact:true}).waitFor({timeout:90000})
  const separate=(await current(buyer.context,origin)).data.supplier.find(s=>s.name===inputName)
  assert.ok(separate.duplicateReview.matches.some(m=>m.id===original.id))
  await buyer.page.screenshot({path:join(evidence,`SUPPLIER-003-reviewed-${width}.png`),fullPage:true})
  const requester=await session(browser,root,origin,'requester',width),approver=await session(browser,root,origin,'approver',width),receiver=await session(browser,root,origin,'receiver',width)
  const purchases=[]
  try{
   for(const supplier of [original,separate]){
    const r=await api(requester.context,origin,'request',{title:'Facilities chairs '+supplier.name,supplier:supplier.id,currency:'AUD',needDate:'2026-12-01',location:'Brisbane',costCentre:'Operations',terms:'Supplier quote; net 30',lines:[{description:'Office chair',quantity:'4',unitMinor:10000,category:'Equipment',project:'Fitout'}]})
    await api(requester.context,origin,'submit',{id:r.id,revision:r.revision})
    await api(approver.context,origin,'decision',{id:r.id,revision:r.revision,decision:'approved',reason:'Facilities equipment budget reviewed'})
    const o=await api(buyer.context,origin,'convert',{id:r.id,revision:r.revision})
    await api(buyer.context,origin,'issue',{id:o.id,revision:o.revision,reason:'Issued through existing supplier channel'})
    await api(receiver.context,origin,'receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'2',reason:'Chairs inspected and accepted'})
    const invoice=await api(buyer.context,origin,'invoice',{order:o.id,reference:'FAC-'+o.number,source:'Supplier invoice PDF',allocations:[{line:o.lines[0].id,quantity:'1',amountMinor:10000}]})
    purchases.push({order:o,invoice})
   }
  }finally{await requester.context.close();await approver.context.close();await receiver.context.close()}
  await buyer.page.reload();await buyer.page.getByRole('navigation').getByRole('button',{name:'Suppliers',exact:true}).click()
  await buyer.page.getByRole('row').filter({hasText:original.name}).getByRole('button',{name:'Open',exact:true}).click()
  await buyer.page.getByLabel('Duplicate supplier to merge into this record',{exact:true}).selectOption(separate.id)
  await buyer.page.getByRole('button',{name:'Preview supplier merge',exact:true}).click()
  await buyer.page.getByRole('heading',{name:'Review merge: '+separate.name+' into '+original.name,exact:true}).waitFor()
  await buyer.page.screenshot({path:join(evidence,`SUPPLIER-003-merge-review-${width}.png`),fullPage:true})
  await buyer.page.getByLabel('Supplier merge reason',{exact:true}).fill('Incorporation evidence confirms the two operating names identify the same supplier '+tag)
  await buyer.page.getByRole('button',{name:'Merge reviewed supplier histories',exact:true}).click()
  const history=buyer.page.getByRole('heading',{name:'Retained supplier histories',exact:true}).locator('..')
  await history.getByText('Retained orders (2)',{exact:true}).click()
  await history.getByText('Retained invoices (2)',{exact:true}).click()
  for(const {order,invoice} of purchases){await history.getByText('Retained orders (2)',{exact:true}).locator('..').getByRole('cell').filter({hasText:order.number}).waitFor();await history.getByText('Retained invoices (2)',{exact:true}).locator('..').getByRole('cell').filter({hasText:invoice.reference}).waitFor()}
  await buyer.page.screenshot({path:join(evidence,`SUPPLIER-003-merged-${width}.png`),fullPage:true})
  const family=(await current(buyer.context,origin)).data.supplierFamilies.find(f=>f.supplier===original.id)
  assert.equal(family.orders.length,2);assert.equal(family.invoices.length,2)
  await owner.page.reload();await owner.page.getByRole('navigation').getByRole('button',{name:'Imports',exact:true}).click()
  const csv='kind,sourceId,name,status,email,address,phone,TIN,Bank Routing,Bank Account\nsupplier,duplicate-'+tag+','+original.name+',active,contact@summit-'+tag+'.example,100 Market Street Denver CO,303'+serial+','+tin+',021000021,'+bankAccount+'\n'
  await owner.page.getByLabel('CSV file',{exact:true}).setInputFiles({name:'suppliers-'+tag+'.csv',mimeType:'text/csv',buffer:Buffer.from(csv)})
  await owner.page.getByRole('button',{name:'Preview without writes',exact:true}).click()
  await owner.page.getByRole('heading',{name:'Possible duplicate suppliers · review before creation',exact:true}).waitFor()
  await owner.page.getByText('Source custody exception: redacted',{exact:false}).waitFor()
  assert.ok(!(await current(owner.context,origin)).data.supplier.some(s=>s.matching))
  await owner.page.screenshot({path:join(evidence,`SUPPLIER-003-import-preview-${width}.png`),fullPage:true})
  await owner.page.getByRole('button',{name:'Commit reviewed batch',exact:true}).click()
  await owner.page.getByRole('heading',{name:/^Batch /}).waitFor()
  const imported=(await current(owner.context,origin)).data.supplier.find(s=>s.sourceId==='duplicate-'+tag)
  assert.deepEqual(imported.matchingOnly,{tin:true,bank:true});assert.ok(imported.sourceRedaction.originalSha256)
  const requesterAfter=await session(browser,root,origin,'requester',width)
  try{
   await requesterAfter.page.getByRole('navigation').getByRole('button',{name:'Requests',exact:true}).click()
   await requesterAfter.page.getByText('New purchase request',{exact:true}).click()
   assert.equal(await requesterAfter.page.locator('select[name="supplier"] option[value="'+separate.id+'"]').count(),0)
   await requesterAfter.page.screenshot({path:join(evidence,`SUPPLIER-003-alias-not-purchasable-${width}.png`),fullPage:true})
  }finally{await requesterAfter.context.close()}
  for(const page of [buyer.page,owner.page])assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`SUPPLIER-003 fits ${width}px`)
  return {clause:'SUPPLIER-003',width,tag,supplier:original.id,separate:separate.id}
 }finally{await buyer.context.close();await owner.context.close()}
}
