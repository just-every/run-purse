import assert from 'node:assert/strict';
import {parse} from 'csv-parse/sync';
import readXlsx from 'read-excel-file/node';
import {reportMail} from './saved-report-fixture.mjs';

export async function createReportKey(f,definition,department='Operations') {
 const result=await f.h.send('/api/purse/report-keys',{view:definition.id,version:definition.version,name:'synthetic-purse-4200',department,consent:true},f.h.owner);
 assert.equal(result.status,200,JSON.stringify(result.value));return result.value;
}
export async function feed(h,key,resource='Rows',suffix='') {
 const response=await h.mf.dispatchFetch(key.url+resource+suffix,{headers:{authorization:'Bearer '+key.token}});
 const content=await response.text();let value;try{value=JSON.parse(content);}catch{value=content;}return {status:response.status,value,headers:response.headers};
}
export async function createReportSchedule(f,definition,recipient,format='csv',cadence='weekly') {
 const startAt='2040-01-31T10:15:00.000Z';
 const result=await f.h.send('/api/purse/report-schedules',{view:definition.id,version:definition.version,recipient,format,cadence,startAt,consent:true},f.finance);
 assert.equal(result.status,200,JSON.stringify(result.value));return result.value;
}
export async function tickReports(h,time) {
 const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+time);assert.equal(response.status,200,await response.text());
}
export async function reportDeliveryJourney(f,definition) {
 const {h}=f,keys=['request','kind','glAccount','currency','amountMinor'];
 const financialBefore=(await h.db.prepare("SELECT value FROM p_records WHERE kind IN ('request','order','invoice','commitment') ORDER BY kind,id").all()).results;
 const report=(await h.send('/api/purse/saved-reports/'+definition.id+'/view',undefined,f.finance)).value.report;
 const key=await createReportKey(f,definition);
 const service=await feed(h,key,'');assert.equal(service.status,200);assert.deepEqual(service.value.value.map(row=>row.name),['Rows','Groups','Totals']);
 const metadata=await feed(h,key,'$metadata');assert.equal(metadata.status,200);assert.match(metadata.value,/<edmx:Edmx Version="4.0"/);assert.match(metadata.value,/EntitySet Name="Rows"/);
 const rows=await feed(h,key);assert.equal(rows.status,200);assert.equal(rows.headers.get('odata-version'),'4.0');
 assert.deepEqual(rows.value.value.map(row=>keys.map(key=>row[key])).sort(),report.rows.map(row=>keys.map(key=>row[key])).sort());assert.equal(new Set(rows.value.value.map(row=>row.Id)).size,6);
 assert.deepEqual((await feed(h,key,'Totals')).value.value.map(({Id,...total})=>total),report.totals);
 const groups=await feed(h,key,'Groups');assert.deepEqual(groups.value.value.map(row=>[row.groupBy,row.group,row.currency,row.committedMinor,row.actualMinor]),report.groups.map(row=>[report.groupBy,row.label??'',row.currency,row.committedMinor,row.actualMinor]));
 const page=await feed(h,key,'Rows','?$top=2&$count=true&$select=request,amountMinor');assert.equal(page.value['@odata.count'],6);assert.equal(page.value.value.length,2);assert.deepEqual(Object.keys(page.value.value[0]),['request','amountMinor']);
 const next=await h.mf.dispatchFetch(page.value['@odata.nextLink'],{headers:{authorization:'Bearer '+key.token}});assert.equal(next.status,200);assert.equal((await next.json()).value.length,2);
 for(const query of ['?$filter=department%20eq%20Research','?$select=bankAccount','?$top=0'])assert.equal((await feed(h,key,'Rows',query)).status,400);
 const write=await h.mf.dispatchFetch(key.url+'Rows',{method:'POST',headers:{authorization:'Bearer '+key.token}});assert.equal(write.status,405);
 assert.equal((await h.mf.dispatchFetch(key.url+'Rows')).status,401);
 assert.equal((await h.send('/api/purse/report-keys',undefined,f.finance)).status,403);
 const token=(await h.send('/api/purse/integration-tokens',{name:'synthetic-purse-4201',requesterEmail:reportMail(4102)},h.owner)).value.token;
 assert.equal((await h.mf.dispatchFetch(key.url+'Rows',{headers:{authorization:'Bearer '+token}})).status,401);
 const rotation=await h.send('/api/purse/report-keys/'+key.key.id+'/rotate',{},h.owner);assert.equal(rotation.status,200);assert.equal((await feed(h,key)).status,401);key.token=rotation.value.token;assert.equal((await feed(h,key)).status,200);
 assert.ok(!JSON.stringify((await h.send('/api/purse/report-keys',undefined,h.owner)).value).includes(key.token));
 for(const value of [f.hidden.id,...Object.values(f.protectedValues),'Private original context'])assert.ok(!JSON.stringify(rows.value).includes(value));
 const recipient=(await h.send('/api/purse/report-schedules',undefined,f.finance)).value.recipients.find(row=>row.email===reportMail(4101));assert.ok(recipient);
 const weekly=await createReportSchedule(f,definition,recipient.id),monthly=await createReportSchedule(f,definition,recipient.id,'xlsx','monthly');
 const count=h.messages.length,at=Date.parse(weekly.anchor);
 await tickReports(h,at-1);assert.equal(h.messages.slice(count).filter(message=>message.subject.startsWith('Saved report:')).length,0);
 await Promise.all([tickReports(h,at),tickReports(h,at)]);
 let messages=h.messages.slice(count).filter(message=>message.subject.startsWith('Saved report:'));assert.equal(messages.length,2);
 const csv=messages.find(message=>message.attachments[0].filename.endsWith('.csv')),xlsx=messages.find(message=>message.attachments[0].filename.endsWith('.xlsx'));
 assert.deepEqual(csv.to,[reportMail(4101)]);assert.deepEqual(xlsx.to,[reportMail(4101)]);
 const csvRecords=parse(Buffer.from(csv.attachments[0].content,'base64').toString(),{columns:true});
 assert.deepEqual(csvRecords.filter(row=>row.recordType==='Totals').map(row=>[row.currency,Number(row.reservedMinor),Number(row.committedMinor),Number(row.actualMinor)]),[['CAD',5003,0,0],['USD',3000,6001,4000]]);
 assert.deepEqual(csvRecords.filter(row=>row.recordType==='Rows').map(row=>keys.map(key=>String(row[key]))).sort(),report.rows.map(row=>keys.map(key=>String(row[key]))).sort());
 const [headers,...cells]=await readXlsx(Buffer.from(xlsx.attachments[0].content,'base64'),{sheet:'Rows'});const sheet=cells.map(row=>Object.fromEntries(headers.map((key,i)=>[key,row[i]])));
 assert.deepEqual(sheet.map(row=>keys.map(key=>row[key])).sort(),report.rows.map(row=>keys.map(key=>row[key])).sort());assert.equal(sheet.find(row=>row.request===f.request.id).title,'=1+1');
 const downloads=await h.send('/api/purse/saved-reports/'+definition.id+'/csv',undefined,f.finance);assert.equal(Buffer.from(csv.attachments[0].content,'base64').toString(),downloads.value);
 for(const value of [f.hidden.id,...Object.values(f.protectedValues),'Private original context']){assert.ok(!JSON.stringify(csvRecords).includes(value));assert.ok(!JSON.stringify(sheet).includes(value));}
 await tickReports(h,at);assert.equal(h.messages.slice(count).filter(message=>message.subject.startsWith('Saved report:')).length,2);
 const schedules=(await h.send('/api/purse/report-schedules',undefined,f.finance)).value.schedules;
 assert.equal(schedules.find(row=>row.id===weekly.id).next_at,'2040-02-07T10:15:00.000Z');assert.equal(schedules.find(row=>row.id===monthly.id).next_at,'2040-02-29T10:15:00.000Z');
 // Stop weekly, then narrow the recipient before the monthly report recomputes.
 assert.equal((await h.send('/api/purse/report-schedules',{id:weekly.id,remove:true},f.finance)).status,200);
 assert.equal((await h.send('/api/purse/report-keys/'+key.key.id+'/revoke',{},h.owner)).status,200);assert.equal((await feed(h,key)).status,401);
 const before=h.messages.filter(message=>message.subject.startsWith('Saved report:')).length;await tickReports(h,Date.parse('2040-02-29T10:15:00.000Z'));assert.equal(h.messages.filter(message=>message.subject.startsWith('Saved report:')).length,before+1);
 assert.equal((await h.send('/api/purse/report-schedules',{id:monthly.id,remove:true},f.finance)).status,200);

 // An uncertain network acknowledgment consumes this occurrence exactly once.
 const uncertain=await createReportSchedule(f,definition,recipient.id);
 f.reportMailUncertain(true);const edgeCount=h.messages.filter(message=>message.subject.startsWith('Saved report:')).length;
 await tickReports(h,at);await tickReports(h,at);
 assert.equal(h.messages.filter(message=>message.subject.startsWith('Saved report:')).length,edgeCount+1);
 assert.equal((await h.db.prepare('SELECT status FROM p_report_deliveries WHERE schedule=?').bind(uncertain.id).first()).status,'uncertain');
 f.reportMailUncertain(false);assert.equal((await h.send('/api/purse/report-schedules',{id:uncertain.id,remove:true},f.finance)).status,200);
 // A different member receives only their current records, even when the
 // private saved definition belongs to a member with a different scope.
 await h.member(reportMail(4202),['finance-viewer']);
 await f.cmd('member',{email:reportMail(4202),name:'Research recipient',active:true,grants:[{role:'finance-viewer',scope:{departments:['Research']}}]});
 const other=(await h.send('/api/purse/report-schedules',undefined,f.finance)).value.recipients.find(row=>row.email===reportMail(4202));
 const scopedSchedule=await createReportSchedule(f,definition,other.id),beforeRecipient=h.messages.length;
 await tickReports(h,at);
 const received=h.messages.slice(beforeRecipient).find(message=>message.subject.startsWith('Saved report:')&&message.to.includes(reportMail(4202)));assert.ok(received);
 const recipientRows=parse(Buffer.from(received.attachments[0].content,'base64').toString(),{columns:true});
 assert.deepEqual(recipientRows.filter(row=>row.recordType==='Rows').map(row=>[row.request,Number(row.amountMinor)]),[[f.hidden.id,7000]]);
 await f.cmd('member',{email:reportMail(4202),name:'Revoked recipient',active:false,roles:['finance-viewer']});
 const prior=h.messages.filter(message=>message.subject.startsWith('Saved report:')).length;
 await tickReports(h,at+604800000);assert.equal(h.messages.filter(message=>message.subject.startsWith('Saved report:')).length,prior);
 assert.equal((await h.db.prepare('SELECT enabled FROM p_report_schedules WHERE id=?').bind(scopedSchedule.id).first()).enabled,0);
 assert.deepEqual((await h.db.prepare("SELECT value FROM p_records WHERE kind IN ('request','order','invoice','commitment') ORDER BY kind,id").all()).results,financialBefore,'Report reads and deliveries cannot change financial records');
 const audit=(await h.db.prepare("SELECT value FROM p_records WHERE kind='audit' AND json_extract(value,'$.action')='report-feed-read'").all()).results;assert.ok(audit.length>0);assert.ok(!JSON.stringify(audit).includes(key.token));
}
