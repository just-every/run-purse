import { csvCell, csvTables, xlsxTables, type ExportTable } from './report-exports';
import { requireThat, text, type Data } from './types';

const fields = ['order', 'number', 'line', 'description', 'supplier', 'supplierName', 'allocation', 'entity', 'department', 'location', 'class', 'project', 'glAccount', 'currency', 'unitMinor', 'mode', 'receivedQ', 'receivedMinor', 'billedQ', 'billedMinor', 'accrualMinor', 'effectiveDates', 'recordedDates', 'lateEntered', 'customFields', 'headerFields'];
const cell = (value: any): string | number => typeof value === 'number' ? value : value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
function tables(report: Data): ExportTable[] {
    const sources = [...new Map<string, Data>(report.rows.map((row: Data) => [row.order + ':' + row.line, row])).values()];
    return [
        {name: 'Rows', headers: fields, rows: report.rows.map((row: Data) => fields.map(key => cell(row[key])))},
        {name: 'Receipts', headers: ['order','line','receipt','event','effectiveDate','recordedDate','recordedAt','lateEntered','q','valueMinor','unitMinor','basis'], rows: sources.flatMap((row: Data) => row.receipts.map((source: Data) => [row.order,row.line,...['receipt','event','effectiveDate','recordedDate','recordedAt','lateEntered','q','valueMinor','unitMinor','basis'].map(key=>cell(source[key]))]))},
        {name: 'Bills', headers: ['order','line','invoice','reference','invoiceDate','approvalAt','q','amountMinor','eligible','reason'], rows: sources.flatMap((row: Data) => [...row.bills.map((bill: Data) => ({...bill,eligible:true})),...row.excludedBills.map((bill: Data) => ({...bill,eligible:false}))].map((bill: Data) => [row.order,row.line,...['invoice','reference','invoiceDate','approvalAt','q','amountMinor','eligible','reason'].map(key=>cell(bill[key]))]))},
        {name: 'Groups', headers: ['entity','department','location','class','project','glAccount','customFields','headerFields','currency','accrualMinor'], rows: report.groups.map((group: Data) => ['entity','department','location','class','project','glAccount','customFields','headerFields','currency','accrualMinor'].map(key=>cell(group[key])))},
        {name: 'Totals', headers: ['currency','accrualMinor'], rows: report.totals.map((total: Data) => [total.currency,total.accrualMinor])},
        {name: 'Deposits', headers: ['order','deposit','reference','currency','amountMinor','appliedMinor','unappliedMinor','basis'], rows: report.deposits.map((deposit: Data) => ['order','deposit','reference','currency','amountMinor','appliedMinor','unappliedMinor','basis'].map(key=>cell(deposit[key])))},
        {name: 'Completeness', headers: ['cutoff','warning'], rows: [report.limitations,...report.warnings].map(warning=>[report.cutoff,warning])},
    ];
}
const decimal = (minor: number) => (minor < 0 ? '-' : '') + Math.floor(Math.abs(minor) / 100) + '.' + String(Math.abs(minor) % 100).padStart(2, '0');
function xero(report: Data, input: Data) {
    const currency = text(input.currency, 'Choose one journal currency', 3), liability = text(input.liabilityAccount, 'Accrued liabilities account', 100);
    const groups = report.groups.filter((group: Data) => group.currency === currency && group.accrualMinor > 0);
    requireThat(groups.length, 'No accrual in the selected currency', 409);
    requireThat(groups.every((group: Data) => group.glAccount && (!group.entity || group.entity === 'main')), 'Xero file needs GL coding in the native entity; additional entities need qualified mappings', 409);
    requireThat(groups.every((group: Data) => group.glAccount !== liability), 'Expense and accrued liabilities accounts must differ');
    const headers = ['Narration','Date','Description','AccountCode','TaxRate','Amount','TrackingName1','TrackingOption1','TrackingName2','TrackingOption2'];
    const day = report.cutoff.split('-').reverse().join('/'), narration = 'Purse received not billed ' + report.cutoff + ' ' + currency;
    const rows = groups.flatMap((group: Data) => {
        const description = 'Received not billed · ' + JSON.stringify({project:group.project,class:group.class,customFields:group.customFields,headerFields:group.headerFields});
        return [
        [narration,day,description,group.glAccount,'No Tax',Number(decimal(group.accrualMinor)),'Department',group.department,'Location',group.location],
        [narration,day,'Accrued liabilities',liability,'No Tax',Number(decimal(-group.accrualMinor)),'Department',group.department,'Location',group.location],
    ]; });
    return [headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function accrualExport(report: Data, format: string, input: Data) {
    const content = format === 'xero' ? xero(report,input) : format === 'csv' ? csvTables(tables(report)) : new Uint8Array(xlsxTables(tables(report))).buffer;
    return new Response(content, {headers: {
        'content-type': format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="purse-accrual-' + report.cutoff + (format === 'xero' ? '-xero.csv' : '.' + format) + '"',
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    }});
}
