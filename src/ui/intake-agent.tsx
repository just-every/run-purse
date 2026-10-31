import { useState } from 'react';
import { money, type D } from './shared';

export function IntakeAgent({ data, mutate, onDraft }: { data: D; mutate: (op: string, body: D) => Promise<any>; onDraft: (draft: D) => void }) {
    const [form, setForm] = useState(''), [need, setNeed] = useState(''), [quantity, setQuantity] = useState(''), [needDate, setDate] = useState(''), [terms, setTerms] = useState(''),
        [item, setItem] = useState(''), [run, setRun] = useState<D>(), [error, setError] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
    const execute = async (work: () => Promise<void>) => { setError(''); setBusy(true); try { await work(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } };
    const prepare = () => execute(async () => {
        const next = await mutate(run ? 'intake-agent-answer' : 'intake-agent-run', { ...(run ? { id: run.id } : { intakeForm: form, need }), quantity, needDate, terms, ...(item ? { item } : {}) });
        setRun(next); setItem(next.output.item); setConsent(false);
    });
    const histories = (data.agentRun ?? []).filter((row: D) => row.agent === 'AGENT-001');
    return <section aria-label="Requirements intake agent"><details><summary>Describe a need</summary>
        <p>Deterministic v1 · model none · provider none. Suggestions use current approved catalogue items and permitted purchase history. Nothing is submitted or sent.</p>
        <label className="field">Intake purchase form<select aria-label="Intake purchase form" disabled={Boolean(run)} value={form} onChange={event => setForm(event.target.value)}><option value="">Choose a form…</option>{data.intakeForm.filter((row: D) => row.active).map((row: D) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="field">Describe your need<textarea aria-label="Describe your need" value={need} disabled={Boolean(run)} onChange={event => setNeed(event.target.value)} maxLength={2000}/></label>
        {run && <p role="status">{run.output.followUp}</p>}
        <label className="field">Explicit quantity<input inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)}/></label>
        <label className="field">Explicit need date<input type="date" value={needDate} onChange={event => setDate(event.target.value)}/></label>
        <label className="field">Known supplier terms<input value={terms} onChange={event => setTerms(event.target.value)} maxLength={2000}/></label>
        {run && <label className="field">Suggested catalogue item<select aria-label="Suggested catalogue item" value={item} onChange={event => setItem(event.target.value)}><option value="">Choose a suggestion…</option>{run.output.candidates.map((candidate: D) => <option key={candidate.id} value={candidate.id}>{candidate.description} · {candidate.supplier}</option>)}</select></label>}
        <button type="button" disabled={busy || !form || !need.trim()} onClick={prepare}>{run ? 'Answer intake follow-up' : 'Prepare intake suggestions'}</button>
        {run && <section aria-label="Intake suggestions"><h4>Review suggestions</h4>{run.output.candidates.map((candidate: D) => <article key={candidate.id}>
            <h4>{candidate.description}</h4><p>{candidate.supplier} · {money(candidate.unitMinor, candidate.currency)} per item</p>
            <details><summary>Item sources</summary>{candidate.sources.map((source: D) => <p key={source.kind + source.id}>{source.kind} · {source.id} · version {source.version}</p>)}</details>
            {Object.keys(candidate.coding).length > 0 ? <><p>Suggested coding: {Object.entries(candidate.coding).map(([key, value]) => key + ': ' + value).join(' · ')}</p><details><summary>Coding sources</summary>{candidate.codingSources.map((source: D) => {
                const snapshot = run.sources.find((row: D) => row.kind === source.kind && row.id === source.id);
                return <p key={source.kind + source.id}>{source.kind === 'revision' ? `Purchase ${snapshot.value.request} · revision ${snapshot.value.revision} · line ${candidate.codingLine ?? snapshot.value.line}` : source.kind + ' · ' + source.id} · version {source.version}</p>;
            })}</details></> : <p>No permitted purchase coding example. Review the configured defaults in your draft.</p>}
        </article>)}
            <section aria-label="Intake predicted route"><h4>Predicted approval route</h4><ol>{run.output.route.steps.map((step: D, index: number) => <li key={index}>{step.label} · {step.approver ?? step.authority}</li>)}</ol><p>{run.output.route.message}</p></section>
            <ul>{run.output.limitations.map((limit: string) => <li key={limit}>{limit}</li>)}</ul>
            <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>I reviewed this saved suggestion and want my editable draft</label>
            <button type="button" disabled={busy || !consent || run.output.missing.length > 0 || quantity !== run.inputs.quantity || needDate !== run.inputs.needDate || terms !== run.inputs.terms || item !== run.output.item} onClick={() => execute(async () => onDraft(await mutate('intake-agent-draft', { id: run.id, consent: true })))}>Create reviewed intake draft</button>
            <button type="button" onClick={() => { setRun(undefined); setConsent(false); setItem(''); }}>Start another intake</button>
            <a href={'/api/purse/download/agentRun/' + run.id}>Download immutable intake record</a>
        </section>}
        {error && <p role="alert">{error}</p>}
        {histories.length > 0 && <details><summary>Previous intake records</summary>{histories.map((row: D) => <p key={row.id}><a href={'/api/purse/download/agentRun/' + row.id}>{row.inputs.need} · {row.at}</a>{row.sourceValuesErased && ' · Source identities since erased; history cannot execute.'}</p>)}</details>}
    </details></section>;
}
