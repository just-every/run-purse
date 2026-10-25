import { createHash } from 'node:crypto';
import type { Bindings } from '../auth.server';
import { protectedRows } from './protected-crypto';
import { canonicalSupplier } from './supplier-identity';
import { erasedText, erasureDigest } from './erasure-journal.mjs';
import { retainedEvidence } from './invoice-evidence-crypto.mjs';
import { diffValue } from './erasure-diff';
import { all, get, put, requireThat, type Data, type State } from './types';

export const retentionDefaultYears = 7, retentionMinimumYears = 1, retentionMaximumYears = 99;
export const retentionWarning = 'IRS Pub. 583 suggests keeping records that support tax returns at least seven years; a shorter period is the owner’s own decision.';
const fieldLabel: Record<string, string> = { tin: 'Tax identification number', bankAccount: 'Bank account number', bankRouting: 'Bank routing number' };
export type Ready = { id: string; kind: 'protected' | 'original'; supplier: string; supplierName: string; label: string; latestPayable: string; eligibleOn: string; field?: string; attachment?: string };

export const retentionYears = (state: State): number => state.get('erasureRetention:main')?.value.years ?? retentionDefaultYears;
export function setRetention(state: State, years: unknown, warningAcknowledged: unknown, actorId: string) {
 requireThat(Number.isSafeInteger(years) && (years as number) >= retentionMinimumYears && (years as number) <= retentionMaximumYears, `Retention is whole years from ${retentionMinimumYears} to ${retentionMaximumYears}`);
 requireThat((years as number) >= retentionDefaultYears || warningAcknowledged === true, 'Acknowledge the IRS Pub. 583 warning to keep records for fewer than seven years');
 put(state, 'erasureRetention', 'main', { years, warningAcknowledged: (years as number) < retentionDefaultYears, actor: actorId, at: new Date().toISOString() });
}
/** The clock runs from the supplier's latest supported payable: the newest invoice date entered against one of its orders. */
function latestPayables(state: State): Map<string, string> {
 const latest = new Map<string, string>();
 for (const invoice of all(state, 'invoice')) {
  const order = state.get('order:' + invoice.order)?.value, date = String(invoice.invoiceDate ?? '').slice(0, 10);
  if (!order || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
  const supplier = canonicalSupplier(state, order.supplier);
  if (!latest.has(supplier) || latest.get(supplier)! < date) latest.set(supplier, date);
 }
 return latest;
}
const addYears = (date: string, years: number) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + years); return d.toISOString().slice(0, 10); };
export async function retentionStatus(env: Bindings, state: State, today = new Date().toISOString().slice(0, 10)) {
 const years = retentionYears(state), payables = latestPayables(state), held: Ready[] = [], waiting: Ready[] = [], noClock: string[] = [];
 const consider = (item: Omit<Ready, 'latestPayable' | 'eligibleOn'>) => {
  const latest = payables.get(canonicalSupplier(state, item.supplier));
  if (!latest) { noClock.push(item.label + ' · ' + item.supplierName); return; }
  const entry = { ...item, latestPayable: latest, eligibleOn: addYears(latest, years) };
  (entry.eligibleOn <= today ? held : waiting).push(entry);
 };
 for (const row of await protectedRows(env)) {
  const supplier = state.get('supplier:' + row.supplier)?.value;
  if (supplier) consider({ id: `protected:${row.supplier}:${row.field}`, kind: 'protected', supplier: row.supplier, supplierName: supplier.name, label: fieldLabel[row.field], field: row.field });
 }
 const taxOriginals = new Set<string>();
 for (const document of all(state, 'supplierDocument')) if (document.type === 'w9') for (const entry of [document, ...(document.history ?? [])]) if (entry.attachment) taxOriginals.add(document.supplier + ':' + entry.attachment);
 for (const key of taxOriginals) {
  const [supplierId, attachmentId] = key.split(':'), file = state.get('attachment:' + attachmentId)?.value, supplier = state.get('supplier:' + supplierId)?.value;
  if (file && supplier && !file.erasure && file.base64) consider({ id: 'original:' + attachmentId, kind: 'original', supplier: supplierId, supplierName: supplier.name, label: 'W-9 original file', attachment: attachmentId });
 }
 const sort = (a: Ready, b: Ready) => a.id.localeCompare(b.id);
 return { years, minimum: retentionMinimumYears, default: retentionDefaultYears, warning: years < retentionDefaultYears ? retentionWarning : null, custom: state.has('erasureRetention:main'), ready: held.sort(sort), waiting: waiting.sort(sort), noClock: noClock.sort() };
}
export type RetentionPlan = { state: State; fields: Data[]; ready: Ready[]; protectedValues: { supplier: string; field: string }[]; invoices: Data[]; id: string; fingerprint: string };
/** Remove only the chosen expired values: records, totals, hashes and attestations stay. */
export function planRetentionErasure(before: State, ready: Ready[], id: string, revision: number): RetentionPlan {
 requireThat(/^[a-f0-9-]{36}$/.test(id), 'Review identifier invalid');
 const state = structuredClone(before), protectedValues: { supplier: string; field: string }[] = [], erasedBank = new Set<string>();
 for (const item of ready) {
  if (item.kind === 'protected') {
   const supplier = get(state, 'supplier', item.supplier), { [item.field!.startsWith('bank') ? 'bank' : 'tin']: _fingerprint, ...matching } = supplier.matching ?? {};
   put(state, 'supplier', supplier.id, { ...supplier, matching, protectedOnFile: { ...supplier.protectedOnFile, [item.field!]: false }, protectedErasure: { ...supplier.protectedErasure, [item.field!]: id } });
   protectedValues.push({ supplier: item.supplier, field: item.field! });
   if (item.field!.startsWith('bank')) erasedBank.add(item.supplier);
  } else {
   const file = get(state, 'attachment', item.attachment!);
   put(state, 'attachment', file.id, { ...file, name: erasedText, erasure: id, sha256: file.sha256 ?? createHash('sha256').update(Buffer.from(file.base64, 'base64')).digest('hex'), base64: '' });
  }
 }
 // An invoice whose evidence hash binds an erased bank value keeps hash, state and attestation, and says so.
 const invoices: Data[] = [];
 for (const invoice of all(state, 'invoice')) {
  const order = state.get('order:' + invoice.order)?.value;
  if (!order || !invoice.evidenceHash || !invoice.evidence?.bankBinding || !erasedBank.has(canonicalSupplier(state, order.supplier))) continue;
  put(state, 'invoice', invoice.id, { ...invoice, sourceValuesErased: id });
  invoices.push({ id: invoice.id, hash: invoice.evidenceHash, evidence: erasureDigest(invoice.evidence), retained: erasureDigest(retainedEvidence(invoice)) });
 }
 const fields: Data[] = [];
 for (const [key, row] of before) { const next = state.get(key); if (next && JSON.stringify(next.value) !== JSON.stringify(row.value)) diffValue(row.value, next.value, [], row.kind, row.id, fields); }
 return { state, fields, ready, protectedValues, invoices, id, fingerprint: erasureDigest({ revision, id, subject: 'retention', items: ready.map(r => r.id).sort(), fields }) };
}
