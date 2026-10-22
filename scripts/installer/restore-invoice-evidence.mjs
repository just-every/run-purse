import { erasedInvoiceEvidence } from '../../src/purse/erasure-journal.mjs';
import { attestation, digest, retainedEvidence, v2Hash } from '../../src/purse/invoice-evidence-crypto.mjs';
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const states=['attested-at-migration','unavailable-source','did-not-verify','verified-by-reentry'];
export function validateInvoiceEvidence(all,check) {
 const keys=all('invoiceEvidenceKey');
 check(keys.length<=1&&keys.every(k=>k.id==='main'&&hex(k.secret)),'invoice_evidence_key');
 for(const invoice of all('invoice')) {
  const fail=(value,code)=>check(value,code+':'+invoice.id);
  for(const name of Object.keys(invoice))fail(!/^(?:bank|tin|routing|account|remitBank|remitFingerprint|bankFingerprint|lastFour|suffix)/i.test(name),'invoice_evidence_sensitive');
  if(!invoice.evidenceHash)continue;
  fail(hex(invoice.evidenceHash),'invoice_evidence_digest');
  const e=invoice.evidence;
  const erased=erasedInvoiceEvidence(all,invoice);
  if(invoice.sourceValuesErased)fail(erased,'invoice_erasure_journal');
  fail(e,'invoice_evidence_unmigrated');
  fail(keys.length===1,'invoice_evidence_key');
  if(e.representation==='v2'){
   fail(e.state==='v2'&&Object.keys(e).every(k=>['representation','state','bankBinding'].includes(k))&&(e.bankBinding===null||hex(e.bankBinding)),'invoice_evidence_state');
   fail((erased||v2Hash(keys[0].secret,invoice,e.bankBinding)===invoice.evidenceHash),'invoice_evidence_unverified');
  }else{
   fail(Object.keys(e).every(k=>['representation','state','event','actor','at','retainedDigest','attestation','importNote'].includes(k))&&(!e.importNote||e.state==='unavailable-source'&&e.importNote==='not checked at import'),'invoice_evidence_state');
   fail(e.representation==='legacy-root-v1'&&states.includes(e.state)&&typeof e.actor==='string'&&Number.isFinite(Date.parse(e.at))&&typeof e.event==='string','invoice_evidence_state');
   fail(hex(e.retainedDigest)&&(erased||e.retainedDigest===digest(retainedEvidence(invoice))),'invoice_evidence_lineage');
   fail(hex(e.attestation)&&(erased||attestation(keys[0].secret,invoice)===e.attestation),'invoice_evidence_lineage');
   const event=all('audit').find(a=>a.id===e.event);
   if(e.state==='verified-by-reentry')fail(event?.action==='invoice-evidence-reentry'&&event.record===invoice.id&&event.actor===e.actor&&event.at===e.at&&event.result===e.state,'invoice_evidence_state');
   else fail(all('invoiceEvidenceMigration').some(m=>m.id===e.event&&m.at===e.at&&m.actor===e.actor&&m.invoices?.[e.state]?.includes(invoice.id)),'invoice_evidence_state');
  }
 }
}
