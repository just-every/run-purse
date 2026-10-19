import { validateRfqs } from './restore-rfq.mjs';
import { validateInvoiceReadings } from './restore-invoice-reading.mjs';
import { validateQuoteReadings } from './restore-quote-reading.mjs';
import { validateReceiptRouting } from './restore-receipt-routing.mjs';
import { validateInvoiceRisk } from './restore-invoice-risk.mjs';
import { validateQuoteAwards } from './restore-quote-awards.mjs';
import { canonicalJson } from '@runeditrun/rer/internal/modules/portability/hash.mjs';
import { PortabilityError } from '@runeditrun/rer/modules/portability';
import { validatePoDocuments } from './restore-po-documents.mjs';
import { validatePayables } from './restore-payables.mjs';
import { validateOrderLinks } from './restore-order-links.mjs';
import { validateSupplierPerformance } from './restore-supplier-performance.mjs';
import { validateOrderChasing } from './restore-order-chasing.mjs';
import { validateSupplierDocuments } from './restore-supplier-documents.mjs';

const kinds = new Set(['business','member','supplier','supplierMatchingKey','supplierMerge','catalogue','catalogueBundle','catalogueGrant','policy','delegation','code','request','revision','decision','quote','order','receipt','invoice','attachment','commitment','agentRun','proposedAction','audit','stockroom','orderClosure','supplierOrderEvidence','supplierIssue','supplierDocument','supplierDocumentReminder','supplierDocumentSubmission','orderChasePolicy','orderChaseEvent','payable','cashExpectation','poProfile','quoteAward','receiptRule','receiptPromptEvent','quoteReading','quoteReadingEvent','invoiceSource','invoiceReading','invoiceReadingEvent','rfq','rfqResponse','rfqMailEvent']);
export const check = (value, code) => { if (!value) throw new PortabilityError('purse_' + code, 409); };
export const same = (a, b) => canonicalJson(a) === canonicalJson(b);
export const integer = n => Number.isSafeInteger(n) && n >= 0;
export const money = n => integer(n) && n <= 1e12;
export function quantity(value) {
 check(typeof value === 'string' && /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(value), 'quantity');
 const [whole, fraction = ''] = value.split('.'); const q = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
 check(q > 0, 'quantity'); return q;
}
export const amount = (q, unit) => Number((BigInt(q) * BigInt(unit) + 500n) / 1000n);
export function lineAmounts(r, quote = false) {
 check(Array.isArray(r.lines) && r.lines.length > 0 && new Set(r.lines.map(l => l.id)).size === r.lines.length, 'lines');
 for (const l of r.lines) {
  check(typeof l.id === 'string' && l.id.length && quantity(l.quantity) === l.q && money(l.unitMinor) && money(l.totalMinor), 'line_amount');
  check(l.totalMinor === amount(l.q,l.unitMinor), 'line_amount');
  check(integer(l.carriedAccepted ?? 0) && integer(l.carriedCancelled ?? 0) && (l.carriedAccepted ?? 0) + (l.carriedCancelled ?? 0) <= l.q, 'line_carry');
 }
 if (quote) { check((r.freightMinor === null || money(r.freightMinor)) && (r.taxMinor === null || money(r.taxMinor)), 'quote_amount'); return; }
 check(money(r.freightMinor) && money(r.taxMinor) && money(r.totalMinor), 'total');
 check(r.totalMinor === r.lines.reduce((n,l) => n + l.totalMinor,0) + r.freightMinor + r.taxMinor, 'total');
}
const purchaseFields = ['supplier','supplierSnapshot','currency','needDate','lines','freightMinor','taxMinor','totalMinor','terms','poDetails'];
export const purchasing = r => Object.fromEntries(purchaseFields.filter(k=>k!=='poDetails'||Object.hasOwn(r,k)).map(k => [k,r[k]]));

// Generic JSON rows have no SQL foreign keys. Validate the complete staged graph
// read-only before Base writes any destination records or objects.
export function validatePurchasingArchive(rows) {
 const records = new Map();
 for (const row of rows) {
  let value; try { value = JSON.parse(row.value); } catch { check(false,'record_json'); }
  check(row.business === 'main' && kinds.has(row.kind) && value?.id === row.id && typeof row.revision === 'string' && row.revision.length, 'record');
  const key = JSON.stringify([row.kind,row.id]); check(!records.has(key),'duplicate_record'); records.set(key,value);
 }
 const get = (kind,id) => { const v = records.get(JSON.stringify([kind,id])); check(v,kind + '_link'); return v; };
 const all = kind => rows.filter(r => r.kind === kind).map(r => get(kind,r.id));
 if (!rows.length) return true;
 check(all('business').length === 1, 'business'); get('business','main');
 for (const kind of ['request','revision','order']) for (const r of all(kind)) {
  get('supplier',r.supplier); lineAmounts(r);
  if (!r.imported) {
   const identity = r.supplierSnapshot;
   check(identity?.id === r.supplier && typeof identity.name === 'string' && identity.name.trim().length && Array.isArray(identity.contacts) && typeof identity.contractRef === 'string', 'supplier_identity');
   check(identity.contacts.every(c => typeof c.name === 'string' && typeof c.email === 'string'),'supplier_contacts');
  }
  for (const l of r.lines) if (l.catalogue) get('catalogue',l.catalogue);
  if (r.imported) check(r.status === 'imported' && !r.issuedAt && r.policy === null, 'import_authority');
 }
 for (const r of all('request').filter(r => !r.imported)) {
  const snapshot = get('revision',r.id + ':' + r.revision);
  check(snapshot.request === r.id && same(purchasing(snapshot),purchasing(r)), 'request_revision');
  if (r.policy) get('policy',r.policy);
  if (r.amends) check(get('order',r.amends).request === r.id,'amendment_link');
 }
 for (const r of all('revision')) {
  const request = get('request',r.request);
  check(r.id === r.request + ':' + r.revision && Number.isSafeInteger(r.revision) && r.revision > 0 && r.revision <= request.revision, 'revision_link');
 }
 for (const d of all('decision')) {
  get('revision',d.request + ':' + d.revision); get('policy',d.policy);
  if (d.delegation) check(get('delegation',d.delegation).policy === d.policy,'decision_delegation');
 }
 for (const kind of ['catalogue','quote']) for (const r of all(kind)) { get('supplier',r.supplier); if (kind === 'quote') { get('revision',r.request + ':' + r.revision); lineAmounts(r,true); } }
 for (const supplier of all('supplier')) if (supplier.mergedInto) {
  const seen = new Set([supplier.id]); let target = get('supplier',supplier.mergedInto);
  while (target.mergedInto) { check(!seen.has(target.id),'supplier_merge_cycle'); seen.add(target.id); target = get('supplier',target.mergedInto); }
  check(!seen.has(target.id) && supplier.status === 'merged' && all('supplierMerge').some(m => m.source === supplier.id && m.target === supplier.mergedInto),'supplier_merge_alias');
 }
 for (const merge of all('supplierMerge')) { check(get('supplier',merge.source).mergedInto === merge.target,'supplier_merge_link');get('supplier',merge.target);check(typeof merge.reason === 'string' && merge.reason.trim() && typeof merge.actor === 'string' && Number.isFinite(Date.parse(merge.at)),'supplier_merge'); }
 for (const matchingKey of all('supplierMatchingKey')) check(matchingKey.id === 'main' && /^[a-f0-9]{64}$/.test(matchingKey.secret), 'supplier_matching_key');
 for (const supplier of all('supplier')) if (supplier.matching && Object.keys(supplier.matching).length) { get('supplierMatchingKey','main'); check(Object.entries(supplier.matching).every(([k,v]) => ['tin','bank'].includes(k) && typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)), 'supplier_matching'); }
 for (const grant of all('catalogueGrant')) check(get('member',grant.email).email === grant.email && grant.id === grant.email, 'catalogue_grant');
 for (const record of [...all('catalogue'),...all('catalogueBundle')]) if (record.access) for (const field of ['departments','locations','entities','roles']) check(Array.isArray(record.access[field]) && record.access[field].every(v => typeof v === 'string'), 'catalogue_access');
 for (const bundle of all('catalogueBundle')) {
  check(Array.isArray(bundle.items) && bundle.items.length > 0 && bundle.items.length <= 100 && new Set(bundle.items.map(i => i.catalogue)).size === bundle.items.length, 'catalogue_bundle');
  for (const item of bundle.items) { get('catalogue',item.catalogue); quantity(item.quantity); }
 }
 for (const d of all('delegation')) get('policy',d.policy);
 for (const e of all('commitment')) { get('revision',e.request + ':' + e.revision); get('policy',e.policy); check(Number.isSafeInteger(e.amountMinor),'commitment_amount'); }
 for (const a of all('attachment')) {
  check(a.privateSupplierDocument === undefined || typeof a.privateSupplierDocument === 'boolean' && (!a.privateSupplierDocument || a.kind === 'supplier'),'supplier_document_private');
  check(['request','supplier','order','invoice','invoiceSource'].includes(a.kind),'attachment_kind'); get(a.kind,a.record);
  check(all('audit').some(e => e.action === 'attachment' && e.attachment === a.id && e.record === a.record),'attachment_link');
  check(typeof a.base64 === 'string','attachment_bytes');
  let bytes; try { bytes = atob(a.base64); } catch { check(false,'attachment_bytes'); }
  check(bytes.length === a.size && a.size <= 1000000,'attachment_size');
 }
 for (const r of all('agentRun')) for (const ref of r.references) get(ref.kind,ref.id);
 for (const p of all('proposedAction')) { get('agentRun',p.run); for (const ref of p.references) get(ref.kind,ref.id); }
 for (const stock of all('stockroom')) {
  get('catalogue',stock.catalogue);
  if (stock.request) get('request',stock.request);
  check(quantity(stock.reorderPoint) === stock.reorderPointQ && quantity(stock.replenishTo) === stock.replenishToQ && stock.replenishToQ >= stock.reorderPointQ,'stockroom_quantity');
  check(stock.count === null ? stock.countQ === null : typeof stock.count === 'string' && (stock.count === '0' ? stock.countQ === 0 : quantity(stock.count) === stock.countQ),'stockroom_count');
 }
 validateRfqs(all,get,check);
 validateInvoiceReadings(all,get,check);
 validateQuoteReadings(all,get,check);
 validateReceiptRouting(all,get,check);
 validateInvoiceRisk(all,get,check); validateQuoteAwards(all,get,check); validatePayables(all,get,check); validateOrderLinks({get,all}); validateSupplierPerformance({get,all}); validateSupplierDocuments(all,get,check); validatePoDocuments(all,get); validateOrderChasing(all,get,check); return true;
}
