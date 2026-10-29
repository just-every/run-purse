import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium} from '@playwright/test'

// Each browser request reaches the disposable production Worker unchanged.
export async function withAgentBrowser({request,origin,cookie},visit) {
 const directory=process.env.PURSE_EVIDENCE??join(tmpdir(),'purse-agent-door-proof')
 await mkdir(directory,{recursive:true})
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
   const capture=async name=>{
    for(const width of [1440,390]) {
     await page.setViewportSize({width,height:1000})
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow on '+name)
     const small=await page.locator('main[data-tab] button, main[data-tab] input:not([type="checkbox"]):not([type="radio"]), main[data-tab] select, main[data-tab] summary, main[data-tab] a[class*="btn"]').evaluateAll(controls=>controls.filter(control=>control.getClientRects().length&&control.getBoundingClientRect().height<44).map(control=>control.tagName))
     assert.deepEqual(small,[],'Small native controls on '+name)
     await page.screenshot({path:join(directory,name+'-'+width+'.png'),fullPage:true})
    }
    await page.setViewportSize({width:1440,height:1000})
   }
   await visit({page,capture})
  } finally {await context.close()}
 } finally {await browser.close()}
}
