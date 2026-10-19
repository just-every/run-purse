import { createHash } from 'node:crypto';
export function validateInvoiceRisk(all,get,check) {
 const codes=new Set(['near-duplicate','duplicate-document','remit-baseline-missing','remit-mismatch','remit-details-changed','sender-domain','po-balance']);
 for(const invoice of all('invoice')){
  if(invoice.flags===undefined)continue;
  check(Array.isArray(invoice.flags)&&Array.isArray(invoice.riskReviews)&&Number.isSafeInteger(invoice.riskVersion)&&invoice.riskVersion>=1+invoice.riskReviews.length,'invoice_risk');
  check(/^\d{4}-\d{2}-\d{2}$/.test(invoice.invoiceDate)&&new Date(invoice.invoiceDate).toISOString().slice(0,10)===invoice.invoiceDate,'invoice_source_date');
  check(invoice.evidenceHash===null||/^[a-f0-9]{64}$/.test(invoice.evidenceHash),'invoice_evidence_digest');
  check(invoice.remit?.verified===false&&Object.keys(invoice.remit).every(k=>['supplied','baseline','comparison','verified'].includes(k)),'invoice_remit_safe');
  check(invoice.sender?.authentication==='unverified','invoice_sender');
  if(invoice.remitPostal)check(invoice.remitPostal.verified===false&&typeof invoice.remitPostal.value==='string'&&Object.keys(invoice.remitPostal).every(key=>['value','baseline','comparison','verified'].includes(key)),'invoice_postal_remit');
  const flags=new Map(invoice.flags.map(f=>[f.id,f]));check(flags.size===invoice.flags.length,'invoice_flag_unique');
  for(const flag of invoice.flags){check(typeof flag.id==='string'&&codes.has(flag.code)&&typeof flag.reason==='string'&&flag.reason.trim(),'invoice_flag');if(flag.relatedInvoice)get('invoice',flag.relatedInvoice);if(flag.documentHash)check(/^[a-f0-9]{64}$/.test(flag.documentHash),'invoice_document_digest');}
  check(new Set(invoice.riskReviews.map(r=>r.flag)).size===invoice.riskReviews.length,'invoice_review_unique');
  for(const review of invoice.riskReviews){check(flags.get(review.flag)?.code===review.code&&typeof review.reason==='string'&&review.reason.trim()&&typeof review.actor==='string'&&Number.isFinite(Date.parse(review.at)),'invoice_review');check(all('audit').some(e=>e.action==='invoice-risk-review'&&e.record===invoice.id&&e.flag===review.flag&&e.actor===review.actor&&e.reason===review.reason&&e.at===review.at),'invoice_review_audit');}
  if(invoice.document){const doc=invoice.document;check(/^[a-f0-9]{64}$/.test(doc.sha256)&&all('attachment').some(a=>a.kind==='invoice'&&a.record===invoice.id&&a.name===doc.name&&a.size===doc.size&&createHash('sha256').update(Buffer.from(a.base64,'base64')).digest('hex')===doc.sha256),'invoice_original');}
  for(const hash of invoice.documentHashes??[])check(/^[a-f0-9]{64}$/.test(hash)&&all('attachment').some(a=>a.kind==='invoice'&&a.record===invoice.id&&createHash('sha256').update(Buffer.from(a.base64,'base64')).digest('hex')===hash),'invoice_later_original');
 }
}
