import { evidenceLabel } from './invoice-evidence-labels';
import { randomBytes } from 'node:crypto';
import { attestation, classifyLegacyEvidence, digest, legacyHash, retainedEvidence } from '../../scripts/installer/invoice-evidence-crypto.mjs';
import { all, audit, get, key, put, requireThat, uid, type Actor, type Data, type State } from './types';
import { canonicalSupplier, matchingInputs } from './supplier-identity';

export function evidenceKey(s: State) {
    if (!s.has(key('invoiceEvidenceKey','main'))) put(s,'invoiceEvidenceKey','main',{secret:Buffer.from(randomBytes(32)).toString('hex')});
    return get(s,'invoiceEvidenceKey','main').secret as string;
}
export function migrateInvoiceEvidence(s: State, a: Actor) {
    requireThat(a.owner,'Current native owner required',403);
    const secret=evidenceKey(s), old=s.get(key('supplierMatchingKey','main'))?.value.secret;
    const invoices=all(s,'invoice').filter(i=>i.evidenceHash&&!i.evidence);
    requireThat(!invoices.length||old,'Legacy key not present – restore the owner include archive',503);
    const event=uid(), at=new Date().toISOString(), counts: Data={'attested-at-migration':0,'unavailable-source':0,'did-not-verify':0}, ids: Data={};
    for(const invoice of invoices) {
        const supplier=get(s,'supplier',canonicalSupplier(s,invoice.supplier??get(s,'order',invoice.order).supplier));
        const state=classifyLegacyEvidence(old,invoice,supplier.matching?.bank);
        const updated={...invoice,evidence:{representation:'legacy-root-v1',state,event,actor:a.id,at,retainedDigest:digest(retainedEvidence(invoice))}};
        Object.assign(updated.evidence,{attestation:attestation(secret,updated)});
        put(s,'invoice',invoice.id,updated); counts[state]++;(ids[state]??=[]).push(invoice.id);
    }
    const receipt={id:event,counts,invoices:ids,warning:'Archives exported before migration still carry the old matching root. Review their custody; nothing was deleted.'};
    if(invoices.length){put(s,'invoiceEvidenceMigration',event,{...receipt,at,actor:a.id});audit(s,a,'invoice-evidence-migrate',event,{counts,invoices:ids,at});}
    return receipt;
}
export function reenterInvoiceEvidence(s: State, a: Actor, invoiceId: string, body: Data) {
    const invoice=get(s,'invoice',invoiceId), e=invoice.evidence;
    requireThat(e?.representation==='legacy-root-v1','Legacy invoice evidence required',409);
    const old=s.get(key('supplierMatchingKey','main'))?.value.secret;
    requireThat(old&&!s.get(key('supplierMatchingKey','main'))?.value.legacyUnavailable,'Legacy key not present – restore the owner include archive',503);
    const bank=matchingInputs(s,body.remit).bank;
    const matched=legacyHash(old,invoice,bank)===invoice.evidenceHash;
    const event=uid(),at=new Date().toISOString();
    // Source references and reasons are private input: retain no digits or suffixes in history.
    put(s,'audit',event,{actor:a.id,email:a.email,action:'invoice-evidence-reentry',record:invoice.id,result:matched?'verified-by-reentry':'did-not-verify',reason:body.reason.replace(/[0-9]+/g,'[digits omitted]'),evidence:body.evidence.replace(/[0-9]+/g,'[digits omitted]'),at});
    if(matched) {
        const updated={...invoice,evidence:{representation:'legacy-root-v1',state:'verified-by-reentry',event,actor:a.id,at,retainedDigest:digest(retainedEvidence(invoice))}};
        Object.assign(updated.evidence,{attestation:attestation(evidenceKey(s),updated)});
        put(s,'invoice',invoice.id,updated);
    }
    return {matched,state:matched?'verified-by-reentry':e.state,label:matched?evidenceLabel({state:'verified-by-reentry',at}):'Legacy evidence did not verify.'};
}
