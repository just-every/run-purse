import assert from 'node:assert/strict'
import {join} from 'node:path'
import {readFile} from 'node:fs/promises'
import {session,api,current} from './browser-journey.mjs'
export async function auditLogJourney(browser,root,origin,width,evidence){
 const owner=await session(browser,root,origin,'owner',width),requester=await session(browser,root,origin,'requester',width),approver=await session(browser,root,origin,'approver',width),buyer=await session(browser,root,origin,'buyer',width);
 try{
  const tag=width+'-'+crypto.randomUUID().slice(0,6),category='Audit equipment '+tag;
  const business=(await current(owner.context,origin)).data.business[0];
  if(!business.locations.includes('Denver'))await api(owner.context,origin,'business',{...business,locations:[...business.locations,'Denver']});
  await api(owner.context,origin,'policy',{name:'Safety equipment authority '+tag,currency:'USD',category,project:'Fitout',approver:'approver@dev.localhost',limitMinor:1000000,budgetMinor:5000000});
  const supplier=(await current(buyer.context,origin)).data.supplier.find(s=>s.status==='preferred'&&!s.mergedInto);
  const draft={title:'Quarterly safety equipment '+tag,supplier:supplier.id,currency:'USD',needDate:'2026-11-18',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Site safety harness',quantity:'10',unitMinor:10000,category,project:'Fitout'}]};
  const r=await api(requester.context,origin,'request',draft);await api(requester.context,origin,'submit',{id:r.id,revision:1});await api(approver.context,origin,'decision',{id:r.id,revision:1,decision:'approved',reason:'Safety equipment allowance confirmed'});
  const o=await api(buyer.context,origin,'convert',{id:r.id,revision:1});await api(buyer.context,origin,'issue',{id:o.id,revision:1,reason:'Supplier terms confirmed'});
  await api(buyer.context,origin,'amend',{...draft,id:r.id,revision:1,lines:[{...draft.lines[0],id:r.lines[0].id,quantity:'12'}],reason:'Add two spare harnesses'});
  await owner.page.reload();await owner.page.getByRole('navigation').getByRole('button',{name:'Audit',exact:true}).click();
  await owner.page.getByLabel('Subject ID or PO number',{exact:true}).fill(o.number);await owner.page.getByLabel('Exact action',{exact:true}).fill('decision');await Promise.all([owner.page.waitForResponse(response=>response.url().includes('/api/purse/audit?')&&response.status()===200),owner.page.getByRole('button',{name:'Filter audit history',exact:true}).click()]);
  const row=owner.page.getByRole('row').filter({has:owner.page.getByText('Safety equipment allowance confirmed',{exact:true})}).filter({has:owner.page.getByText(r.id,{exact:true})});await row.waitFor();
  await row.getByRole('button',{name:'Recorded detail',exact:true}).click();const policyPanel=owner.page.getByRole('heading',{name:'Recorded detail · decision',exact:true}).locator('..');await policyPanel.getByText('Safety equipment authority '+tag,{exact:true}).waitFor();
  await policyPanel.getByText('USD 10,000.00',{exact:true}).waitFor();await policyPanel.getByRole('heading',{name:'Request · revision 1',exact:true}).waitFor();
  await owner.page.screenshot({path:join(evidence,`AUDIT-001-policy-${width}.png`),fullPage:true});
  const downloaded=owner.page.waitForEvent('download');await owner.page.getByRole('link',{name:'Export filtered audit CSV',exact:true}).click();const file=await downloaded,path=join(evidence,`AUDIT-001-${width}.csv`);await file.saveAs(path);const csv=await readFile(path,'utf8');assert.match(csv,/Safety equipment authority/);assert.match(csv,/Safety equipment allowance confirmed/);assert.ok(!csv.includes('Add two spare harnesses'));
  await owner.page.getByLabel('Exact action',{exact:true}).fill('amend');await Promise.all([owner.page.waitForResponse(response=>response.url().includes('/api/purse/audit?')&&response.status()===200),owner.page.getByRole('button',{name:'Filter audit history',exact:true}).click()]);
  const amend=owner.page.getByRole('row').filter({has:owner.page.getByText('Add two spare harnesses',{exact:true})}).filter({has:owner.page.getByText(r.id,{exact:true})});await amend.waitFor();await amend.getByRole('button',{name:'Recorded detail',exact:true}).click();const amendmentPanel=owner.page.getByRole('heading',{name:'Recorded detail · amend',exact:true}).locator('..');const before=amendmentPanel.getByRole('heading',{name:'Before · revision 1',exact:true}).locator('..'),after=amendmentPanel.getByRole('heading',{name:'After · revision 2',exact:true}).locator('..');await before.getByText('10',{exact:true}).waitFor();await after.getByText('12',{exact:true}).waitFor();
  await owner.page.screenshot({path:join(evidence,`AUDIT-001-amendment-${width}.png`),fullPage:true});
  assert.equal(await owner.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`AUDIT-001 fits ${width}`);assert.equal(await amendmentPanel.locator('.record-table').evaluateAll(tables=>tables.some(t=>t.scrollWidth>t.clientWidth+1)),false,'Revision evidence tables fit without clipping');
  assert.equal((await requester.context.request.get(origin+'/api/purse/audit.csv')).status(),403);
  return {clause:'AUDIT-001',width,order:o.id};
 }finally{for(const s of [owner,requester,approver,buyer])await s.context.close()}
}
