import assert from 'node:assert/strict';
import { parse } from 'csv-parse/sync';
import readXlsxFile from 'read-excel-file/node';
export const mainRow = (report,order) => report.rows.find(row=>row.order===order.id && row.line===order.lines[0].id);
export async function assertAccrualDownloads(csv,xlsx,report) {
    const records=parse(csv,{columns:true}),rows=records.filter(row=>row.recordType==='Rows');
    assert.equal(rows.length,report.rows.length);
    for(const source of report.rows) {
        const exported=rows.find(row=>row.order===source.order&&row.line===source.line&&Number(row.allocation)===source.allocation);assert.ok(exported);
        for(const field of ['receivedQ','receivedMinor','billedQ','billedMinor','accrualMinor','unitMinor'])assert.equal(Number(exported[field]),source[field],field);
        assert.equal(exported.effectiveDates,source.effectiveDates);assert.equal(exported.recordedDates,source.recordedDates);
        assert.equal(exported.supplierName,source.supplierName.startsWith('=')?"'"+source.supplierName:source.supplierName);
    }
    const book=await readXlsxFile(xlsx,{sheet:'Rows'}),headers=book[0];assert.equal(book.length-1,report.rows.length);
    for(const currency of ['USD','CAD']) {
        const expected=report.rows.filter(row=>row.currency===currency).reduce((n,row)=>n+row.accrualMinor,0);
        const actual=rows.filter(row=>row.currency===currency).reduce((n,row)=>n+Number(row.accrualMinor),0);assert.equal(actual,expected);
        const workbookTotal=book.slice(1).filter(row=>row[headers.indexOf('currency')]===currency).reduce((n,row)=>n+row[headers.indexOf('accrualMinor')],0);assert.equal(workbookTotal,expected);
        if(report.totals.some(total=>total.currency===currency))assert.equal(report.totals.find(total=>total.currency===currency).accrualMinor,expected);
    }
    const receipts=await readXlsxFile(xlsx,{sheet:'Receipts'});assert.ok(receipts.length>1,'Export opens and includes receipt drill-through');
    assert.ok((await readXlsxFile(xlsx,{sheet:'Completeness'})).length>1,'Completeness travels with the file');
    for(const group of report.groups)assert.equal(group.accrualMinor,group.rows.reduce((n,row)=>n+row.accrualMinor,0));
}
