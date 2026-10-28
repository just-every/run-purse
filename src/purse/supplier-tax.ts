import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index';
import { supplierDocumentOriginal } from './supplier-documents';
import { canonicalSupplier } from './supplier-identity';
import { all, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

import { taxBoxes } from './supplier-tax-values';

/** The complete W-9 set and original supplier identities are the review basis.
 * A merge retains chronology but never chooses a favorable tax decision. */
export function supplierTaxBasis(s: State, supplierId: string) {
    const root = canonicalSupplier(s, supplierId);
    const family = all(s, 'supplier').filter(row => canonicalSupplier(s, row.id) === root).sort((a,b) => a.id.localeCompare(b.id));
    const ids = new Set(family.map(row => row.id));
    const documents = all(s, 'supplierDocument').filter(row => ids.has(row.supplier) && row.type === 'w9').sort((a,b) => a.id.localeCompare(b.id));
    const evidence = documents.map(document => supplierDocumentOriginal(s,document));
    const identities = family.map(row => Object.fromEntries(['id','name','dba','address','remitTo','postalState','mergedInto'].map(field => [field,row[field] ?? null])));
    const documentIds = new Set(documents.map(document => document.id));
    const pendingReview = all(s,'supplierDocumentSubmission').some(row => documentIds.has(row.document) && row.status === 'pending');
    return { basis: sha256(canonicalJson({ identities, evidence, pendingReview })), evidence, pendingReview };
}

export function supplierTaxView(s: State, a: Actor, supplierId: string): Data {
    requireThat(a.owner, 'Current native owner required', 403);
    const root = canonicalSupplier(s, supplierId), source = supplierTaxBasis(s, root);
    const history = all(s, 'supplierTaxReview').filter(row => canonicalSupplier(s, row.supplier) === root)
        .sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const own = history.filter(row => row.supplier === root).sort((a,b) => a.version - b.version), latest = own.at(-1);
    const status = (row: Data) => {
        if (source.pendingReview) return 'W-9 replacement awaiting buyer review; fresh tax review required';
        if (row.erasure || !source.evidence.some(file => file.document === row.document && file.available)) return 'Evidence withdrawn; fresh review required';
        if (row.basis !== source.basis || row.supplier !== root) return 'Evidence or supplier identity changed; fresh review required';
        if (row.id !== latest?.id) return 'Superseded';
        if (!s.has('nativeTaxAuthority:' + row.id)) return 'Historical review; current owner must review again';
        return 'Current human review';
    };
    const current = latest && status(latest) === 'Current human review' ? latest : null;
    return { supplier: root, ...source, version: latest?.version ?? 0, current,
        eligibility: current?.eligibility ?? 'unknown', backupWithholding: current?.backupWithholding ?? 'unknown', box: current?.box ?? null,
        history: history.map(row => ({ ...row, reviewStatus: status(row) })) };
}

/** This records a person's judgment, never a TIN check, filing or payment rule. */
export function supplierTax(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op !== 'supplier-tax-review') return;
    requireThat(a.owner, 'Current native owner required', 403);
    const fields = ['supplier','version','basis','document','documentVersion','attachment','sha256','reviewed','eligibility','box','backupWithholding','reason'];
    requireThat(Object.keys(b).every(field => fields.includes(field)), 'Only tax review fields are accepted; keep protected values in private evidence');
    const supplier = get(s, 'supplier', text(b.supplier,'Supplier',200));
    requireThat(!supplier.mergedInto, 'Review the surviving supplier', 409);
    const view = supplierTaxView(s,a,supplier.id);
    requireThat(b.version === view.version && b.basis === view.basis, 'Tax evidence or decisions changed; reload and review again',409);
    requireThat(!view.pendingReview, 'Review the pending W-9 replacement before recording a fresh tax review',409);
    const source = view.evidence.find((file: Data) => file.document === b.document);
    requireThat(source?.available && (['documentVersion','attachment','sha256'] as const).every(field => b[field] === source[field]), 'Review the exact current private W-9 original and version',409);
    requireThat(b.reviewed === true, 'Confirm a human reviewed this exact W-9');
    requireThat(['eligible','ineligible','unknown'].includes(b.eligibility), 'Choose eligible, ineligible or unknown');
    requireThat(['required','not-required','unknown'].includes(b.backupWithholding), 'Choose a backup-withholding status');
    requireThat(b.eligibility === 'eligible' ? taxBoxes.includes(b.box) : b.box === null, 'Eligible suppliers need a supported NEC or MISC box; other decisions have no box');
    const id = uid(), at = new Date().toISOString();
    const review = { id, supplier: supplier.id, version: view.version + 1, basis: view.basis, ...source,
        eligibility: b.eligibility, box: b.box, backupWithholding: b.backupWithholding, reason: text(b.reason,'Review reason'),
        reviewed: true, actor: a.id, operatorVersion: a.version, at, supersedes: view.history.filter((row: Data) => row.supplier === supplier.id).find((row: Data) => row.version === view.version)?.id ?? null };
    put(s,'supplierTaxReview',id,review);
    put(s,'nativeTaxAuthority',id,{actor:a.id,operatorVersion:a.version});
    audit(s,a,op,id,{supplier:supplier.id,snapshot:review});
    return review;
}
