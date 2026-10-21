import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive,importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';
import { searchPurchasing,addSearchScale,pdfPhrase,bankNumber } from './search-fixtures.mjs';

test('SEARCH-001 public search in 100000 real D1 records finds exact purchasing sources under one second and enforces current scope and protected-field exclusion',async t=>{
 const h=await harness();t.after(()=>h.close());const f=await searchPurchasing(h);const scopedFinance=await h.member('synthetic-purse-401@example.test',['finance-viewer']),scopedReceiver=await h.member('synthetic-purse-402@example.test',['receiver']);for(const [email,role]of [['synthetic-purse-401@example.test','finance-viewer'],['synthetic-purse-402@example.test','receiver']])await h.command('member',{email,name:'Scoped search member',grants:[{role,scope:{departments:['Operations'],locations:['Denver'],projects:['Safety'],entities:['main']}}]});await addSearchScale(h);
 async function find(params,cookie=f.buyer){const query=new URLSearchParams(params),at=performance.now(),response=await h.send('/api/purse/search?'+query,undefined,cookie);const elapsed=performance.now()-at;assert.equal(response.status,200,JSON.stringify(response.value));assert.ok(elapsed<1000,`SEARCH-001 query completed in ${elapsed.toFixed(1)}ms`);return response.value;}
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
});


test('SEARCH-001 complete archive restore preserves source-bound search and rebuilds full-text lookup before readiness',async t=>{
 const h=await harness();t.after(()=>h.close());const f=await searchPurchasing(h),archive=join(h.dir,'search.rer'),service=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability});await exportArchive(service,archive,[]);
 const restored=await harness({empty:true});t.after(()=>restored.close());const target=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});await importArchive(target,archive,[]);const boot=await restored.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'Restored owner'});assert.equal(boot.status,303);const ready=await restored.send('/api/purse/search/meta',undefined,boot.cookie);assert.equal(ready.status,200);const found=await restored.send('/api/purse/search?'+new URLSearchParams({q:pdfPhrase}),undefined,boot.cookie);assert.equal(found.status,200);assert.ok(found.value.results.some(row=>row.kind==='invoiceReading'&&row.id===f.reading.id));assert.equal((await restored.send('/api/purse/search?'+new URLSearchParams({q:bankNumber}),undefined,boot.cookie)).value.total,0);
});
