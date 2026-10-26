import {check,integer,money} from './restore-validation.mjs';
const nonempty=v=>typeof v==='string'&&v.trim().length>0;
function profile(p){
 check(nonempty(p.id)&&integer(p.version)&&p.version>0&&nonempty(p.location)&&nonempty(p.purchaseType)&&nonempty(p.legalName),'po_profile');
 for(const a of [p.billTo,p.shipTo])check(a&&nonempty(a.label)&&nonempty(a.name)&&nonempty(a.address)&&typeof a.attention==='string','po_profile_address');
 check(nonempty(p.buyerContact)&&typeof p.shippingTerms==='string'&&nonempty(p.standardTerms)&&p.fieldLabels&&Object.values(p.fieldLabels).every(nonempty),'po_profile_terms');
 if(p.logo)check(['image/png','image/jpeg'].includes(p.logo.mediaType)&&typeof p.logo.base64==='string'&&p.logo.base64.length<=1333336,'po_profile_logo');
 for(const f of [p.termsFile,p.certificate].filter(Boolean))check(nonempty(f.name)&&typeof f.base64==='string'&&f.base64.length<=1333336&&(f.base64.length>0 || f.erasure && f.base64===''),'po_profile_file');
 if(p.certificate)check(Array.isArray(p.certificate.supplierStates)&&p.certificate.supplierStates.length>0&&p.certificate.supplierStates.every(s=>typeof s==='string'&&/^[A-Z]{2}$/.test(s)),'po_profile_certificate');
}
export function validatePoDocuments(all,get){
 for(const p of all('poProfile'))profile(p);
 for(const o of all('order').flatMap(order=>order.sources?[order,...order.sources]:[order]))if(o.documentProfile){profile(o.documentProfile);const p=get('poProfile',o.documentProfile.id);check(p.version>=o.documentProfile.version,'po_profile_version');}
 for(const kind of ['request','revision','order'])for(const r of all(kind)){
  if(r.poDetails?.blanket!=null){const b=r.poDetails.blanket;const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;check(valid(b.validFrom)&&valid(b.validThrough)&&b.validFrom<=b.validThrough,'blanket_validity');}
  if(r.poDetails?.depositTerms!==undefined)check(typeof r.poDetails.depositTerms==='string','po_deposit_terms');
  if(r.poDetails)check(['notes','shippingTerms','buyerContact'].every(k=>typeof r.poDetails[k]==='string'),'po_document_details');
  for(const l of r.lines){if(l.shipTo!==undefined)check(typeof l.shipTo==='string','po_line_address');if(l.lineTaxMinor!=null)check(money(l.lineTaxMinor),'po_line_tax');}
  if(r.lines.every(l=>l.lineTaxMinor!=null))check(r.lines.reduce((n,l)=>n+l.lineTaxMinor,0)===r.taxMinor,'po_line_tax_total');
 }
}
