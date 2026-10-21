import { createHash, createHmac } from 'node:crypto';
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const mac = (secret, domain, value) => createHmac('sha256', Buffer.from(secret, 'hex')).update(domain + JSON.stringify(value)).digest('hex');
export function retainedEvidence(invoice) {
 return {invoiceDate:invoice.invoiceDateSource==='supplied'?invoice.invoiceDate:null,sender:invoice.sender?.email??null,document:invoice.document??null,...(invoice.remitPostal?{remitTo:invoice.remitPostal.value}:{})};
}
export function legacyHash(secret, invoice, bank) {
 const v=retainedEvidence(invoice);
 return mac(secret,'invoice-evidence:',{invoiceDate:v.invoiceDate,sender:v.sender,bank,document:v.document,...(Object.hasOwn(v,'remitTo')?{remitTo:v.remitTo}:{})});
}
export function v2Hash(secret, invoice, bankBinding=null) {
 return mac(secret,'invoice-evidence:v2:',{...retainedEvidence(invoice),bankBinding});
}
export function attestation(secret, invoice) {
 const e=invoice.evidence;
 return mac(secret,'invoice-evidence-attestation:v1:',{invoice:invoice.id,legacyHash:invoice.evidenceHash,representation:'legacy-root-v1',retainedDigest:e.retainedDigest,state:e.state,event:e.event,actor:e.actor,at:e.at});
}
export function evidenceLabel(e) {
 if(!e)return 'Legacy evidence not migrated – not verified.';
 if(e.state==='attested-at-migration')return `Checked at migration on ${e.at} from retained records. Later checks verify this migration record, not the original submission.`;
 if(e.state==='unavailable-source')return 'Original bank input not retained – legacy evidence not verified.';
 if(e.state==='did-not-verify')return 'Legacy evidence did not verify.';
 if(e.state==='verified-by-reentry')return `Verified by owner re-entry on ${e.at}. Later checks verify this re-entry record.`;
 return 'Retained invoice evidence verified. Bank comparison is not bank verification.';
}
export function classifyLegacyEvidence(root,invoice,baseline) {
 const bank=invoice.remit?.supplied?baseline??null:null;
 const checked=(!invoice.remit?.supplied||bank)&&legacyHash(root,invoice,bank)===invoice.evidenceHash;
 return checked?'attested-at-migration':invoice.remit?.supplied?'unavailable-source':'did-not-verify';
}
