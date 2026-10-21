import assert from 'node:assert/strict'
import {expect} from '@playwright/test'
import {join} from 'node:path'
import {session,api,current} from './browser-journey.mjs'
export async function spendReportJourney(browser,root,origin,width,evidence){
 const owner=await session(browser,root,origin,'owner',width),requester=await session(browser,root,origin,'requester',width),approver=await session(browser,root,origin,'approver',width),buyer=await session(browser,root,origin,'buyer',width);
 try{
  const tag=width+'-'+crypto.randomUUID().slice(0,6),category='Field equipment '+tag;
  const business=(await current(owner.context,origin)).data.business[0];
  if(!business.locations.includes('Denver'))await api(owner.context,origin,'business',{...business,locations:[...business.locations,'Denver']});
  await api(owner.context,origin,'policy',{name:'Field equipment allowance '+tag,currency:'USD',category,project:'Fitout',approver:'approver@dev.localhost',limitMinor:1000000,budgetMinor:5000000});
  const supplier=(await current(buyer.context,origin)).data.supplier.find(s=>s.status==='preferred'&&!s.mergedInto);
  const draft={title:'Autumn field equipment '+tag,supplier:supplier.id,currency:'USD',needDate:'2026-11-18',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Site safety harness',quantity:'10',unitMinor:10000,category,project:'Fitout'}]};
  const r=await api(requester.context,origin,'request',draft);await api(requester.context,origin,'submit',{id:r.id,revision:1});await api(approver.context,origin,'decision',{id:r.id,revision:1,decision:'approved',reason:'Safety equipment allowance confirmed'});
  const o=await api(buyer.context,origin,'convert',{id:r.id,revision:1});await api(buyer.context,origin,'issue',{id:o.id,revision:1,reason:'Supplier terms confirmed'});
  await api(owner.context,origin,'receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'4',reason:'Four harnesses accepted'});
  const invoice=await api(buyer.context,origin,'invoice',{order:o.id,reference:'Canyon-'+tag,source:'Supplier invoice PDF retained externally',allocations:[{line:o.lines[0].id,quantity:'4',amountMinor:40000}]});
  await owner.page.reload();await owner.page.getByRole('navigation').getByRole('button',{name:'Reports',exact:true}).click();
  await owner.page.getByLabel('Department',{exact:true}).selectOption('Operations');await owner.page.getByLabel('Project',{exact:true}).selectOption('Fitout');await owner.page.getByLabel('Category',{exact:true}).selectOption(category);
  await owner.page.getByLabel('From date',{exact:true}).fill('2026-10-01');await owner.page.getByLabel('Through date',{exact:true}).fill('2026-11-30');
  await Promise.all([owner.page.waitForResponse(r=>{const url=new URL(r.url());return url.pathname==='/api/purse/spend-report'&&url.searchParams.get('category')===category&&url.searchParams.get('department')==='Operations'&&url.searchParams.get('project')==='Fitout'&&r.status()===200}),owner.page.getByRole('button',{name:'Filter spend',exact:true}).click()]);
  const committed=owner.page.getByRole('button',{name:supplier.name+' committed USD',exact:true});await expect(committed).toHaveText('$600.00');
  await owner.page.screenshot({path:join(evidence,`REPORT-001-dashboard-${width}.png`),fullPage:true});await committed.click();const detail=owner.page.getByRole('region',{name:'Report source records'});
  await detail.getByRole('link',{name:o.number,exact:true}).waitFor();await detail.getByText('Source rows total: $600.00',{exact:true}).waitFor();await detail.getByText('Source record',{exact:true}).click();await detail.getByText(o.number+' · revision 1 · issued',{exact:true}).waitFor();
  assert.equal(await detail.getByRole('row').count(),2);await owner.page.screenshot({path:join(evidence,`REPORT-001-commitment-${width}.png`),fullPage:true});
  await owner.page.getByRole('button',{name:supplier.name+' actual USD',exact:true}).click();await detail.getByText('Invoice '+invoice.reference+' · Recorded evidence',{exact:true}).waitFor();await detail.getByText('Source rows total: $400.00',{exact:true}).waitFor();await detail.getByText('Source record',{exact:true}).click();await detail.getByText('Invoice '+invoice.reference+' · Supplier invoice PDF retained externally · $400.00',{exact:true}).waitFor();
  await owner.page.screenshot({path:join(evidence,`REPORT-001-actual-${width}.png`),fullPage:true});assert.equal(await owner.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`REPORT-001 fits ${width}`);
  const report=await owner.context.request.get(origin+'/api/purse/spend-report?category='+encodeURIComponent(category));const actual=await report.json();assert.equal(actual.rows.filter(row=>row.kind==='committed').reduce((n,row)=>n+row.amountMinor,0),60000);assert.equal(actual.rows.filter(row=>row.kind==='actual').reduce((n,row)=>n+row.amountMinor,0),40000);
  return {clause:'REPORT-001',width,order:o.id};
 }finally{for(const s of [owner,requester,approver,buyer])await s.context.close()}
}
