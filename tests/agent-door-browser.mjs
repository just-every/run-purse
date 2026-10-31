import assert from 'node:assert/strict'
import {requesterSession} from './initialize-agent-door-requester.mjs'
import {withAgentBrowser} from './agent-door-browser-session.mjs'

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

export async function agentResourceBrowser({request,origin,cookie,order}) {
 for(const [role,session,mayConvert] of [['owner',cookie,true],['requester',requesterSession().cookie,false]]) {
  const response=await request(new URL('/api/purse/state',origin).href,{headers:{cookie:session}})
  assert.equal(response.status,200)
  const native=await response.json(),record=native.data.request.find(row=>row.id===order.request)
  assert.ok(record)
  assert.ok(native.actor.roles.includes(role))
  assert.equal(record.mayConvert,mayConvert)
  await withAgentBrowser({request,origin,cookie:session},async({page,capture})=>{
   await page.goto(origin+'/app?tab=Requests',{waitUntil:'networkidle'})
   const card=page.locator('#request-'+record.id)
   await card.waitFor()
   assert.ok((await card.innerText()).includes(record.title))
   await card.getByRole('button',{name:'Open request',exact:true}).click()
   for(const line of record.lines)assert.ok((await card.innerText()).includes(line.description))
   assert.equal(await card.getByRole('button',{name:'Generate purchase order',exact:true}).count(),mayConvert?1:0)
   await capture('agent-resource-'+role)
  })
 }
 console.log('PROBE BASE-AGENT-003 2 UI: owner and requester open the same native request -> matching title and lines, current buyer control only for owner; screens at 1440 and 390')
}
