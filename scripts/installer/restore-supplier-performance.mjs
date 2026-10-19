import { check, same } from './restore-validation.mjs';

export function validateSupplierPerformance({get,all}) {
 const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
 const issued = (id,supplier) => { const order=get('order',id);check(!order.imported && order.issuedAt && order.supplier===supplier,'supplier_performance_order');return order; };
 for (const e of all('supplierOrderEvidence')) {
  const order=issued(e.order,e.supplier);get('supplier',e.supplier);
  check(e.id===e.order && Number.isSafeInteger(e.version) && e.version>0 && Array.isArray(e.history) && e.history.length===e.version,'supplier_evidence_history');
  for (const [i,h] of e.history.entries()) {
   check(h.version===i+1 && /^\d{4}-\d{2}-\d{2}$/.test(h.promisedDate) && new Date(h.promisedDate).toISOString().slice(0,10)===h.promisedDate && timestamp(h.at) && typeof h.source==='string' && h.source.trim() && typeof h.actor==='string','supplier_evidence');
   check(h.acknowledgedAt===null || timestamp(h.acknowledgedAt) && Date.parse(h.acknowledgedAt)>=Date.parse(order.issuedAt) && Date.parse(h.acknowledgedAt)<=Date.parse(h.at),'supplier_acknowledgment');
  }
  const latest=Object.fromEntries(Object.keys(e.history.at(-1)).map(k=>[k,e[k]]));
  check(same(latest,e.history.at(-1)),'supplier_evidence_current');
 }
 for (const i of all('supplierIssue')) {
  issued(i.order,i.supplier);get('supplier',i.supplier);
  check(['late','damaged','wrong-item','billing'].includes(i.category) && typeof i.description==='string' && i.description.trim() && timestamp(i.at) && typeof i.actor==='string','supplier_issue');
  check(['open','resolved'].includes(i.status) && (i.status==='open' ? !i.resolution : typeof i.resolution?.reason==='string' && i.resolution.reason.trim() && typeof i.resolution.actor==='string' && timestamp(i.resolution.at)),'supplier_issue_resolution');
 }
}
