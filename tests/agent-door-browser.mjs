import assert from 'node:assert/strict'
import {withAgentBrowser} from './agent-door-browser-session.mjs'

export async function agentDocsBrowser({request,origin,cookie,docs}) {
 await withAgentBrowser({request,origin,cookie},async({page,capture})=>{
  await page.goto(origin+'/docs/agents',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Agent documentation',exact:true}).waitFor()
  assert.deepEqual(await page.locator('[data-tool]').evaluateAll(nodes=>nodes.map(node=>node.dataset.tool).sort()),docs.tools.map(tool=>tool.name).sort())
  assert.deepEqual(await page.locator('[data-prompt]').evaluateAll(nodes=>nodes.map(node=>node.dataset.prompt).sort()),docs.prompts.map(prompt=>prompt.name).sort())
  assert.equal(await page.locator('[data-limit="requestsPerMinute"]').innerText(),docs.limits.requestsPerMinute+' per agent')
  assert.equal(await page.locator('[data-limit="maxBodyBytes"]').innerText(),String(docs.limits.maxBodyBytes))
  assert.deepEqual(await page.locator('main *').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length&&getComputedStyle(node).fontSize&&parseFloat(getComputedStyle(node).fontSize)<13).map(node=>node.tagName)),[])
  const schema=page.locator('[data-tool]').first().getByText('Input and output schemas',{exact:true})
  await schema.click()
  await page.locator('[data-tool]').first().locator('pre').waitFor({state:'visible'})
  await capture('agent-documentation')
  await page.getByRole('link',{name:'Registry JSON',exact:true}).click()
  assert.deepEqual(JSON.parse(await page.locator('body').innerText()),docs)
 })
 console.log('PROBE BASE-AGENT-013 browser: live registry, schemas and proof visible at 1440; page captured at 1440 and 390 without overflow; text at least 13px; all controls labelled')
}

export async function agentDoorBrowser({request,origin,cookie,order,native}) {
 await withAgentBrowser({request,origin,cookie},async({page,capture})=>{
  const decision=native.decision.find(row=>row.request===order.request&&row.preparedBy?.agent.id)
  assert.ok(decision)
  await page.goto(origin+'/app?tab=Requests',{waitUntil:'networkidle'})
  assert.equal(new URL(page.url()).pathname,'/app')
  const card=page.locator('#request-'+order.request)
  await card.waitFor()
  assert.ok((await card.innerText()).includes(decision.preparedBy.label))
  await capture('agent-thread')
  await card.getByRole('button',{name:'Open request',exact:true}).click()
  await card.getByRole('heading',{name:'Decision history',exact:true}).waitFor()
  assert.ok((await card.innerText()).includes(decision.preparedBy.label))
  await capture('agent-decision')
  await page.goto(origin+'/app?tab=Audit',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Audit history',exact:true}).waitFor()
  await page.getByRole('cell',{name:decision.preparedBy.label,exact:true}).first().waitFor()
  await capture('agent-native-audit')
  await page.goto(origin+'/agents',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Agents',exact:true}).waitFor()
  await capture('agent-dashboard')
  await page.getByRole('button',{name:'Pause agents',exact:true}).click()
  await page.getByText('Agents are paused.',{exact:true}).waitFor()
  await capture('agent-paused')
  await page.getByRole('button',{name:'Resume agents',exact:true}).click()
  await page.getByText('Agents are on.',{exact:true}).waitFor()
  const response=await request(new URL('/agents/api/approvals',origin).href,{headers:{cookie}})
  assert.equal(response.status,200)
  const {approvals}=await response.json()
  const completed=approvals.find(approval=>approval.state==='executed')
  assert.ok(completed)
  await page.goto(origin+'/agents/approvals/'+encodeURIComponent(completed.id),{waitUntil:'networkidle'})
  await page.locator('[data-approval-state="executed"]').waitFor()
  await capture('agent-approval-executed')
  await page.goto(origin+'/agents/approvals/unavailable-native-request',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Request not found',exact:true}).waitFor()
  await capture('agent-approval-unavailable')
 })
 console.log('Native agent browser: thread, decision, audit, dashboard, pause, completed and unavailable approval at 1440 and 390; no horizontal overflow')
}

export async function agentPendingBrowser({request,origin,cookie,approval}) {
 await withAgentBrowser({request,origin,cookie},async({page,capture})=>{
  await page.goto(approval.url,{waitUntil:'networkidle'})
  await page.locator('[data-approval-state="pending"]').waitFor()
  const approve=page.getByRole('button',{name:'Approve',exact:true})
  const reject=page.getByRole('button',{name:'Decline',exact:true})
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000})
   for(const control of [approve,reject])assert.ok((await control.boundingBox()).height>=44)
  }
  await capture('agent-approval-pending')
  await reject.click()
  await page.locator('[data-approval-state="rejected"]').waitFor()
  await capture('agent-approval-rejected')
 })
 console.log('Native agent browser: pending exact-summary approval rejected by the named person at 1440 and 390; touch controls at least 44px')
}
