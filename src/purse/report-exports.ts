import { strToU8, zipSync } from 'fflate';
import type { Data } from './types';

type Cell = string | number;
export type ExportTable = { name: string; headers: string[]; rows: Cell[][] };
// Explicit columns exclude originals, contact details, protected values and authority.
const rowFields = ['request', 'revision', 'title', 'line', 'description', 'department', 'project', 'location', 'supplier', 'supplierName', 'category', 'glAccount', 'currency', 'kind', 'date', 'policy', 'order', 'number', 'invoice', 'reference', 'allocation', 'amountMinor'];
const metrics = ['reservedMinor', 'committedMinor', 'actualMinor'];
function tables(report: Data) {
    const fields = [...rowFields, ...report.customDimensions.map((field: Data) => field.value)];
    const cell = (value: unknown): Cell => typeof value === 'number' ? value : value == null ? '' : String(value);
    return [
        { name: 'Rows', headers: fields, rows: report.rows.map((row: Data) => fields.map(field => cell(row[field]))) as Cell[][] },
        { name: 'Groups', headers: ['groupBy', 'group', 'currency', ...metrics], rows: report.groups.map((group: Data) => [report.groupBy, cell(group.label), group.currency, ...metrics.map(metric => group[metric])]) as Cell[][] },
        { name: 'Totals', headers: ['currency', ...metrics], rows: report.totals.map((total: Data) => [total.currency, ...metrics.map(metric => total[metric])]) as Cell[][] },
    ];
}
export function csvCell(value: Cell) {
    // Quoting alone does not stop spreadsheet formulas. Only text is prefixed;
    // signed numeric amounts remain numeric and exact in minor units.
    const literal = typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? "'" + value : String(value);
    return '"' + literal.replaceAll('"', '""') + '"';
}
export function csvTables(sheets: ExportTable[]) {
    const headers = ['recordType', ...new Set(sheets.flatMap(sheet => sheet.headers))];
    return [headers, ...sheets.flatMap(sheet => sheet.rows.map(row => {
        const values = Object.fromEntries(sheet.headers.map((field, index) => [field, row[index]]));
        return headers.map(field => field === 'recordType' ? sheet.name : values[field] ?? '');
    }))].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
const xml = (value: Cell) => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const column = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : column(Math.floor(index / 26) - 1) + column(index % 26);
export function xlsxTables(sheets: ExportTable[]) {
    const files: Record<string, Uint8Array> = {};
    const add = (path: string, content: string) => { files[path] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + content); };
    add('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>');
    add('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    add('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((sheet, i) => '<sheet name="' + sheet.name + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>');
    add('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '</Relationships>');
    sheets.forEach((sheet, i) => add('xl/worksheets/sheet' + (i + 1) + '.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + [sheet.headers, ...sheet.rows].map((row, r) => '<row r="' + (r + 1) + '">' + row.map((value, c) => {
        const ref = column(c) + (r + 1);
        return typeof value === 'number' ? '<c r="' + ref + '"><v>' + value + '</v></c>' : '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
    }).join('') + '</row>').join('') + '</sheetData></worksheet>'));
    return zipSync(files);
}
export function reportExport(report: Data, format: string) {
    const content = format === 'csv' ? csvTables(tables(report)) : new Uint8Array(xlsxTables(tables(report))).buffer;
    return new Response(content, { headers: {
        'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="purse-report.' + format + '"',
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    } });
}
