import { check, same, integer, money, quantity, amount, purchasing } from './restore-validation.mjs';
import { validateConversionVariance, validateSupplierGroups } from './restore-conversion-variance.mjs';

export function validateOrderLinks({get,all}) {
 const orders = all('order'), receipts = all('receipt'), closures = all('orderClosure');
 for (const c of closures) {
  const o=get('order',c.order); check(o.issuedAt && !o.imported && typeof c.active === 'boolean' && typeof c.reason === 'string' && c.reason.trim().length,'closure_order');
  check(Array.isArray(c.lines) && c.lines.length > 0 && new Set(c.lines.map(l=>l.line)).size === c.lines.length,'closure_lines');
  for (const l of c.lines) check(o.lines.some(x=>x.id===l.line) && integer(l.q) && l.q>0,'closure_quantity');
 }
 const position = (o,l) => {
  const events = receipts.filter(e => e.order === o.id && e.line === l.id);
  return { accepted:(l.carriedAccepted ?? 0) + events.reduce((n,e) => n + (e.event === 'receive' ? e.q : e.event === 'return' ? -e.q : 0),0), cancelled:(l.carriedCancelled ?? 0) + events.filter(e => e.event === 'cancel').reduce((n,e) => n + e.q,0) };
 };
 for (const o of orders) {
  const request = get('request',o.request);
  if (o.imported) { check((o.adoption ? request.adoption === o.adoption : request.imported) && !Object.hasOwn(o,'conversionVariance'),'import_order_link'); continue; }
  const revision = get('revision',o.request + ':' + o.revision);
  const clean = {...o,lines:o.lines.map(({sourceLine,...l}) => l)};
  check(o.lines.every(l => l.sourceLine === l.id),'order_revision');
  if(o.supplierGroup)validateSupplierGroups(o,revision,all);
  if (Object.hasOwn(o,'conversionVariance')) validateConversionVariance(o,revision,all);
  else if(!o.supplierGroup) check(same(purchasing(clean),purchasing(revision)),'order_revision');
  get('policy',o.policy);
  check(all('decision').some(d => d.request === o.request && d.revision === o.revision && d.decision === 'approved' && d.policy === o.policy && d.actor === o.approvalActor && d.operatorVersion === o.approvalVersion),'order_approval');
  if (o.amendedBy) { const next=get('order',o.amendedBy); check(next.request === o.request && next.revision > o.revision && get('revision',next.request + ':' + next.revision).amends === o.id,'order_amendment'); }
  if (revision.amends) {
   const prior = get('order',revision.amends); check(prior.request === o.request && prior.revision < o.revision,'order_amendment');
   for (const old of prior.lines) { if(old.service)continue; const line=o.lines.find(l => l.id === old.id), carried=position(prior,old); check(line && line.carriedAccepted === carried.accepted && line.carriedCancelled === carried.cancelled,'order_carry'); }
  }
  for (const l of o.lines) { if(l.service)continue; const p=position(o,l), closed=closures.filter(c=>c.order===o.id&&c.active).flatMap(c=>c.lines).filter(c=>c.line===l.id).reduce((n,c)=>n+c.q,0); check(integer(p.accepted) && integer(p.cancelled) && p.accepted+p.cancelled+closed<=l.q,'receipt_position'); }
  if (o.replenishmentStatus) {
   check(['held','reviewed','cancelled'].includes(o.replenishmentStatus),'replenishment_status');
   check(money(o.replenishmentMinor) && (o.replenishmentStatus === 'held' ? o.replenishmentMinor > 0 && ['issued','amendment-pending'].includes(o.status) : o.replenishmentMinor === 0),'replenishment_amount');
  }
 }
 for (const r of receipts) {
  const o=get('order',r.order); check(o.lines.some(l => l.id === r.line),'receipt_line'); check(quantity(r.quantity) === r.q,'receipt_quantity');
  if (r.imported) check(o.imported && r.event === 'historical','import_receipt');
  else check((o.issuedAt || o.adoption) && ['receive','return','reject','cancel'].includes(r.event),'receipt_issue');
  if (r.replenishmentStatus) check(r.replenishmentStatus === 'held' && r.event !== 'receive' && money(r.replenishmentMinor) && r.replenishmentMinor > 0 && typeof r.replenishmentReason === 'string','return_exception');
 }
 const identities = new Set();
 for (const i of all('invoice')) {
  const o=get('order',i.order); check((o.issuedAt || o.adoption || o.imported && i.imported) && i.currency === o.currency,'invoice_order');
  const identity = JSON.stringify([o.supplier,i.reference]);
  check(typeof i.reference === 'string' && i.reference.trim() === i.reference && i.reference.length && i.supplier === o.supplier && !identities.has(identity),'invoice_identity');
  identities.add(identity);
  check(Array.isArray(i.allocations) && i.allocations.length > 0 && new Set(i.allocations.map(a=>a.line)).size===i.allocations.length,'invoice_allocations');
  for (const a of i.allocations) { const l=o.lines.find(l=>l.id===a.line); check(l && money(a.amountMinor) && (i.depositKind==='deposit' ? a.quantity==='0' && a.q===0 && a.orderedMinor===a.amountMinor : quantity(a.quantity)===a.q && (i.depositKind==='deposit-final' ? a.q===l.q && a.orderedMinor===a.amountMinor : a.orderedMinor===amount(a.q,l.unitMinor))),'invoice_line'); }
  const gross = i.allocations.reduce((n,a)=>n+a.amountMinor,0), credit = i.depositAppliedMinor ?? 0;
  check(money(credit) && credit <= gross && i.totalMinor === gross - credit && (!credit || i.grossMinor === gross),'invoice_total');
 }
}
