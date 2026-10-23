import { erasureSeal, erasureDigest, receiptPayload, pathValue, erasedOriginal } from '../../src/purse/erasure-journal.mjs';
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
/** Journals authorize only the exact redacted leaves and original withdrawals.
 * They never excuse broken monetary arithmetic, references or chronology. */
export function validateErasure(rows,check) {
 const records=rows.map(row=>({...row,data:JSON.parse(row.value)})),all=kind=>records.filter(r=>r.kind===kind).map(r=>r.data);
 const secret=all('invoiceEvidenceKey').find(k=>k.id==='main')?.secret,receipts=all('erasureReceipt'),latest=new Map();
 for(const receipt of [...receipts].sort((a,b)=>a.at.localeCompare(b.at))) {
  check(['member','contact'].includes(receipt.subject)&&receipt.anonymousReference==='erased-'+receipt.id&&Number.isFinite(Date.parse(receipt.at))&&typeof receipt.actor==='string'&&['blobs','complete'].includes(receipt.phase)&&Array.isArray(receipt.fields)&&Array.isArray(receipt.originals)&&Array.isArray(receipt.invoices),'erasure_receipt');
  check(secret&&receipt.seal===erasureSeal(secret,receiptPayload(receipt)),'erasure_seal');
  check(all('audit').some(e=>e.action==='personal-data-erasure'&&e.record===receipt.id&&e.actor===receipt.actor&&e.consent===true),'erasure_audit');
  for(const field of receipt.fields) {
   check(typeof field.kind==='string'&&typeof field.id==='string'&&Array.isArray(field.path)&&field.path.every(p=>typeof p==='string'||Number.isSafeInteger(p))&&hex(field.before)&&hex(field.after),'erasure_field');
   latest.set(JSON.stringify([field.kind,field.id,field.path]),field);
  }
 }
 // Enforce erased leaves even on mutable purchasing records. A later legitimate
 // edit must not put erased identity back; a later erasure supersedes its leaf.
 for(const field of latest.values()) {
  const row=records.find(r=>r.kind===field.kind&&r.id===field.id);
  check(row&&erasureDigest(pathValue(row.data,field.path)??null)===field.after,'erasure_resurrection');
 }
 const markers=(value,path,row)=>{if(!value||typeof value!=='object')return;if(value.erasure){const field=latest.get(JSON.stringify([row.kind,row.id,[...path,'erasure']]));check(field&&field.after===erasureDigest(value.erasure),'erasure_marker');}for(const [key,item]of Object.entries(value))markers(item,[...path,Array.isArray(value)?Number(key):key],row);};
 for(const row of records)if(row.kind!=='erasureReceipt')markers(row.data,[],row);
 for(const attachment of all('attachment'))if(attachment.erasure)check(erasedOriginal(all,attachment),'erasure_original');
 for(const kind of ['orderThreadMessage','rfqResponse','emailIntake','apInvoiceEmail'])for(const record of all(kind))for(const file of [record.original,...record.files??[],...record.embedded??[]].filter(Boolean))if(file.erasure) {
  if(file.key)check(receipts.some(r=>r.id===file.erasure&&r.originals.includes(file.key)),'erasure_blob');
  check(!file.base64,'erasure_inline_original');
 }
 return true;
}
export function validateErasureObjects(rows,manifest,check) {
 for(const row of rows.filter(r=>r.kind==='erasureReceipt')) {
  const receipt=JSON.parse(row.value);check(receipt.phase==='complete','erasure_pending');
  for(const key of receipt.originals)check(!manifest.objects.some(o=>o.bucket==='ORIGINALS'&&o.key===key),'erasure_original_resurrection');
 }
}
