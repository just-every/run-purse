import { invoiceHeaders, invoiceItems, invoiceOptionalHeaders } from './invoice-reading-fields';
import { missingField } from './quote-reading-fields';
import { requireThat, uid, type Data } from './types';

type XmlNode = { name: string; local: string; attrs: Record<string, string>; children: XmlNode[]; text: string };
export const ublInvoiceNamespace = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';

const entity = (raw: string) => raw.replace(/&([^;]*);?/g, (match, name: string) => {
    requireThat(match.endsWith(';'), 'E-invoice XML has an unterminated character reference', 422);
    const named: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
    if (named[name]) return named[name];
    requireThat(/^#(x[0-9a-fA-F]{1,6}|[0-9]{1,7})$/.test(name), 'E-invoice XML uses an undeclared entity; only predefined and numeric references are read', 422);
    const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    requireThat(code > 0 && code <= 0x10ffff, 'E-invoice XML has an invalid character reference', 422);
    return String.fromCodePoint(code);
});

/** Element tree only: DTDs, entity declarations and external references are refused, nothing is fetched. */
export function parseXml(source: string): XmlNode {
    requireThat(!/<!DOCTYPE|<!ENTITY/i.test(source), 'E-invoice XML with a DTD or entity declaration is refused', 422);
    const root: XmlNode = { name: '#document', local: '#document', attrs: {}, children: [], text: '' }, stack = [root];
    let i = 0;
    while (i < source.length) {
        const open = source.indexOf('<', i);
        if (open < 0) { stack.at(-1)!.text += entity(source.slice(i)); break; }
        if (open > i) stack.at(-1)!.text += entity(source.slice(i, open));
        const skip = (start: string, end: string) => { if (!source.startsWith(start, open)) return false; const close = source.indexOf(end, open + start.length); requireThat(close >= 0, 'E-invoice XML is not well formed', 422); if (start === '<![CDATA[') stack.at(-1)!.text += source.slice(open + start.length, close); i = close + end.length; return true; };
        if (skip('<?', '?>') || skip('<!--', '-->') || skip('<![CDATA[', ']]>')) continue;
        requireThat(!source.startsWith('<!', open), 'E-invoice XML declarations are refused', 422);
        const tag = /^<(\/?)([A-Za-z_][\w.\-]*(?::[A-Za-z_][\w.\-]*)?)((?:\s+[A-Za-z_][\w.\-:]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/.exec(source.slice(open));
        requireThat(tag, 'E-invoice XML is not well formed', 422);
        const [whole, closing, name, attributes, empty] = tag!;
        i = open + whole.length;
        if (closing) { requireThat(!attributes && !empty && stack.length > 1 && stack.at(-1)!.name === name, 'E-invoice XML is not well formed', 422); stack.pop(); continue; }
        const attrs: Record<string, string> = {};
        for (const match of attributes.matchAll(/([A-Za-z_][\w.\-:]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[match[1]] = entity(match[2] ?? match[3] ?? '');
        const node: XmlNode = { name, local: name.split(':').at(-1)!, attrs, children: [], text: '' };
        stack.at(-1)!.children.push(node);
        if (!empty) stack.push(node);
    }
    requireThat(stack.length === 1 && root.children.length === 1, 'E-invoice XML is not well formed', 422);
    return root.children[0];
}

const kids = (node: XmlNode | undefined, local: string) => node?.children.filter(child => child.local === local) ?? [];
const at = (node: XmlNode | undefined, ...path: string[]) => path.reduce<XmlNode | undefined>((current, local) => kids(current, local)[0], node);
const textOf = (node?: XmlNode) => node?.text.trim() || null;

export function invoiceXmlKind(bytes: Uint8Array): 'ubl' | 'cxml' | null {
    let text: string; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
    const start = text.replace(/^﻿/, '').trimStart();
    if (!start.startsWith('<')) return null;
    const head = start.slice(0, 4000);
    if (/<([\w.-]+:)?Invoice[\s>]/.test(head) && head.includes(ublInvoiceNamespace)) return 'ubl';
    if (/<cXML[\s>]/.test(head)) return 'cxml';
    return null;
}

/** PDFs embedded in a UBL invoice, decoded from base64 exactly; nothing else is extracted. */
export function embeddedInvoicePdfs(bytes: Uint8Array): Data[] {
    if (invoiceXmlKind(bytes) !== 'ubl') return [];
    let root: XmlNode; try { root = parseXml(new TextDecoder().decode(bytes)); } catch { return []; }
    return kids(root, 'AdditionalDocumentReference').flatMap(reference => {
        const object = at(reference, 'Attachment', 'EmbeddedDocumentBinaryObject'), base64 = object?.text.replace(/\s+/g, '') ?? '';
        if (!object || object.attrs.mimeCode !== 'application/pdf' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64) || !base64) return [];
        return [{ name: object.attrs.filename || (textOf(at(reference, 'ID')) ?? 'embedded') + '.pdf', mediaType: 'application/pdf', path: 'cac:AdditionalDocumentReference/cac:Attachment/cbc:EmbeddedDocumentBinaryObject', bytes: Uint8Array.from(atob(base64), c => c.charCodeAt(0)) }];
    });
}

const methods = { ubl: 'UBL 2.1 XML element', cxml: 'cXML InvoiceDetailRequest element' };
function field(kind: 'ubl' | 'cxml', attachment: string, value: string | null | undefined, path: string): Data {
    if (value === null || value === undefined || !value.trim()) return missingField();
    requireThat(value.length <= 2000, 'E-invoice XML field exceeds 2,000 characters', 422);
    return { value: value.trim(), confidence: 1, source: { attachment, page: 1, path, excerpt: value.trim().slice(0, 200), method: methods[kind] } };
}
const date = (value: string | null) => value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
const lineLink = (order: Data, poNumber: string | null, lineNumber: string | null) => poNumber === order.number && lineNumber && /^\d+$/.test(lineNumber) ? order.lines[Number(lineNumber) - 1]?.id ?? null : null;
const postal = (name: string | null, street: string | null, city: string | null, region: string | null, zip: string | null) => name && street && city ? `${name}, ${street}, ${city}${region ? ' ' + region : ''}${zip ? ' ' + zip : ''}` : null;

function ubl(root: XmlNode, attachment: string, order: Data): Data {
    const f = (value: string | null | undefined, path: string) => field('ubl', attachment, value, path);
    const supplierParty = at(root, 'AccountingSupplierParty', 'Party'), address = at(supplierParty, 'PostalAddress');
    const supplier = textOf(at(supplierParty, 'PartyLegalEntity', 'RegistrationName')) ?? textOf(at(supplierParty, 'PartyName', 'Name'));
    const totals = at(root, 'LegalMonetaryTotal'), poNumber = textOf(at(root, 'OrderReference', 'ID'));
    const tax = kids(root, 'TaxTotal').map(total => at(total, 'TaxAmount')).find(amount => amount && amount.attrs.currencyID === textOf(at(root, 'DocumentCurrencyCode')));
    const result: Data = { supplier: f(supplier, 'cac:AccountingSupplierParty/cac:Party'), reference: f(textOf(at(root, 'ID')), 'cbc:ID'), invoiceDate: f(textOf(at(root, 'IssueDate')), 'cbc:IssueDate'),
        dueDate: f(textOf(at(root, 'DueDate')) ?? textOf(at(root, 'PaymentMeans', 'PaymentDueDate')), 'cbc:DueDate'), terms: f(textOf(at(root, 'PaymentTerms', 'Note')), 'cac:PaymentTerms/cbc:Note'),
        poNumber: f(poNumber, 'cac:OrderReference/cbc:ID'), currency: f(textOf(at(root, 'DocumentCurrencyCode')), 'cbc:DocumentCurrencyCode'), senderEmail: missingField(),
        remitTo: f(postal(supplier, textOf(at(address, 'StreetName')), textOf(at(address, 'CityName')), textOf(at(address, 'CountrySubentity')), textOf(at(address, 'PostalZone'))), 'cac:AccountingSupplierParty/cac:Party/cac:PostalAddress'),
        subtotalAmount: f(textOf(at(totals, 'LineExtensionAmount')), 'cac:LegalMonetaryTotal/cbc:LineExtensionAmount'), freightAmount: f(textOf(at(totals, 'ChargeTotalAmount')), 'cac:LegalMonetaryTotal/cbc:ChargeTotalAmount'),
        taxAmount: f(textOf(tax), 'cac:TaxTotal/cbc:TaxAmount'), totalAmount: f(textOf(at(totals, 'PayableAmount')), 'cac:LegalMonetaryTotal/cbc:PayableAmount') };
    result.lines = kids(root, 'InvoiceLine').map((line, index) => {
        const path = `cac:InvoiceLine[${index + 1}]`, item = at(line, 'Item'), reference = textOf(at(line, 'OrderLineReference', 'LineID'));
        return { id: uid(), description: f(textOf(at(item, 'Name')) ?? textOf(at(item, 'Description')), path + '/cac:Item/cbc:Name'), quantity: f(textOf(at(line, 'InvoicedQuantity')), path + '/cbc:InvoicedQuantity'),
            unitAmount: f(textOf(at(line, 'Price', 'PriceAmount')), path + '/cac:Price/cbc:PriceAmount'), amount: f(textOf(at(line, 'LineExtensionAmount')), path + '/cbc:LineExtensionAmount'),
            orderLineNumber: reference, orderLine: lineLink(order, poNumber, reference) };
    });
    return result;
}

function cxml(root: XmlNode, attachment: string, order: Data): Data {
    const f = (value: string | null | undefined, path: string) => field('cxml', attachment, value, path);
    const request = at(root, 'Request', 'InvoiceDetailRequest'), header = at(request, 'InvoiceDetailRequestHeader');
    requireThat(request && header, 'cXML document is not an InvoiceDetailRequest', 422);
    const contact = (role: string) => kids(header, 'InvoicePartner').map(partner => at(partner, 'Contact')).find(c => c?.attrs.role === role);
    const from = contact('from') ?? contact('remitTo'), remit = contact('remitTo'), remitAddress = at(remit, 'PostalAddress');
    const detail = at(request, 'InvoiceDetailOrder'), poNumber = at(detail, 'InvoiceDetailOrderInfo', 'OrderReference')?.attrs.orderID ?? null;
    const summary = at(request, 'InvoiceDetailSummary'), money = (...path: string[]) => textOf(at(summary, ...path, 'Money'));
    const days = at(header, 'PaymentTerm')?.attrs.payInNumberOfDays;
    const result: Data = { supplier: f(textOf(at(from, 'Name')), 'InvoicePartner/Contact[@role="from"]/Name'), reference: f(header!.attrs.invoiceID, 'InvoiceDetailRequestHeader/@invoiceID'),
        invoiceDate: f(date(header!.attrs.invoiceDate ?? null), 'InvoiceDetailRequestHeader/@invoiceDate'), dueDate: missingField(), terms: f(days && /^\d+$/.test(days) ? 'Net ' + days : null, 'InvoiceDetailRequestHeader/PaymentTerm/@payInNumberOfDays'),
        poNumber: f(poNumber, 'InvoiceDetailOrderInfo/OrderReference/@orderID'), currency: f(at(summary, 'SubtotalAmount', 'Money')?.attrs.currency, 'InvoiceDetailSummary/SubtotalAmount/Money/@currency'), senderEmail: missingField(),
        remitTo: f(postal(textOf(at(remit, 'Name')), textOf(at(remitAddress, 'Street')), textOf(at(remitAddress, 'City')), textOf(at(remitAddress, 'State')), textOf(at(remitAddress, 'PostalCode'))), 'InvoicePartner/Contact[@role="remitTo"]/PostalAddress'),
        subtotalAmount: f(money('SubtotalAmount'), 'InvoiceDetailSummary/SubtotalAmount/Money'), freightAmount: f(money('ShippingAmount') ?? money('SpecialHandlingAmount'), 'InvoiceDetailSummary/ShippingAmount/Money'),
        taxAmount: f(money('Tax'), 'InvoiceDetailSummary/Tax/Money'), totalAmount: f(money('DueAmount') ?? money('NetAmount'), 'InvoiceDetailSummary/DueAmount/Money') };
    result.lines = kids(detail, 'InvoiceDetailItem').map((line, index) => {
        const path = `InvoiceDetailItem[${index + 1}]`, reference = at(line, 'InvoiceDetailItemReference');
        return { id: uid(), description: f(textOf(at(reference, 'Description')), path + '/InvoiceDetailItemReference/Description'), quantity: f(line.attrs.quantity, path + '/@quantity'),
            unitAmount: f(textOf(at(line, 'UnitPrice', 'Money')), path + '/UnitPrice/Money'), amount: f(textOf(at(line, 'SubtotalAmount', 'Money')), path + '/SubtotalAmount/Money'),
            orderLineNumber: reference?.attrs.lineNumber ?? null, orderLine: lineLink(order, poNumber, reference?.attrs.lineNumber ?? null) };
    });
    return result;
}

/** Structured fields exactly as the XML states them; no document reading and no inference. */
export function invoiceXmlFields(bytes: Uint8Array, attachment: string, order: Data): Data {
    const kind = invoiceXmlKind(bytes);
    requireThat(kind, 'Not a UBL 2.1 Invoice or cXML InvoiceDetailRequest', 422);
    const root = parseXml(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    requireThat(kind === 'ubl' ? root.local === 'Invoice' && root.attrs[root.name.includes(':') ? 'xmlns:' + root.name.split(':')[0] : 'xmlns'] === ublInvoiceNamespace : root.local === 'cXML', 'Unsupported e-invoice XML root', 422);
    const result = kind === 'ubl' ? ubl(root, attachment, order) : cxml(root, attachment, order);
    requireThat(result.lines.length > 0 && result.lines.length <= 100, 'E-invoice XML needs 1–100 invoice lines', 422);
    for (const key of invoiceHeaders) if(!invoiceOptionalHeaders.includes(key as typeof invoiceOptionalHeaders[number])) result[key] ??= missingField();
    for (const line of result.lines) for (const key of invoiceItems) line[key] ??= missingField();
    return { ...result, parser: kind === 'ubl' ? 'UBL 2.1 structured fields, no document reading' : 'cXML InvoiceDetailRequest structured fields, no document reading', format: kind };
}
