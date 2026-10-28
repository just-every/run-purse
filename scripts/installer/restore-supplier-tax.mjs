import {createHash} from 'node:crypto';

/** Review chronology is portable. Current reviewer authority is never restored. */
export function validateSupplierTax(all,get,check,same) {
    const boxes=['NEC-1','MISC-1','MISC-2','MISC-3','MISC-5','MISC-6','MISC-8','MISC-9','MISC-10','MISC-11','MISC-12','MISC-14','MISC-15'];
    const fields=['id','supplier','version','basis','document','documentVersion','sourceSupplier','attachment','sha256','available','eligibility','box','backupWithholding','reason','reviewed','actor','operatorVersion','at','supersedes','erasure'];
    const versions=new Map();
    for(const row of all('supplierTaxReview')) {
        check(Object.keys(row).every(field=>fields.includes(field)),'supplier_tax_fields');
        get('supplier',row.supplier);get('supplier',row.sourceSupplier);
        check(Number.isSafeInteger(row.version)&&row.version>0&&/^[a-f0-9]{64}$/.test(row.basis),'supplier_tax_version');
        const key=row.supplier+':'+row.version;check(!versions.has(key),'supplier_tax_version');versions.set(key,row);
        check(row.reviewed===true&&['eligible','ineligible','unknown'].includes(row.eligibility)&&['required','not-required','unknown'].includes(row.backupWithholding),'supplier_tax_decision');
        check(row.eligibility==='eligible'?boxes.includes(row.box):row.box===null,'supplier_tax_box');
        check(typeof row.reason==='string'&&row.reason.trim().length>0&&row.reason.length<=2000&&typeof row.actor==='string'&&row.actor.length>0&&Number.isSafeInteger(row.operatorVersion)&&row.operatorVersion>0&&Number.isFinite(Date.parse(row.at)),'supplier_tax_reviewer');
        const document=get('supplierDocument',row.document),source=[...document.history,document].find(entry=>entry.version===row.documentVersion),file=get('attachment',row.attachment);
        check(source?.type==='w9'&&source.supplier===row.sourceSupplier&&source.attachment===row.attachment&&source.review?.attachment===row.attachment&&file.kind==='supplier'&&file.record===row.sourceSupplier&&file.privateSupplierDocument===true,'supplier_tax_evidence');
        const sha=file.erasure?file.sha256:createHash('sha256').update(Buffer.from(file.base64,'base64')).digest('hex');
        check(/^[a-f0-9]{64}$/.test(row.sha256)&&row.sha256===sha,'supplier_tax_digest');
        const {erasure,...snapshot}=row;
        check(all('audit').some(event=>event.action==='supplier-tax-review'&&event.record===row.id&&event.supplier===row.supplier&&same(event.snapshot,snapshot)),'supplier_tax_audit');
    }
    for(const row of all('supplierTaxReview'))check(row.version===1?row.supersedes===null:versions.get(row.supplier+':'+(row.version-1))?.id===row.supersedes,'supplier_tax_history');
}
