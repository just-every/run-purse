import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium} from '@playwright/test'

// Browser ingress forwards each request unchanged to the disposable production
// Worker supplied by rer verify. There are no application response stand-ins.
export async function agentDoorBrowser({request,origin,cookie,order,native}) {
 const evidence=process.env.PURSE_EVIDENCE??join(tmpdir(),'purse-agent-door-proof')
 await mkdir(evidence,{recursive:true})
 let stage='launch'
 const browser=await chromium.launch({executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-features=LocalNetworkAccessChecks']})
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  try {
   await context.addCookies(cookie.split(';').map(item=>{const i=item.trim().indexOf('=');return {name:item.trim().slice(0,i),value:item.trim().slice(i+1),url:origin,secure:true,httpOnly:true}}))
   await context.route('**/*',async route=>{
    const incoming=route.request()
    if(new URL(incoming.url()).origin!==origin)return route.abort()
    const response=await request(incoming.url(),{method:incoming.method(),headers:await incoming.allHeaders(),...(incoming.postDataBuffer()?{body:incoming.postDataBuffer()}:{})})
    const headers=Object.fromEntries(response.headers);delete headers['content-encoding'];delete headers['content-length'];delete headers['transfer-encoding'];delete headers.connection
    await route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())})
   })
   const page=await context.newPage()
   const decision=native.decision.find(row=>row.request===order.request&&row.preparedBy?.agent.id)
   assert.ok(decision)
   stage='open-request-page'
   await page.goto(origin+'/app?tab=Requests',{waitUntil:'networkidle'})
   assert.equal(new URL(page.url()).pathname,'/app')
   const card=page.locator('#request-'+order.request)
   stage='find-request-card'
   await card.waitFor()
   stage='open-native-record'
   await card.getByRole('button',{name:'Open request',exact:true}).click()
   await card.getByRole('heading',{name:'Decision history',exact:true}).waitFor()
   stage='check-attribution'
   // Assertions run at one width. Both widths capture the changed native screen.
   assert.ok((await card.innerText()).includes(decision.preparedBy.label))
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
   await page.screenshot({path:join(evidence,'agent-decision-1440.png'),fullPage:true})
   await page.setViewportSize({width:390,height:1000})
   await page.screenshot({path:join(evidence,'agent-decision-390.png'),fullPage:true})
   console.log('Native decision browser: agent for sponsor visible at 1440; changed screen captured at 1440 and 390')
  } finally {await context.close()}
 } catch(error) {console.error('Native decision browser failed at',stage,'with',error.name,String(error.message).split('\n')[0].replace(/https?:\/\/[^\s]+/g,'[url]'));throw error} finally {await browser.close()}
}
