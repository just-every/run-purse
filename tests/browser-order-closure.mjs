import assert from 'node:assert/strict'
import {join} from 'node:path'
import {session,api,current} from './browser-journey.mjs'

export async function orderClosureJourney(browser,root,origin,width,evidence,supplier){
 const buyer=await session(browser,root,origin,'buyer',width),requester=await session(browser,root,origin,'requester',width),approver=await session(browser,root,origin,'approver',width),receiver=await session(browser,root,origin,'receiver',width);
 try{
  const request=await api(requester.context,origin,'request',{title:'Meeting room chairs '+width,supplier:supplier.id,currency:'AUD',needDate:'2026-01-01',location:'Brisbane',costCentre:'Operations',lines:[{description:'Meeting chair '+width,quantity:'10',unitMinor:10000,category:'Equipment',project:'Fitout'}],terms:'Net 30; buyer handles supplier channel'});
  await api(requester.context,origin,'submit',{id:request.id,revision:1});
  await api(approver.context,origin,'decision',{id:request.id,revision:1,decision:'approved',reason:'Office equipment budget reviewed'});
  const order=await api(buyer.context,origin,'convert',{id:request.id,revision:1});
  await api(buyer.context,origin,'issue',{id:order.id,revision:1,reason:'Existing supplier channel'});
  await api(receiver.context,origin,'receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'8',reason:'Eight chairs accepted'});
  let before=(await current(buyer.context,origin)).data;
  const tab=name=>buyer.page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
  await buyer.page.reload();await tab('Overview');await buyer.page.getByText(order.number,{exact:true}).waitFor();
  await tab('Orders');await buyer.page.getByRole('row').filter({hasText:order.number}).getByRole('button',{name:'Open order',exact:true}).click();
  await buyer.page.getByLabel('Closure reason',{exact:true}).fill('Supplier wrote off two short-shipped chairs');
  await buyer.page.getByRole('button',{name:'Close PO balance',exact:true}).click();
  await buyer.page.getByRole('heading',{name:order.number+' · closed',exact:true}).waitFor();
  let after=(await current(buyer.context,origin)).data;assert.equal(after.totals.AUD,before.totals.AUD-20000);
  assert.equal(after.order.find(o=>o.id===order.id).positions[0].closed,2000);
  await buyer.page.screenshot({path:join(evidence,`PO-010-closed-${width}.png`),fullPage:true});
  await tab('Overview');assert.equal(await buyer.page.getByText(order.number,{exact:true}).count(),0,'Closed balance has no overdue prompt');
  await buyer.page.screenshot({path:join(evidence,`PO-010-overdue-stopped-${width}.png`),fullPage:true});
  await tab('Orders');await buyer.page.getByRole('row').filter({hasText:order.number}).getByRole('button',{name:'Open order',exact:true}).click();
  await buyer.page.getByText('Add invoice evidence',{exact:true}).click();
  for(const [label,value]of Object.entries({'Invoice reference':'CHAIRS-'+width,'Evidence source':'Supplier invoice for ten chairs','Invoice quantity':'10','Invoice amount':'1000.00'}))await buyer.page.getByLabel(label,{exact:true}).fill(value);
  await buyer.page.getByLabel('PO line',{exact:true}).selectOption(order.lines[0].id);
  await buyer.page.getByRole('button',{name:'Save invoice evidence',exact:true}).click();
  await buyer.page.getByRole('alert').filter({hasText:'Invoice exceeds the closed PO balance'}).waitFor();
  after=(await current(buyer.context,origin)).data;assert.equal(after.invoice.find(i=>i.reference==='CHAIRS-'+width).status,'exception');
  await buyer.page.screenshot({path:join(evidence,`PO-010-exception-${width}.png`),fullPage:true});
  await buyer.page.getByLabel('Reopen reason',{exact:true}).fill('Supplier confirmed the remaining two chairs');
  await buyer.page.getByRole('button',{name:'Reopen PO balance',exact:true}).click();
  await buyer.page.getByRole('heading',{name:order.number+' · issued',exact:true}).waitFor();
  after=(await current(buyer.context,origin)).data;assert.equal(after.totals.AUD,before.totals.AUD);assert.equal(after.order.find(o=>o.id===order.id).positions[0].outstanding,2000);
  assert.equal(after.commitment.filter(e=>e.request===request.id&&e.kind==='reopen-reservation').length,1);
  await buyer.page.screenshot({path:join(evidence,`PO-010-reopened-${width}.png`),fullPage:true});
  assert.equal(await buyer.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`PO-010 fits ${width}px`);
  return {clause:'PO-010',width,order:order.id};
 }finally{for(const s of [buyer,requester,approver,receiver])await s.context.close()}
}
