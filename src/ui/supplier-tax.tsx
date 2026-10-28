import { useState } from 'react';
import { taxBoxes } from '../purse/supplier-tax-values';
import { Form, Field, when, type D } from './shared';

export function SupplierTax({ supplier, view, files, mutate }: { supplier: D; view: D; files: D[]; mutate: (op: string,b: D) => Promise<any> }) {
    const [document,setDocument] = useState('');
    const evidence = view.evidence.find((row: D) => row.document === document);
    return <section className="panel" aria-label="Supplier tax review"><h3>1099 human review</h3>
        <p>Eligibility: <strong>{view.eligibility}</strong> · Box: {view.box ?? 'None'} · Backup withholding: {view.backupWithholding}</p>
        <p>These are owner-recorded judgments from a private W-9. They do not verify a TIN, determine legal eligibility, total payments or file returns.</p>
        {!view.current && <p role="status">Fresh owner review required. Until then eligibility and backup withholding are unknown.</p>}
        {view.pendingReview && <p role="status">A W-9 replacement is awaiting buyer document review. Review it in Supplier document compliance, then record a fresh tax judgment.</p>}
        {!supplier.mergedInto && !view.pendingReview && <>
            <label className="field">Select reviewed W-9<select aria-label="Select reviewed W-9" value={document} onChange={event => setDocument(event.target.value)}><option value="">Choose…</option>{view.evidence.filter((row: D) => row.available).map((row: D) => <option key={row.document} value={row.document}>{files.find(file => file.id === row.attachment)?.name ?? 'Private W-9'} · version {row.documentVersion}</option>)}</select></label>
            {evidence && <><p><a href={`/api/purse/download/attachment/${evidence.attachment}`}>Download private W-9 original</a></p><details><summary>Exact evidence binding</summary><p>Document {evidence.document} · version {evidence.documentVersion}</p><p style={{overflowWrap:'anywhere'}}>SHA-256 {evidence.sha256}</p></details>
                <Form key={view.basis + ':' + view.version + ':' + document} label="Record human tax review" onSubmit={b => mutate('supplier-tax-review',{...b,supplier:supplier.id,version:view.version,basis:view.basis,document:evidence.document,documentVersion:evidence.documentVersion,attachment:evidence.attachment,sha256:evidence.sha256,reviewed:b.reviewed==='yes',box:b.eligibility==='eligible'?b.box:null})}>
                    <Field label="1099 eligibility" name="eligibility" defaultValue="unknown" options={['eligible','ineligible','unknown'].map(value=>({value,label:value}))}/>
                    <Field label="Default 1099 box" name="box" required={false} options={taxBoxes.map(value=>({value,label:value}))}/>
                    <Field label="Backup-withholding status" name="backupWithholding" defaultValue="unknown" options={['required','not-required','unknown'].map(value=>({value,label:value}))}/>
                    <Field label="Review reason (no protected values)" name="reason"/>
                    <label className="field"><input type="checkbox" name="reviewed" value="yes" required/>I personally reviewed this exact private W-9 original.</label>
                </Form>
            </>}
            {!view.evidence.some((row: D) => row.available) && <p>First upload and review a private W-9 in Supplier document compliance.</p>}
        </>}
        <details><summary>Tax review history ({view.history.length})</summary><ul className="ruled-list">{view.history.map((row: D) => <li key={row.id}>
            <strong>{row.eligibility}</strong> · {row.box ?? 'No box'} · withholding {row.backupWithholding} · {row.reviewStatus}<p>{row.reason} · {when(row.at)}</p>
            <details><summary>Reviewed source and actor</summary><p style={{overflowWrap:'anywhere'}}>Supplier {row.supplier} · document {row.document} · version {row.documentVersion} · SHA-256 {row.sha256} · reviewer {row.actor}</p><a href={`/api/purse/download/attachment/${row.attachment}`}>Reviewed private original</a></details>
        </li>)}</ul></details>
    </section>;
}
