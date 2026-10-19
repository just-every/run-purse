import { useState } from 'react';
import { Form, Field, Table, Details, call, type D } from './shared';

export function SupplierMerge({ supplier, data, mutate, onMerged }: { supplier: D; data: D; mutate: (op: string, b: D) => Promise<any>; onMerged: () => void }) {
    const [review, setReview] = useState<D>();
    return <section className="panel"><h3>Merge duplicate supplier histories</h3>
        <p>{supplier.name} survives. The source becomes a nonpurchasable alias. Existing approved identities, PO and invoice links stay unchanged; source drafts need a supplier amendment and renewed approval.</p>
        <Form label="Preview supplier merge" onSubmit={async b => setReview(await call('command/preview-supplier-merge', { source: b.source, target: supplier.id }))}>
            <Field label="Duplicate supplier to merge into this record" name="source" options={data.supplier.filter((s: D) => s.id !== supplier.id && !s.mergedInto).map((s: D) => ({ value: s.id, label: s.name + ' · ' + s.status }))}/>
        </Form>
        {review && <><h4>Review merge: {review.source.name} into {review.target.name}</h4>
            <p>{review.family.length} retained supplier records; {review.links.request.length} requests, {review.links.order.length} POs and {review.links.invoice.length} invoices. No record is deleted and no message is sent.</p>
            <Form label="Merge reviewed supplier histories" onSubmit={async b => { await mutate('merge-suppliers', { source: review.source.id, target: review.target.id, fingerprint: review.fingerprint, reason: b.reason }); setReview(undefined); onMerged(); }}><Field label="Supplier merge reason" name="reason" type="textarea"/></Form>
        </>}
    </section>;
}
export function SupplierHistory({ supplier, data }: { supplier: D; data: D }) {
    const family = data.supplierFamilies?.find((f: D) => f.members.some((m: D) => m.id === supplier.id));
    if (!family) return null;
    return <section className="panel"><h3>Retained supplier histories</h3>
        <p>Original identities and links remain on their source records. This view joins the surviving supplier and its aliases.</p>
        <Table heads={['Supplier identity', 'Status', 'Reason', 'Screening history']}>{family.members.map((s: D) => <tr key={s.id}><td>{s.name}<br/>{s.id}</td><td>{s.status}</td><td>{s.reason}</td><td>{s.screenings?.length ?? 0} screening records</td></tr>)}</Table>
        {family.members.map((s: D) => <Details key={s.id} label={'Identity and screening history · ' + s.name}><p>{s.dba || 'No DBA'} · {s.address || 'No address'} · {s.phone || 'No phone'}</p>{(s.screenings ?? []).map((screen: D) => <p key={screen.id}>{screen.at} · {screen.name} · {screen.status}{screen.review ? ' · ' + screen.review.reason : ''}</p>)}</Details>)}
        {(['requests', 'orders', 'invoices'] as const).map(kind => <Details key={kind} label={'Retained ' + kind + ' (' + family[kind].length + ')'}>
            <Table heads={['Record', 'Original supplier', 'Status']}>{family[kind].map((r: D) => <tr key={r.id}><td>{r.number ?? r.reference ?? r.title}<br/>{r.id}</td><td>{family.members.find((s: D) => s.id === r.supplier)?.name}</td><td>{r.status ?? 'Invoice evidence'}</td></tr>)}</Table>
        </Details>)}
        {family.attachments.length > 0 && <Details label={'Retained supplier files (' + family.attachments.length + ')'}><ul>{family.attachments.map((f: D) => <li key={f.id}><a href={'/api/purse/download/attachment/' + f.id}>{f.name}</a></li>)}</ul></Details>}
        <Details label={'Supplier and merge audit (' + family.audit.length + ')'}><ul className="ruled-list">{family.audit.map((e: D) => <li key={e.id}>{e.at} · {e.action} · {e.reason ?? ''}</li>)}</ul></Details>
        {family.merges.map((m: D) => <p key={m.id}>Merge {m.at}: {m.reason}</p>)}
    </section>;
}
