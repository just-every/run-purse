import assert from 'node:assert/strict'
import {join} from 'node:path'
import {session,current} from './browser-journey.mjs'

export async function supplierScreeningJourney(browser,root,origin,width,evidence){
 const owner=await session(browser,root,origin,'owner',width),page=owner.page
 try{
  await page.getByRole('navigation').getByRole('button',{name:'Suppliers',exact:true}).click()
  await page.getByLabel('Supplier name',{exact:true}).fill('AEROCARIBBEAN AIRLINES')
  await page.getByLabel('Address',{exact:true}).fill('Havana, Cuba')
  await page.getByLabel('Reason',{exact:true}).fill('Local screening acceptance scenario '+width+'; no purchase')
  await page.getByRole('button',{name:'Save supplier',exact:true}).click()
  await page.getByRole('heading',{name:'Possible duplicate suppliers',exact:true}).or(page.getByText('Activation is held pending compliance review.',{exact:false})).first().waitFor({timeout:90000})
  if(await page.getByRole('heading',{name:'Possible duplicate suppliers',exact:true}).isVisible()) {
   await page.getByLabel('Why these are separate suppliers',{exact:true}).fill('Separate local screening acceptance record for width '+width+'; every record retains its independent compliance review')
   await page.getByRole('button',{name:'Create separate supplier after review',exact:true}).click()
  }
  await page.getByText('Activation is held pending compliance review.',{exact:false}).waitFor({timeout:90000})
  let supplier=(await current(owner.context,origin)).data.supplier.find(s=>s.reason.includes('acceptance scenario '+width))
  assert.equal(supplier.status,'pending_review');assert.ok(supplier.screenings.at(-1).matches.some(m=>m.id==='36'))
  await page.getByText('Screening history and list versions (1)',{exact:true}).click()
  await page.screenshot({path:join(evidence,`SUPPLIER-007-held-${width}.png`),fullPage:true})
  await page.getByLabel('Compliance decision',{exact:true}).selectOption('clear')
  await page.getByLabel('Compliance review reason',{exact:true}).fill('Local acceptance false-positive review; no real supplier activation')
  await page.getByRole('button',{name:'Record compliance review',exact:true}).click()
  await page.getByText('cleared by review',{exact:true}).first().waitFor()
  await page.screenshot({path:join(evidence,`SUPPLIER-007-reviewed-${width}.png`),fullPage:true})
  supplier=(await current(owner.context,origin)).data.supplier.find(s=>s.id===supplier.id);assert.equal(supplier.status,'active')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`SUPPLIER-007 fits ${width}px`)
  return {clause:'SUPPLIER-007',width,supplier:supplier.id}
 }finally{await owner.context.close()}
}
