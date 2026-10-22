import { createHash, createHmac } from 'node:crypto';
export const erasedText = 'Personal data erased';
export const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}' : JSON.stringify(value);
export const erasureDigest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const erasureSeal = (secret,value) => createHmac('sha256',Buffer.from(secret,'hex')).update('purse-erasure:v1:'+canonical(value)).digest('hex');
export const receiptPayload = ({seal,phase,...receipt}) => receipt;
export function pathValue(value,path) { for(const key of path) { if(value===null||value===undefined)return undefined;value=value[key]; } return value; }
export function erasedField(all,kind,id,path,value) {
 const secret=all('invoiceEvidenceKey').find(k=>k.id==='main')?.secret;
 return Boolean(secret && all('erasureReceipt').some(receipt=>receipt.seal===erasureSeal(secret,receiptPayload(receipt)) && receipt.fields.some(field=>field.kind===kind&&field.id===id&&canonical(field.path)===canonical(path)&&field.after===erasureDigest(value))));
}
export function erasedOriginal(all, attachment) {
 return Boolean(attachment.erasure && attachment.base64==='' && erasedField(all,'attachment',attachment.id,['base64'],''));
}
export function originalDigest(all,attachment) {
 return erasedOriginal(all,attachment) ? attachment.sha256 : createHash('sha256').update(Buffer.from(attachment.base64,'base64')).digest('hex');
}
export function erasedInvoiceEvidence(all,invoice) {
 const secret=all('invoiceEvidenceKey').find(k=>k.id==='main')?.secret;
 return Boolean(secret&&invoice.sourceValuesErased&&all('erasureReceipt').some(receipt=>receipt.id===invoice.sourceValuesErased&&receipt.seal===erasureSeal(secret,receiptPayload(receipt))&&receipt.invoices?.some(entry=>entry.id===invoice.id&&entry.hash===invoice.evidenceHash&&entry.evidence===erasureDigest(invoice.evidence)&&entry.retained===erasureDigest({invoiceDate:invoice.invoiceDateSource==='supplied'?invoice.invoiceDate:null,sender:invoice.sender?.email??null,document:invoice.document??null,...(invoice.remitPostal?{remitTo:invoice.remitPostal.value}:{})}))));
}
export function erasedSourceFact(all,kind,id,value) {
 const secret=all('invoiceEvidenceKey').find(k=>k.id==='main')?.secret;
 return Boolean(secret&&all('erasureReceipt').some(r=>r.seal===erasureSeal(secret,receiptPayload(r))&&r.sourceFacts?.some(f=>f.kind===kind&&f.id===id&&f.digest===erasureDigest(value))));
}
