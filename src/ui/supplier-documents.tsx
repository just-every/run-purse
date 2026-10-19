import { useState } from 'react';
import { Form, Field, Table, options, call, when, type D } from './shared';

export function SupplierDocuments({ supplier, data, mutate, reload }: { supplier: D; data: D; mutate: (op: string, b: D) => Promise<any>; reload: () => Promise<void> }) {
    const [selected, setSelected] = useState<string>(), [notice, setNotice] = useState(''), [refreshUrl, setRefreshUrl] = useState('');
    const family = data.supplierFamilies.find((f: D) => f.supplier === supplier.id)?.members.map((m: D) => m.id) ?? [supplier.id];
    const documents = data.supplierDocument.filter((d: D) => family.includes(d.supplier));
    const current = documents.find((d: D) => d.id === selected);
    const files = data.attachment.filter((f: D) => f.kind === 'supplier' && f.record === (current?.supplier ?? supplier.id) && f.privateSupplierDocument);
    return <section className="panel"><h3>Supplier document compliance</h3>
        <p className="quiet">Upload private compliance evidence below, then record its expiry and review. Compliance files are available only to buyers and owners. Expiry dates include the whole day in America/New_York. A required lapsed document holds new purchase orders.</p>
        <Table heads={['Document', 'Expiry', 'Compliance', 'Required', '']}>
            {documents.map((d: D) => <tr key={d.id}><td><a href={`/api/purse/download/attachment/${d.attachment}`}>{d.type}</a></td><td>{d.expires}</td><td>{d.compliance.lapsed ? 'Lapsed' : d.compliance.refreshDue ? 'Refresh due' : 'Current'}</td><td>{d.required ? 'Yes' : 'No'}</td><td><button onClick={() => setSelected(d.id)}>Review document</button> <button onClick={async () => { try { const result = await call('supplier-document-refresh', { id: d.id }); setRefreshUrl(result.reminders[0].refreshUrl); await reload(); setNotice('Refresh requested. The upload link expires in seven days and accepts one file for buyer review. Check the recorded mail outcome below.'); } catch (e) { setNotice((e as Error).message); } }}>Request refreshed document</button></td></tr>)}
        </Table>
        <Form label="Upload private compliance evidence" className="record-form-inline" onSubmit={async b => { const file = b.file as File; const bytes = new Uint8Array(await file.arrayBuffer()); let raw = ''; for (const x of bytes) raw += String.fromCharCode(x); await mutate('attachment', { kind: 'supplier', record: current?.supplier ?? supplier.id, privateSupplierDocument: true, name: file.name, mediaType: file.type || 'application/octet-stream', base64: btoa(raw) }); }}><label className="field">Private compliance file<input type="file" name="file" required/></label></Form>
        {refreshUrl && <p><a href={refreshUrl} target="_blank" rel="noreferrer">Open supplier refresh upload</a> · Share this link only with the supplier; it grants upload access to this document.</p>}
        {data.supplierDocumentSubmission.filter((p: D) => p.status === 'pending' && documents.some((d: D) => d.id === p.document)).map((p: D) => { const document = documents.find((d: D) => d.id === p.document); return <section key={p.id}><h4>Supplier upload awaiting review</h4><a href={`/api/purse/download/attachment/${p.attachment}`}>Download submitted evidence</a><p>Uploaded {when(p.submittedAt)}. The current expiry and hold still apply.</p><Form label="Accept refreshed document" initial={{ id: document.id, version: document.version, attachment: p.attachment, submission: p.id }} onSubmit={b => mutate('review-supplier-document', b)}><Field label="Reviewed replacement expiry" name="expires" type="date"/></Form></section>; })}
        <h4>{current ? 'Update document review' : 'Track supplier document'}</h4>
        <Form key={current?.id + ':' + current?.version} label="Save document review" initial={{ id: current?.id, supplier: current?.supplier ?? supplier.id, version: current?.version ?? 0 }} onSubmit={async b => {
            await mutate('supplier-document', { ...b, required: b.required === 'yes', reminderDays: String(b.reminderDays).split(',').filter(s => s.trim()).map(Number), refreshEveryDays: b.refreshEveryDays ? Number(b.refreshEveryDays) : undefined }); setSelected(undefined);
        }}>
            <Field label="Document type" name="type" defaultValue={current?.type} options={['insurance', 'w9', 'license', 'security-review', 'agreement'].map(value => ({ value, label: ({ insurance: 'Insurance / COI', w9: 'W-9', license: 'License', 'security-review': 'Security review', agreement: 'Agreement' } as Record<string, string>)[value] }))}/>
            <Field label="Reviewed evidence file" name="attachment" defaultValue={current?.attachment} options={options(files)}/>
            <Field label="Document expiry" name="expires" type="date" defaultValue={current?.expires}/>
            <Field label="Required for new POs" name="required" defaultValue={current?.required ? 'yes' : 'no'} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}/>
            <Field label="Remind days before expiry (comma separated)" name="reminderDays" defaultValue={current?.reminderDays.join(', ') ?? '30, 7, 0'}/>
            <Field label="Refresh cycle in days" name="refreshEveryDays" type="number" required={false} defaultValue={current?.refreshEveryDays ?? ''}/>
        </Form>
        {current && <button onClick={() => setSelected(undefined)}>Track another document</button>}
        <button onClick={async () => { try { await call('supplier-reminders', {}); await reload(); setNotice('Due reminders processed. Provider acceptance is not mailbox delivery; local mail is suppressed.'); } catch (e) { setNotice((e as Error).message); } }}>Process due document reminders</button>
        <p role="status">{notice}</p>
        <h4>Reminder outcomes</h4>
        <ul className="ruled-list">{data.supplierDocumentReminder.filter((r: D) => family.includes(r.supplier)).map((r: D) => <li key={r.id}>{r.reason === 'cycle' ? 'Compliance cycle' : r.reason.startsWith('manual-') ? 'Buyer requested refresh' : 'Expiry reminder'} · expiry {r.expires} · {when(r.createdAt)} · {r.outcomes.length ? r.outcomes.map((o: D) => `${o.target}: ${o.status === 'development' ? 'suppressed locally' : o.status}`).join('; ') : 'Outcome unknown; no automatic resend'}</li>)}</ul>
        {documents.filter((d: D) => d.history?.length).map((d: D) => <details key={d.id}><summary>{d.type} review history</summary><ul>{d.history.map((h: D, i: number) => <li key={i}>Version {h.version} · expiry {h.expires} · reviewed {when(h.reviewedAt)} · <a href={`/api/purse/download/attachment/${h.attachment}`}>Original evidence</a></li>)}</ul></details>)}
    </section>;
}
