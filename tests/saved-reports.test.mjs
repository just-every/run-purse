import {reportDeliveryJourney,createReportKey,createReportSchedule,feed,tickReports} from './report-delivery-flow.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createPortability} from '@runeditrun/rer/modules/portability';
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import {harness} from './purse-harness.mjs';
import {reauthenticateErasure} from './erasure-flow.mjs';
import {savedReportFixture,reportMail} from './saved-report-fixture.mjs';
import {assertDownloads,assertNativeReport} from './saved-report-proof.mjs';

test('Saved report views recompute scoped allocation rows, literal CSV and parsed XLSX with independent currency totals',async t=>{
 const f=await savedReportFixture();t.after(()=>f.close());const {h}=f;
 const saved=await f.save({groupBy:'glAccount'});assert.equal(saved.status,200);const definition=saved.value,path='/api/purse/saved-reports/'+definition.id;
 const view=await h.send(path+'/view',undefined,f.finance);assert.equal(view.status,200);assertNativeReport(view.value.report,f);
 const direct=await h.send('/api/purse/spend-report?groupBy=glAccount',undefined,f.finance);assert.deepEqual(view.value.report,direct.value);
 const csv=await h.send(path+'/csv',undefined,f.finance),xlsx=await h.mf.dispatchFetch(h.origin+path+'/xlsx',{headers:{cookie:f.finance}});assert.equal(csv.status,200);assert.equal(xlsx.status,200);assert.equal(xlsx.headers.get('cache-control'),'no-store');assert.match(xlsx.headers.get('content-type'),/spreadsheetml/);assert.match(csv.headers.get('content-disposition'),/attachment/);
 await assertDownloads(csv.value,await xlsx.arrayBuffer(),view.value.report,f);
 await reportDeliveryJourney(f,definition);
 const supplierView=(await f.save({groupBy:'supplier'})).value,supplierPath='/api/purse/saved-reports/'+supplierView.id;
 const supplierReport=(await h.send(supplierPath+'/view',undefined,f.finance)).value.report,supplierCsv=await h.send(supplierPath+'/csv',undefined,f.finance),supplierXlsx=await h.mf.dispatchFetch(h.origin+supplierPath+'/xlsx',{headers:{cookie:f.finance}});
 await assertDownloads(supplierCsv.value,await supplierXlsx.arrayBuffer(),supplierReport,f);
 for(const [field,value] of Object.entries({department:'Operations',project:'Network',location:'Denver',supplier:f.supplier.id,category:'Equipment'})) {
  const filtered=(await f.save({[field]:value,groupBy:field})).value;
  const result=await h.send('/api/purse/saved-reports/'+filtered.id+'/view',undefined,f.finance);assert.equal(result.status,200);assertNativeReport(result.value.report,f);assert.ok(result.value.report.rows.every(row=>row[field]===value));
 }
 const injected=await h.send('/api/purse/saved-reports',{name:'synthetic-purse-4124',filters:{},report:{rows:[]}},f.finance);assert.equal(injected.status,400);
 const crossOrigin=await h.mf.dispatchFetch(h.origin+'/api/purse/saved-reports',{method:'POST',headers:{cookie:f.finance,origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify({name:'synthetic-purse-4125',filters:{}})});assert.equal(crossOrigin.status,403);
 const custom=await f.save({groupBy:'line:'+f.form.id+':grant',['header:'+f.form.id+':region']:'synthetic-purse-4108'});assert.equal(custom.status,200);const grouped=await h.send('/api/purse/saved-reports/'+custom.value.id+'/view',undefined,f.finance);assert.equal(grouped.value.report.rows.length,4);assert.deepEqual(grouped.value.report.groups.map(row=>[row.label,row.currency,row.committedMinor,row.actualMinor]),[['-synthetic-purse-4110','USD',6001,4000]]);
 // Use immutable source dates rather than an expectation tied to today's date.
 const dates=[f.order.needDate,f.invoice.at.slice(0,10)].sort(),from=dates[0],through=dates[1];
 const outside=new Date(Date.parse(from+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const excluded=await f.submit({...f.draft,title:'synthetic-purse-4128',needDate:outside});
 const filtered=await f.save({groupBy:'department',from,through,glAccount:'6300'});assert.equal(filtered.status,200);const single=await h.send('/api/purse/saved-reports/'+filtered.value.id+'/view',undefined,f.finance);assert.deepEqual(single.value.report.rows.map(row=>[row.kind,row.amountMinor]),[['committed',2400],['actual',1600]]);assert.ok(!single.value.report.rows.some(row=>row.request===excluded.id));
 // Save no financial results: a later ordinary purchase changes a reopened broad view.
 await f.submit({...f.draft,title:'synthetic-purse-4120'});const updated=await h.send(path+'/view',undefined,f.finance);assert.equal(updated.value.report.totals.find(row=>row.currency==='USD').reservedMinor,23002);
 assert.equal((await h.send(path+'/view',undefined,h.owner)).status,403);
 assert.equal((await h.send(path+'/view')).status,401);
 for(const filters of [{bankAccount:'synthetic-purse-4121'},{groupBy:'bankAccount'},{from:'2027-02-30'},{through:'2026-01-01',from:'2027-01-01'}])assert.equal((await f.save(filters)).status,400);
 const changed=await h.send('/api/purse/saved-reports',{id:definition.id,version:definition.version,name:'Renamed personal view',filters:{groupBy:'department'}},f.finance);assert.equal(changed.status,200);assert.equal((await h.send('/api/purse/saved-reports',{id:definition.id,version:definition.version,remove:true},f.finance)).status,409);assert.equal((await h.send('/api/purse/saved-reports',{id:definition.id,version:changed.value.version,remove:true},f.finance)).status,200);assert.equal((await h.send(path+'/view',undefined,f.finance)).status,404);
});

test('Saved definitions never restore authority and refuse revoked scope, foreign members and erased identity',async t=>{
 const f=await savedReportFixture();t.after(()=>f.close());const {h,cmd}=f;
 const auditor=await h.member(reportMail(4126),['auditor']);assert.equal((await f.save({},'synthetic-purse-4127',auditor)).status,403);assert.equal((await h.send('/api/purse/saved-reports',undefined,auditor)).value.maySave,false);
 const broad=(await f.save({groupBy:'department'})).value,scoped=(await f.save({department:'Operations'})).value;
 const path=id=>'/api/purse/saved-reports/'+id;
 const key=await createReportKey(f,broad),person=(await h.send('/api/purse/report-schedules',undefined,f.finance)).value.recipients.find(row=>row.email===reportMail(4101));
 const schedule=await createReportSchedule(f,scoped,person.id); const mailCount=h.messages.filter(message=>message.subject.startsWith('Saved report:')).length;
 await cmd('member',{email:reportMail(4101),name:'Changed current scope',active:true,grants:[{role:'finance-viewer',scope:{departments:['Research']}}]});
 assert.equal((await feed(h,key)).status,403);await tickReports(h,Date.parse(schedule.anchor));assert.equal(h.messages.filter(message=>message.subject.startsWith('Saved report:')).length,mailCount,'Changed creator scope cannot deliver an unavailable filter');
 for(const format of ['view','csv','xlsx'])assert.equal((await h.send(path(scoped.id)+'/'+format,undefined,f.finance)).status,403);
 const narrowed=await h.send(path(broad.id)+'/view',undefined,f.finance);assert.equal(narrowed.status,200);assert.deepEqual(narrowed.value.report.rows.map(row=>[row.request,row.amountMinor]),[[f.hidden.id,7000]]);assert.deepEqual((await h.send('/api/purse/saved-reports',undefined,f.finance)).value.definitions.map(row=>row.id),[broad.id]);
 assert.equal((await feed(h,key)).status,403);
 await cmd('member',{email:reportMail(4101),name:'Revoked report authority',active:true,roles:['receiver']});
 for(const format of ['view','csv','xlsx'])assert.equal((await h.send(path(broad.id)+'/'+format,undefined,f.finance)).status,403);
 const archive=join(h.dir,'synthetic-purse-4122.rer'),service=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability});await exportArchive(service,archive,[]);
 const restored=await harness();t.after(()=>restored.close());const target=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});await importArchive(target,archive,[]);
 assert.equal((await restored.db.prepare("SELECT count(*) n FROM p_records WHERE kind='savedReport'").first()).n,2);
 for(const table of ['p_report_keys','p_report_schedules','p_report_deliveries'])assert.equal((await restored.db.prepare('SELECT count(*) n FROM '+table).first()).n,0);
 assert.equal((await feed(restored,{...key,url:key.url.replace(h.origin,restored.origin)})).status,401);
 assert.equal((await restored.send(path(broad.id)+'/view',undefined,f.finance)).status,401,'Old native session never travels with definitions');
 const replacement=await restored.member(reportMail(4101),['receiver']);for(const format of ['view','csv','xlsx'])assert.equal((await restored.send(path(broad.id)+'/'+format,undefined,replacement)).status,403);
 // A new current grant cannot adopt a different native person's private definition.
 await restored.command('member',{email:reportMail(4101),name:'Fresh finance authority',active:true,roles:['finance-viewer']});assert.equal((await restored.send(path(broad.id)+'/view',undefined,replacement)).status,403);
 await cmd('member',{email:reportMail(4101),name:'Inactive finance member',active:false,roles:['finance-viewer']});await reauthenticateErasure(h);
 const meta=(await h.send('/api/purse/erasure',undefined,h.owner)).value,preview=await h.send('/api/purse/erasure/preview',{kind:'member',id:reportMail(4101),revision:meta.revision},h.owner);assert.equal(preview.status,200);const p=preview.value;
 const erased=await h.send('/api/purse/erasure/execute',{...p.subject,revision:p.revision,review:p.review,fingerprint:p.fingerprint,consent:true},h.owner);assert.equal(erased.status,200,JSON.stringify(erased.value));
 assert.equal((await h.send(path(broad.id)+'/view',undefined,f.finance)).status,401);
 assert.equal((await h.db.prepare('SELECT count(*) n FROM p_report_keys').first()).n,0,'Erased identity retains no report credential');
 assert.equal((await h.db.prepare('SELECT count(*) n FROM p_report_schedules').first()).n,0,'Erased identity retains no executable report schedule');
 const definitions=(await h.db.prepare("SELECT value FROM p_records WHERE kind='savedReport'").all()).results;assert.ok(!JSON.stringify(definitions).includes(reportMail(4101)));assert.ok(definitions.every(row=>JSON.parse(row.value).actor.startsWith('erased-')));
});
