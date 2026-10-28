
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive,importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';
import { searchPurchasing,pdfPhrase,bankNumber } from './search-fixtures.mjs';

export async function searchFlow(){
{
 // SEARCH-001 public search in 100000 real D1 records finds exact purchasing sources under one second and enforces current scope and protected-field exclusion
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const h=await harness();t.after(()=>h.close());const f=await searchPurchasing(h);const scopedFinance=await h.member('synthetic-purse-401@example.test',['finance-viewer']),scopedReceiver=await h.member('synthetic-purse-402@example.test',['receiver']);for(const [email,role]of [['synthetic-purse-401@example.test','finance-viewer'],['synthetic-purse-402@example.test','receiver']])await h.command('member',{email,name:'Scoped search member',grants:[{role,scope:{departments:['Operations'],locations:['Denver'],projects:['Safety'],entities:['main']}}]});
 async function find(params,cookie=f.buyer){const query=new URLSearchParams(params),response=await h.send('/api/purse/search?'+query,undefined,cookie);assert.equal(response.status,200,JSON.stringify(response.value));return response.value;}
 for(const [q,kind,id]of [['OLD-42','order','procurify:order:p1'],['VENDOR-2026-0889','invoice',f.invoice.id],['smith jones co','supplier',f.supplier.id],['$1,234.56','order',f.order.id],[pdfPhrase,'invoiceReading',f.reading.id]]){const result=await find({q});assert.ok(result.results.some(row=>row.kind===kind&&row.id===id),q+': '+JSON.stringify(result));for(const row of result.results)assert.match(row.url,/^\/app\?search=1&open=/);}
 for(const cookie of [scopedFinance,scopedReceiver]){assert.equal((await find({q:f.outside.title},cookie)).total,0);assert.ok((await find({kind:'order',id:f.order.id},cookie)).results.some(row=>row.id===f.order.id));}assert.ok((await find({q:pdfPhrase},scopedFinance)).results.some(row=>row.id===f.reading.id));assert.equal((await find({q:pdfPhrase},scopedReceiver)).total,0);
 const partial=await find({q:'0889'});assert.ok(partial.results.some(row=>row.id===f.invoice.id));
 const range=await find({kind:'request',amountMin:'1234.56',amountMax:'1234.56',currency:'USD',status:'approved',requester:'requester@example.test',coding:'Safety'});assert.ok(range.results.some(row=>row.id===f.request.id));assert.ok(!(await find({amountMin:'1234.57',amountMax:'1300',kind:'request'})).results.some(row=>row.id===f.request.id));
 const dated=await find({kind:'invoice',dateFrom:'2026-10-19',dateTo:'2026-10-19'});assert.ok(dated.results.some(row=>row.id===f.invoice.id));assert.ok(!(await find({kind:'invoice',dateFrom:'2026-10-20'})).results.some(row=>row.id===f.invoice.id));
 assert.equal((await find({q:f.outside.title},f.requester)).total,0,'Another department/requester purchase stays outside current requester scope');assert.equal((await find({q:pdfPhrase},f.requester)).total,0,'Private invoice text is buyer-only');assert.equal((await find({kind:'invoiceReading',id:f.reading.id},f.requester)).total,0);
 for(const cookie of [h.owner,f.buyer,f.requester,f.approver,f.receiver])assert.equal((await find({q:bankNumber},cookie)).total,0,'Bank account numbers never enter the searchable projection');
 assert.equal((await find({q:'Restricted field instrument'},f.requester)).total,0,'Catalog access applies to search');
 const record=await find({kind:'order',id:f.order.id},f.requester);assert.equal(record.results.length,1);assert.equal(record.results[0].id,f.order.id);
 for(const route of ['/api/purse/search?q=Canyon','/api/purse/search/meta'])assert.equal((await h.send(route,undefined,'')).status,401);
 const revoked=await h.send('/auth/signout',{},f.requester);assert.equal(revoked.status,204);assert.equal((await h.send('/api/purse/search?q=Canyon',undefined,f.requester)).status,401);

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // scoped search lists only purchases whose every line, split allocation and order coding fits the reader grant
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const h=await harness();t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'synthetic-purse-3100',currencies:['USD'],locations:['Boston','Chicago'],costCentres:['Engineering','Finance'],projects:['IT','Secret']});
 const supplier=await cmd('supplier',{name:'synthetic-purse-3101',status:'preferred',reason:'Reviewed supplier'});
 const approver=await h.member('synthetic-purse-3102@example.test',['approver']),receiver=await h.member('synthetic-purse-3103@example.test',['receiver']);
 await cmd('member',{email:'synthetic-purse-3103@example.test',name:'Scoped receiver',grants:[{role:'receiver',scope:{departments:['Engineering'],locations:['Boston'],projects:['IT'],entities:['main']}}]});
 await cmd('policy',{name:'synthetic-purse-3104',currency:'USD',category:'*',project:'*',approver:'synthetic-purse-3102@example.test',limitMinor:1000000,budgetMinor:10000000,editRules:{'*':{allowed:['costCentre','location'],material:['costCentre']}}});
 const line={description:'synthetic-purse-3105 sensor',quantity:'1',unitMinor:50000,category:'Equipment',project:'IT'},split=[{costCentre:'Engineering',project:'IT',location:'Boston',basisPoints:5000},{costCentre:'Finance',project:'Secret',location:'Chicago',basisPoints:5000}];
 const input=(title,lines)=>({title,supplier:supplier.id,currency:'USD',needDate:'2026-11-30',location:'Boston',costCentre:'Engineering',terms:'Net 30',lines});
 const purchase=async(title,lines)=>{const r=await cmd('request',input(title,lines));await cmd('submit',{id:r.id,revision:1});return r;};
 const issue=async r=>{await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Reviewed coding'},approver);const o=await cmd('convert',{id:r.id,revision:1});await cmd('issue',{id:o.id,revision:o.revision,reason:'Approved order issued'});return o;};
 const inside=await purchase('synthetic-purse-3106 inside',[line]),allocated=await purchase('synthetic-purse-3107 allocated',[{...line,allocations:split}]),coded=await purchase('synthetic-purse-3108 coded',[line]),narrowed=await purchase('synthetic-purse-3109 narrowed',[{...line,allocations:split}]);
 const insideOrder=await issue(inside);await issue(allocated);await issue(narrowed);
 await cmd('approver-edit',{id:coded.id,revision:1,changes:{lines:[{id:coded.lines[0].id,costCentre:'Finance',location:'Chicago'}]},reason:'Finance owns this line'},approver);
 await cmd('amend',{...input('synthetic-purse-3109 narrowed',[{...line,id:narrowed.lines[0].id}]),id:narrowed.id,revision:1,reason:'Engineering keeps the whole line'});
 const {data}=await h.state(receiver);assert.deepEqual(data.request.map(row=>row.id).sort(),[inside.id,narrowed.id].sort());assert.deepEqual(data.order.map(row=>row.id),[insideOrder.id]);
 for(const kind of ['request','order']){const found=await h.send('/api/purse/search?kind='+kind,undefined,receiver);assert.equal(found.status,200,JSON.stringify(found.value));assert.deepEqual(found.value.results.map(row=>row.id).sort(),data[kind].map(row=>row.id).sort(),kind);assert.equal(found.value.total,data[kind].length,kind);}

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // SEARCH-001 complete archive restore preserves source-bound search and rebuilds full-text lookup before readiness
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const h=await harness();t.after(()=>h.close());const f=await searchPurchasing(h),archive=join(h.dir,'search.rer'),service=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability});await exportArchive(service,archive,[]);
 const restored=await harness({empty:true});t.after(()=>restored.close());const target=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});await importArchive(target,archive,[]);const boot=await restored.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'Restored owner'});assert.equal(boot.status,303);const ready=await restored.send('/api/purse/search/meta',undefined,boot.cookie);assert.equal(ready.status,200);const found=await restored.send('/api/purse/search?'+new URLSearchParams({q:pdfPhrase}),undefined,boot.cookie);assert.equal(found.status,200);assert.ok(found.value.results.some(row=>row.kind==='invoiceReading'&&row.id===f.reading.id));assert.equal((await restored.send('/api/purse/search?'+new URLSearchParams({q:bankNumber}),undefined,boot.cookie)).value.total,0);

 } finally {for(const close of cleanups.reverse())await close();}
}
}
