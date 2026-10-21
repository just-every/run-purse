import { useState } from 'react';
import { RequestForm } from './request-form';
import { Details, money, type D } from './shared';

/** Uses the existing request editor: a copy is reviewed and saved before submission. */
export function RequestAgain({ kind, source, data, actor, mutate }: { kind: 'request' | 'order'; source: D; data: D; actor: D; mutate: (op: string, b: D) => Promise<any> }) {
    const [review, setReview] = useState<D>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [created, setCreated] = useState<string>();
    if (!actor.roles.includes('requester')) return null;
    async function preview() {
        setBusy(true); setError(''); setCreated(undefined);
        try { setReview(await mutate('request-again-preview', { kind, id: source.id })); }
        catch (e) { setError((e as Error).message); }
        finally { setBusy(false); }
    }
    return <Details label="Request again"><p>Review current prices and availability. Choose any files to copy, then save a new draft for approval.</p>
        <button type="button" disabled={busy} onClick={preview}>{busy ? 'Reviewing…' : review ? 'Refresh copy review' : 'Review copy'}</button>
        {error && <p role="alert">{error}</p>}
        {created ? <p role="status">New draft saved. <a href={'/app?tab=Requests&request=' + created}>Open the new draft</a></p> : review && <section aria-label="Copy review" key={review.fingerprint}>
            {review.flags.length > 0 && <ul className="ruled-list">{review.flags.map((flag: D, i: number) => <li key={i}>{flag.label ? flag.label + ' · ' : ''}{flag.reason}</li>)}</ul>}
            {review.changes.length > 0 && <ul className="ruled-list">{review.changes.map((change: D, i: number) => <li key={i}>{change.label} · Unit price changed from {money(change.beforeMinor, review.draft.currency)} to {money(change.afterMinor, review.draft.currency)}</li>)}</ul>}
            <CopyForm review={review} data={data} save={async (draft, attachments) => {
                const saved = await mutate('request-again', { kind, id: source.id, fingerprint: review.fingerprint, draft, attachments });
                setCreated(saved.id); return saved;
            }}/>
        </section>}
    </Details>;
}
function CopyForm({ review, data, save }: { review: D; data: D; save: (draft: D, files: string[]) => Promise<any> }) {
    const [selected, setSelected] = useState<string[]>([]);
    return <>
        {review.files.length > 0 && <fieldset><legend>Files to copy</legend>{review.files.map((file: D) => <label className="field" key={file.id}><span>{file.name} · {file.size} bytes</span><input type="checkbox" checked={selected.includes(file.id)} onChange={e => setSelected(e.target.checked ? [...selected, file.id] : selected.filter(id => id !== file.id))}/></label>)}</fieldset>}
        <RequestForm data={data} prefill={review.draft} submitLabel="Save copied draft" mutate={(_op, draft) => save(draft, selected)}/>
    </>;
}
