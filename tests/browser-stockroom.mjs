import assert from 'node:assert/strict'
import {join} from 'node:path'
import {session,api,current} from './browser-journey.mjs'

export async function stockroomJourney(browser,root,origin,width,evidence,supplier){
 const buyer=await session(browser,root,origin,'buyer',width),owner=await session(browser,root,origin,'owner',width);
 try{
  const name='Floor cleaner cases '+width;
  const item=await api(buyer.context,origin,'catalogue',{description:name,supplier:supplier.id,currency:'AUD',unitMinor:4250,category:'Equipment',approved:true});
  await buyer.page.reload();await buyer.page.getByRole('navigation').getByRole('button',{name:'Catalogue',exact:true}).click();
  const stock=buyer.page.getByRole('heading',{name:'Stockroom consumables',exact:true}).locator('..');
  await stock.getByText('Add stockroom item',{exact:true}).click();
  for(const [label,value] of Object.entries({'Stockroom item name':name,'Reorder point':'5','Replenish to':'12','Need date':'2026-11-30','Supplier-supplied terms':'Net 30; cleaning supplies'}))await stock.getByLabel(label,{exact:true}).fill(value);
  for(const [label,value] of Object.entries({'Preferred catalogue item':item.id,'Location':'Brisbane','Cost centre':'Operations','Project':'Fitout'}))await stock.getByLabel(label,{exact:true}).selectOption(value);
  await stock.getByRole('button',{name:'Save stockroom item',exact:true}).click();
  await stock.getByRole('row').filter({hasText:name}).getByRole('button',{name:'Record count / edit'}).click();
  await stock.getByLabel('Count on hand',{exact:true}).fill('2');await stock.getByRole('button',{name:'Record stock count',exact:true}).click();
  await stock.getByRole('row').filter({hasText:name}).getByText('draft',{exact:true}).waitFor();
  let data=(await current(buyer.context,origin)).data;const counted=data.stockroom.find(s=>s.catalogue===item.id),request=data.request.find(r=>r.id===counted.request);
  assert.equal(request.status,'draft');assert.equal(request.lines[0].quantity,'10');assert.equal(request.lines[0].unitMinor,4250);assert.equal(data.decision.filter(d=>d.request===request.id).length,0);
  await buyer.page.screenshot({path:join(evidence,`STOCK-001-draft-${width}.png`),fullPage:true});
  await owner.page.reload();await owner.page.getByRole('navigation').getByRole('button',{name:'Requests',exact:true}).click();
  await owner.page.getByRole('row').filter({hasText:request.title}).getByRole('button',{name:'Open request',exact:true}).click();
  await owner.page.getByRole('button',{name:'Submit for approval',exact:true}).click();await owner.page.getByRole('row').filter({hasText:request.title}).getByText('pending',{exact:false}).waitFor();
  await owner.page.screenshot({path:join(evidence,`STOCK-001-submitted-${width}.png`),fullPage:true});
  assert.equal((await current(owner.context,origin)).data.request.find(r=>r.id===request.id).status,'pending');
  for(const page of [buyer.page,owner.page])assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`STOCK-001 fits ${width}px`);
  return {clause:'STOCK-001',width,request:request.id};
 }finally{await buyer.context.close();await owner.context.close()}
}
