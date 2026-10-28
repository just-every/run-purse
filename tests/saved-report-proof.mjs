import assert from 'node:assert/strict';
import {parse} from 'csv-parse/sync';
import readXlsx from 'read-excel-file/node';
export const expectedTotals=[{currency:'CAD',reservedMinor:5003,committedMinor:0,actualMinor:0},{currency:'USD',reservedMinor:3000,committedMinor:6001,actualMinor:4000}];
export function assertNativeReport(report,f) {
 assert.deepEqual(report.totals,expectedTotals);
 assert.deepEqual(report.rows.map(row=>[row.request,row.kind,row.glAccount,row.currency,row.amountMinor]).sort(),[
  [f.request.id,'committed','6200','USD',3601],[f.request.id,'committed','6300','USD',2400],
  [f.request.id,'actual','6200','USD',2400],[f.request.id,'actual','6300','USD',1600],
  [f.reserved.id,'reserved','6400','USD',3000],[f.cad.id,'reserved','6400','CAD',5003],
 ].sort());
 assert.ok(!JSON.stringify(report).includes(f.hidden.id));
 for(const value of Object.values(f.protectedValues))assert.ok(!JSON.stringify(report).includes(value));
}
export async function assertDownloads(csv,xlsx,report,f) {
 const records=parse(csv,{columns:true}),sources=records.filter(row=>row.recordType==='Rows');
 assert.equal(sources.length,6);
 const keys=['request','kind','glAccount','currency','amountMinor'];
 assert.deepEqual(sources.map(row=>keys.map(key=>String(row[key]))).sort(),report.rows.map(row=>keys.map(key=>String(row[key]))).sort());
 assert.deepEqual(records.filter(row=>row.recordType==='Totals').map(row=>({currency:row.currency,reservedMinor:Number(row.reservedMinor),committedMinor:Number(row.committedMinor),actualMinor:Number(row.actualMinor)})),expectedTotals);
 const sheets={};for(const name of ['Rows','Groups','Totals']){const [headers,...rows]=await readXlsx(Buffer.from(xlsx),{sheet:name});sheets[name]=rows.map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]])));}
 assert.deepEqual(sheets.Rows.map(row=>keys.map(key=>String(row[key]))).sort(),report.rows.map(row=>keys.map(key=>String(row[key]))).sort());
 assert.deepEqual(sheets.Totals,expectedTotals);
 const groups=report.groups.map(group=>[report.groupBy,group.label??null,group.currency,group.reservedMinor,group.committedMinor,group.actualMinor]);
 const groupKeys=['groupBy','group','currency','reservedMinor','committedMinor','actualMinor'];
 assert.deepEqual(sheets.Groups.map(row=>groupKeys.map(key=>row[key])),groups);
 assert.deepEqual(records.filter(row=>row.recordType==='Groups').map(row=>groupKeys.map(key=>key.endsWith('Minor')?Number(row[key]):row[key])),groups.map(row=>row.map(value=>value??'')));
 const literal=sheets.Rows.find(row=>row.request===f.request.id);
 assert.equal(literal.title,'=1+1');assert.equal(literal.description,'+synthetic-purse-4109,"quoted"');assert.equal(literal.supplierName,'@synthetic-purse-4104');assert.equal(literal['line:'+f.form.id+':grant'],'-synthetic-purse-4110');
 const escaped=sources.find(row=>row.request===f.request.id);assert.equal(escaped.title,"'=1+1");assert.equal(escaped.description,"'+synthetic-purse-4109,\"quoted\"");assert.equal(escaped.supplierName,"'@synthetic-purse-4104");assert.equal(escaped['line:'+f.form.id+':grant'],"'-synthetic-purse-4110");
 for(const value of [f.hidden.id,...Object.values(f.protectedValues),'Private original context','bankAccount','protectedData']) {assert.ok(!csv.includes(value));assert.ok(!JSON.stringify(sheets).includes(value));}
 return sheets;
}
