import assert from 'node:assert/strict';
import {join} from 'node:path';
import {harness} from './purse-harness.mjs';
import {nativeWebContext} from './native-web-fixture.mjs';
import {approvalChainFlow} from './approval-chain-flow.mjs';
export async function approvalPoolsJourney({browser,bundle,width,evidence}) {
 const h=await harness(),contexts=[];
 try {
  const flow=await approvalChainFlow(h),{requester,manager,f1,f2,it,security,emails,input}=flow;
  const pageFor=async cookie=>{const ctx=await nativeWebContext(browser,h,width,bundle,cookie);contexts.push(ctx);return ctx.newPage();};
  const snap=async(page,name)=>{await page.screenshot({path:join(evidence,`APPROVAL-001-${width}-${name}.png`),fullPage:true});if(width===1440)assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Approval screens fit the viewport');};
  const owner=await pageFor(h.owner);await owner.goto(h.origin+'/app?tab=Settings');await owner.getByRole('row').filter({hasText:'Native conditional chain'}).getByRole('button',{name:'Edit policy',exact:true}).click();
  const configured=owner.getByLabel('Additional approvers (one email per line)',{exact:true});await configured.fill(`${emails.slice(2,5).join(', ')} | any | 10000.01 |\n${emails.slice(5).join(', ')} | all | 0 | software`);
  await owner.getByRole('button',{name:'Save policy',exact:true}).click();await owner.getByText('Saved.',{exact:true}).waitFor();await snap(owner,'settings');
  const r=await h.command('request',{...input(1200000),title:'Review native software approvals'},requester);
  const requesterPage=await pageFor(requester);await requesterPage.goto(h.origin+'/app?tab=Requests&request='+r.id);await requesterPage.getByRole('region',{name:'Approval route',exact:true}).waitFor();const compose=requesterPage.getByRole('button',{name:'New purchase request',exact:true});await compose.focus();await requesterPage.getByRole('tooltip',{name:'New request',exact:true}).waitFor();await snap(requesterPage,'draft-route');
  await h.command('submit',{id:r.id,revision:1},requester);await flow.decide(r,manager,'primary');
  const poolPage=await pageFor(f2);await poolPage.goto(h.origin+'/app?tab=Requests&request='+r.id);const card=poolPage.locator('#request-'+r.id);await card.getByRole('button',{name:'Approve',exact:true}).click();await poolPage.getByText('Saved.',{exact:true}).waitFor();await poolPage.getByRole('region',{name:'Approval route',exact:true}).getByText('Decided by '+emails[3],{exact:false}).waitFor();await snap(poolPage,'pool-decided');
  if(width===1440){assert.equal((await flow.read(r.id,f1)).mayApprove,false);assert.equal((await flow.read(r.id,f2)).mayApprove,false);}
  const itPage=await pageFor(it);await itPage.goto(h.origin+'/app?tab=Requests&request='+r.id);await itPage.locator('#request-'+r.id).getByRole('button',{name:'Approve',exact:true}).click();await itPage.getByText('Saved.',{exact:true}).waitFor();
  const securityPage=await pageFor(security);await securityPage.goto(h.origin+'/app?tab=Requests&request='+r.id);await securityPage.locator('#request-'+r.id).getByRole('button',{name:'Approve',exact:true}).waitFor();await snap(securityPage,'parallel-waits');
  if(width===1440){assert.equal((await flow.read(r.id)).status,'pending');assert.equal((await flow.read(r.id,it)).mayApprove,false);}
  await securityPage.locator('#request-'+r.id).getByRole('button',{name:'Approve',exact:true}).click();await securityPage.getByText('Saved.',{exact:true}).waitFor();if(width===1440)assert.equal((await flow.read(r.id)).status,'approved');
  console.log('Native approval pool browser journey passed at '+width);
 } finally {for(const context of contexts)await context.close();await h.close();}
}
