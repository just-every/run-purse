import {randomBytes,randomUUID} from 'node:crypto';
import {tombstone} from '@runeditrun/rer/internal/modules/portability/journal.mjs';
import {attestation,classifyLegacyEvidence,digest,retainedEvidence} from './invoice-evidence-crypto.mjs';

/** The pinned Base policy exposes only staging copies here. All migrations are
 * validated before Base's single destination commit; failure never writes domain rows.
 */
export async function migrateInvoiceArchive({rows,db,tables,manifest,check}) {
 const invoices=rows.filter(r=>r.kind==='invoice'&&JSON.parse(r.value).evidenceHash);
 if(!invoices.length||rows.some(r=>r.kind==='invoiceEvidenceKey'))return rows;
 const rootRow=rows.find(r=>r.kind==='supplierMatchingKey'),root=rootRow&&JSON.parse(rootRow.value).secret;
 check(typeof root==='string'&&/^[a-f0-9]{64}$/.test(root),'invoice_evidence_legacy_key');
 const key=Buffer.from(randomBytes(32)).toString('hex'),event=randomUUID(),at=new Date().toISOString(),actor='archive-import';
 const counts={'attested-at-migration':0,'unavailable-source':0,'did-not-verify':0},ids={};
 const result=structuredClone(rows),changed=[];
 const supplier=id=>JSON.parse(result.find(r=>r.kind==='supplier'&&r.id===id)?.value??'null');
 for(const row of result.filter(r=>r.kind==='invoice'&&JSON.parse(r.value).evidenceHash)){
  const invoice=JSON.parse(row.value);check(!invoice.evidence,'invoice_evidence_state:'+invoice.id);
  let baseline=supplier(invoice.supplier??JSON.parse(result.find(r=>r.kind==='order'&&r.id===invoice.order).value).supplier),seen=new Set();
  while(baseline?.mergedInto){check(!seen.has(baseline.id),'supplier_merge_cycle');seen.add(baseline.id);baseline=supplier(baseline.mergedInto);}
  const state=classifyLegacyEvidence(root,invoice,baseline?.matching?.bank);
  check(state!=='did-not-verify','invoice_evidence_unverified:'+invoice.id);
  invoice.evidence={representation:'legacy-root-v1',state,event,actor,at,retainedDigest:digest(retainedEvidence(invoice)),...(state==='unavailable-source'?{importNote:'not checked at import'}:{})};
  invoice.evidence.attestation=attestation(key,invoice);row.value=JSON.stringify(invoice);changed.push(row);counts[state]++;(ids[state]??=[]).push(invoice.id);
 }
 const additions=[['invoiceEvidenceKey','main',{secret:key}],['invoiceEvidenceMigration',event,{at,actor,counts,invoices:ids,warning:'Archives exported before migration still carry the old matching root. Nothing was deleted.'}],['audit',randomUUID(),{actor,action:'invoice-evidence-migrate',record:event,at,counts,invoices:ids}]].map(([kind,id,value])=>({business:'main',kind,id,revision:randomUUID(),value:JSON.stringify({...value,id})}));
 // These are Base-generated copy identifiers, never identifiers from the archive.
 const table=tables.p_records;check(/^rer_portability_stage_[a-f0-9]+_\d+$/.test(table),'invoice_evidence_staging');
 const meta=table+'_meta',last=await db.prepare(`SELECT COALESCE(MAX(rowid),0) AS rowid FROM "${table}"`).first(),order=await db.prepare(`SELECT COALESCE(MAX(rer_portability_row_order),-1) AS n FROM "${meta}"`).first();
 const statements=changed.map(row=>db.prepare(`UPDATE "${table}" SET value=? WHERE business=? AND kind=? AND id=?`).bind(row.value,row.business,row.kind,row.id));
 for(let i=0;i<additions.length;i++){
  const row=additions[i],rowid=last.rowid+i+1,hash=await tombstone(manifest.sourceIdentity,'p_records',{business:row.business,kind:row.kind,id:row.id});
  statements.push(db.prepare(`INSERT INTO "${table}"(rowid,business,kind,id,revision,value) VALUES(?,?,?,?,?,?)`).bind(rowid,row.business,row.kind,row.id,row.revision,row.value),db.prepare(`INSERT INTO "${meta}" VALUES(?,?,NULL,?)`).bind(order.n+i+1,rowid,hash));
 }
 await db.batch(statements);return [...result,...additions];
}
