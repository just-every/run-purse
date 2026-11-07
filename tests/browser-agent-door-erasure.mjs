import assert from 'node:assert/strict'
import {agentDoorErasure} from './agent-door-erasure.mjs'
import {withAgentBrowser} from './agent-door-browser-session.mjs'

// Assert behaviour at 1440. Capture the existing affected views at both widths
// after erasure, including nonempty review and anonymous decision chronology.
const result=await agentDoorErasure(async({h,sponsor,contact,other,pendingId,approvedId,reviewId,stage})=>{
 await withAgentBrowser({request:(url,init)=>h.mf.dispatchFetch(url,init),origin:h.origin,cookie:sponsor},async({page,capture})=>{
  const anonymous=async()=>{
   for(const value of Object.values(contact))assert.ok(!(await page.content()).includes(value),'Erased contact remains in the browser')
  }
  await page.goto(h.origin+'/agents',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Agents',exact:true}).waitFor()
  const review=page.locator('[data-review-id="'+reviewId+'"]')
  await review.waitFor()
  assert.ok((await page.locator('main').innerText()).includes(other.email),'Unrelated review remains visible')
  if(stage==='before')assert.ok((await review.innerText()).includes(contact.email))
  else {
   await anonymous();assert.ok((await review.innerText()).includes('Personal data erased'))
   await capture('erased-agent-review-feed')
  }
  for(const [id,state,label]of [[pendingId,stage==='before'?'pending':'expired','pending'],[approvedId,'executed','completed']]) {
   await page.goto(h.origin+'/agents/approvals/'+id,{waitUntil:'networkidle'})
   await page.locator('[data-approval-state="'+state+'"]').waitFor()
   if(stage==='before')assert.ok((await page.locator('[data-approval-summary]').innerText()).includes(contact.email))
   else {
    await anonymous();assert.ok((await page.locator('[data-approval-summary]').innerText()).includes('Personal data erased'))
    assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).count(),0)
    await capture('erased-agent-'+label+'-approval')
   }
  }
 })
 if(stage==='after')await withAgentBrowser({request:(url,init)=>h.mf.dispatchFetch(url,init),origin:h.origin,cookie:h.owner},async({page,capture})=>{
  await page.goto(h.origin+'/agents',{waitUntil:'networkidle'})
  const audit=(await h.send('/agents/api/audit',undefined,h.owner)).value
  assert.ok(audit.rows.length>0)
  const counts={}
  for(const row of audit.rows)for(const item of row.classes)counts[item.class+':'+row.decision]=(counts[item.class+':'+row.decision]??0)+1
  const cells=await page.locator('[data-agents-count]').evaluateAll(nodes=>nodes.map(node=>({key:node.dataset.class+':'+node.dataset.decision,count:Number(node.textContent)})))
  assert.deepEqual(Object.fromEntries(cells.map(cell=>[cell.key,cell.count])),counts,'Decision counts must reconcile to actual audit rows')
  await page.getByRole('heading',{name:'Recent activity',exact:true}).waitFor()
  for(const value of Object.values(contact))assert.ok(!(await page.content()).includes(value))
  await capture('erased-agent-audit-and-counts')
 })
})
console.log('Browser retained-artifact erasure passed at 1440 with 1440 and 390 captures: '+JSON.stringify(result))
