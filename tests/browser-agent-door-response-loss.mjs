import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {nativeWebContext} from './native-web-fixture.mjs'
import {agentDoorResponseLoss} from './agent-door-response-loss.mjs'
import {withAgentBrowser} from './agent-door-browser-session.mjs'

// Behaviour assertions run at 1440; the same existing screens are captured at
// 1440 and 390 after both completed retries, without changing production UI.
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
const directory=process.env.PURSE_EVIDENCE??join(tmpdir(),'purse-agent-door-proof')
await mkdir(directory,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox']})
try {
const result=await agentDoorResponseLoss(async({h,sponsor,phase,preparation,original,review,rows})=>{
 // Render the shipped App with the established native web fixture; all reads
 // still reach this same Worker's native authenticated API.
 const context=await nativeWebContext(browser,h,1440,bundle.outputFiles[0].text,sponsor)
 try {
  const page=await context.newPage()
  await page.goto(h.origin+'/app?tab=Preparation',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Prepare the next action',exact:true}).waitFor()
  const drafts=page.getByRole('textbox',{name:'Draft',exact:true})
  assert.equal(await drafts.count(),1)
  assert.equal(await drafts.inputValue(),preparation.draft)
  const download=page.getByRole('link',{name:'Download draft',exact:true})
  assert.equal(await download.count(),1)
  assert.equal(await download.getAttribute('href'),'/api/purse/download/agentRun/'+preparation.id)
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000})
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
   await page.screenshot({path:join(directory,'response-loss-'+phase+'-single-preparation-'+width+'.png'),fullPage:true})
  }
 } finally {await context.close()}
 await withAgentBrowser({request:(url,init)=>h.mf.dispatchFetch(url,init),origin:h.origin,cookie:sponsor},async({page,capture})=>{
  await page.goto(h.origin+'/agents',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Agents',exact:true}).waitFor()
  const reviews=page.locator('[data-review-id]')
  assert.equal(await reviews.count(),review?1:0)
  if(review) {
   const retained=page.locator('[data-review-id="'+review.id+'"]')
   assert.equal(await retained.getAttribute('data-review-state'),'open')
   assert.ok((await retained.innerText()).includes(preparation.draft))
   await retained.getByRole('button',{name:'Mark reviewed',exact:true}).waitFor()
  }
  await capture('response-loss-'+phase+'-original-review')
 })
 await withAgentBrowser({request:(url,init)=>h.mf.dispatchFetch(url,init),origin:h.origin,cookie:h.owner},async({page,capture})=>{
  await page.goto(h.origin+'/agents',{waitUntil:'networkidle'})
  const activity=page.locator('section[aria-labelledby="activity-title"]')
  await activity.getByRole('heading',{name:'Recent activity',exact:true}).waitFor()
  assert.equal(await activity.locator('li').count(),rows.length)
  assert.equal(await activity.getByText('Result sent to the agent',{exact:false}).count(),2)
  const text=await activity.innerText()
  assert.ok(text.includes(original.agent.name));assert.ok(text.includes(original.sponsor.name))
  assert.ok(text.includes(phase==='held'?'Done, to review':'Done'))
  const count=page.locator('[data-agents-count][data-class="standard"][data-decision="'+original.decision+'"]')
  assert.equal(Number(await count.innerText()),3)
  await capture('response-loss-'+phase+'-completed-and-replayed-audit')
 })
})
console.log('Native response loss browser proof at 1440 and 390: '+JSON.stringify(result))

} finally {await browser.close()}
