import assert from 'node:assert/strict'
import {join} from 'node:path'
import {identityFixture} from './identity-fixture.mjs'
import {samlIdp} from './saml-idp.mjs'
import {nativeWebContext} from './native-web-fixture.mjs'

export async function samlBrowserJourney({browser,width,evidence,shippedApp}){
 const h=await identityFixture({samlFactory:samlIdp,samlOnly:true}),contexts=[],pages=[]
 try{
  await h.command('business',{name:'Purse SAML',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']})
  await h.send('/auth/step-up',{action:'export'},h.owner,202)
  const proof=[...h.messages].reverse().find(message=>message.to.includes('owner@example.test')),token=new URL(proof.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token')
  await h.send('/auth/confirm',{token},h.owner,303)
  const settings=async body=>{const state=(await h.send('/api/purse/scim',undefined,h.owner)).value;return(await h.send('/api/purse/scim',{...body,revision:state.revision},h.owner)).value}
  await settings({action:'configure',issuer:h.saml.provider.issuer,enabled:true,mappings:[{department:'Operations',grants:[{role:'requester',scope:{departments:['Operations']}}]}],consent:true})
  const credential=await settings({action:'create-token'}),enterprise='urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'
  const created=await h.request('/scim/v2/Users',{body:{schemas:['urn:ietf:params:scim:schemas:core:2.0:User',enterprise],externalId:'synthetic-purse-41',userName:'synthetic-purse-41@example.test',displayName:'Synthetic Purse SAML',active:true,[enterprise]:{department:'Operations'}},headers:{authorization:'Bearer '+credential.token,'content-type':'application/scim+json'}});assert.equal(created.status,201)
  const ownerContext=await nativeWebContext(browser,h,width,shippedApp),memberContext=await nativeWebContext(browser,h,width,shippedApp);contexts.push(ownerContext,memberContext);await memberContext.clearCookies()
  const errors=[]
  const owner=await ownerContext.newPage(),member=await memberContext.newPage();pages.push(owner,member)
  member.on('console',message=>{if(message.type()==='error')console.error('SAML browser console:',message.text().replace(/https?:\/\/[^\s"']+/g,value=>{try{const url=new URL(value);return url.origin+url.pathname}catch{return 'redacted URL'}}))})
  for(const page of [owner,member])page.on('pageerror',error=>errors.push(error.message))
  const snap=async(page,name)=>{await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' fits viewport');await page.screenshot({path:join(evidence,`ACCESS-002-${name}-${width}.png`),fullPage:true})}
  const settingsUrl=h.origin+'/auth/purse/identity'
  await owner.goto(settingsUrl);await owner.getByRole('heading',{name:'Purse SAML',exact:true}).waitFor();await snap(owner,'saml-owner-disabled')
  await owner.getByRole('link',{name:'Service provider metadata',exact:true}).evaluate(element=>{if(!element.getAttribute('href'))throw new Error('Metadata destination missing')})
  assert.equal((await ownerContext.request.get(h.origin+'/auth/saml/company-saml/metadata')).status(),200)
  await owner.getByRole('button',{name:'Enable provider sign-in',exact:true}).click();await owner.getByRole('button',{name:'Disable provider sign-in',exact:true}).waitFor();await snap(owner,'saml-owner-enabled')
  await member.goto(h.origin+'/signin');await member.getByRole('button',{name:'Continue with Purse SAML',exact:true}).waitFor();await snap(member,'saml-sign-in')
  await memberContext.route(h.saml.provider.entryPoint+'?**',async route=>{
   const encoded=new URLSearchParams(h.saml.response(route.request().url())),escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
   // The IdP network edge returns its signed response; the native callback settles the session.
   await route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><body><form method="post" action="${h.origin}/auth/saml/company-saml/callback">${[...encoded].map(([name,value])=>`<input type="hidden" name="${name}" value="${escape(value)}">`).join('')}<button>Continue to Purse</button></form></body></html>`})
  })
  const started=member.waitForResponse(response=>new URL(response.url()).pathname==='/auth/saml/company-saml/start')
  await member.getByRole('button',{name:'Continue with Purse SAML',exact:true}).click()
  const startResponse=await started;console.log('Native SAML browser start:',startResponse.status());assert.equal(startResponse.status(),303,startResponse.status()===303?'':await startResponse.text())
  await member.getByRole('button',{name:'Continue to Purse',exact:true}).waitFor()
  await Promise.all([member.waitForResponse(response=>new URL(response.url()).pathname==='/auth/saml/company-saml/callback').then(async response=>{assert.equal(response.status(),303,await response.text());assert.equal(response.headers().location,'/app')}),member.waitForURL(h.origin+'/app',{waitUntil:'commit'}),member.getByRole('button',{name:'Continue to Purse',exact:true}).click()])
  assert.equal((await memberContext.request.get(h.origin+'/auth/session')).status(),200)
  await member.goto(h.origin+'/app');await member.getByRole('region',{name:'Requests',exact:true}).waitFor();await snap(member,'saml-native-member')
  assert.equal((await memberContext.request.get(settingsUrl)).status(),403)
  await owner.getByRole('button',{name:'Disable provider sign-in',exact:true}).click();await owner.getByRole('button',{name:'Enable provider sign-in',exact:true}).waitFor()
  assert.equal((await memberContext.request.get(h.origin+'/auth/session')).status(),401);assert.equal((await memberContext.request.get(h.origin+'/api/purse/state')).status(),401)
  await snap(owner,'saml-sessions-ended');assert.deepEqual(errors,[])
 }catch(error){for(const page of pages){const url=new URL(page.url());console.error('SAML browser failure:',JSON.stringify({url:url.origin+url.pathname,body:(await page.locator('body').innerText()).slice(0,1600)}))}throw error
 }finally{await Promise.all(contexts.map(context=>context.close()));await h.close()}
}
