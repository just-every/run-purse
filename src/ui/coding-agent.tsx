import { Details, Field, Form, Table, money, when, type D } from './shared';

const labels: Record<string, string> = { glAccount: 'GL account', class: 'Class', costCentre: 'Department', project: 'Project' };
function Source({ data, run, reference }: { data: D; run: D; reference: D }) {
    const source = run.sources.find((row: D) => row.kind === reference.kind && row.id === reference.id);
    const example = reference.kind === 'codingExample' ? source?.value : undefined;
    const invoice = (data.invoice ?? []).find((row: D) => row.id === (example?.targetKind === 'invoice' ? example.target : reference.kind === 'invoice' ? reference.id : null));
    const requestId = example?.request ?? source?.value?.request ?? (reference.kind === 'request' ? reference.id : null);
    return <Details label={reference.kind === 'codingExample' ? `Human coding example · ${invoice?.reference ?? example?.target ?? reference.id}`
        : reference.kind === 'invoice' ? `Past invoice · ${invoice?.reference ?? reference.id}` : `${reference.kind} · ${reference.id}`}>
        <p style={{ overflowWrap: 'anywhere' }}>Exact recorded source version: {reference.version}</p>
        {invoice ? <a href={'/app?tab=Orders&receipt=' + invoice.order}>Open invoice {invoice.reference} on its PO</a>
            : requestId ? <a href={'/app?tab=Requests&request=' + requestId}>Open source request</a> : null}
        {source && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(source.value, null, 2)}</pre>}
    </Details>;
}

export function CodingAgent({ data, current, kind = 'request', mutate }: {
    data: D; current: D; kind?: 'request' | 'invoice'; mutate: (op: string, input: D) => Promise<any>;
}) {
    const mayRun = kind === 'invoice' ? current.mayCapture : current.mayEdit || current.mayApprove;
    const mayReview = kind === 'invoice' ? current.mayCapture : current.mayEdit;
    const runs = (data.codingRun ?? []).filter((run: D) => run.targetKind === kind && run.target === current.id);
    if (!mayRun && !runs.length) return null;
    const business = data.business[0];
    return <section aria-label={'Coding and policy agent for ' + (kind === 'invoice' ? current.reference : current.title)}><Details label="Coding and policy suggestions">
        <p>Native deterministic analysis cites past invoice coding and human examples. Review possible split purchases and preferred supplier alternatives. The owner enables each purchase type in Settings.</p>
        {mayRun && <Form label="Suggest coding and check policy" onSubmit={() => mutate('coding-agent-run', { kind, id: current.id })}>
            <p>Prepare a source-bound suggestion for human review.</p>
        </Form>}
        {runs.map((run: D) => {
            const review = (data.codingReview ?? []).find((row: D) => row.run === run.id);
            const proposal = run.proposals[0], defaults = proposal?.input?.coding ?? {};
            return <article key={run.id} aria-label="Coding agent result">
                <h4>Coding analysis · {when(run.at)}</h4>{run.sourceValuesErased&&<p>Source identities since erased. Original execution digests retained; the owner erasure journal attests the anonymized record.</p>}<p>{run.mode} · model: {run.model} · provider: {run.provider}</p>
                {run.flags.map((flag: D, index: number) => <section key={index} aria-label="Policy review flag">
                    <h4>{flag.code === 'possible-split-purchase' ? 'Possible split purchase · approver review' : 'Preferred supplier available · review'}</h4>
                    <p>{flag.reason}</p>
                    {flag.code === 'possible-split-purchase' && <p>{money(flag.combinedMinor, flag.currency)} combined against {money(flag.thresholdMinor, flag.currency)} authority · {flag.date} · {flag.timezone}</p>}
                    <Details label="Policy flag sources">{flag.sources.map((reference: D) => <Source key={reference.kind + reference.id} data={data} run={run} reference={reference}/>)}</Details>
                </section>)}
                {run.suggestions.length ? <Table heads={['Item', 'Coding suggestion', 'Evidence']}>
                    {run.suggestions.map((suggestion: D) => <tr key={suggestion.line + suggestion.field}><td>{run.inputs.target.lines.find((line: D) => line.id === suggestion.line)?.description}</td>
                        <td>{labels[suggestion.field]}: {suggestion.value}</td><td><p>{suggestion.basis}</p>{suggestion.sources.map((reference: D) => <Source key={reference.kind + reference.id} data={data} run={run} reference={reference}/>)}</td></tr>)}
                </Table> : <p>No past coding evidence is available within your current scope. A human may record the first example.</p>}
                {review ? <p>Human {review.outcome} coding: {Object.entries(review.coding).map(([field, value]) => `${labels[field]} ${value}`).join(' · ')}. {review.purchasingChange === 'none' && 'Purchasing terms remain governed by ordinary request editing and approval.'}</p>
                    : mayReview && proposal && <Details label="Accept or correct these suggestions"><Form label="Record coding choice" onSubmit={body => mutate('coding-agent-review', {
                        id: run.id, proposal: proposal.id, coding: Object.fromEntries(Object.keys(labels).filter(field => body[field]).map(field => [field, body[field]])), reason: body.reason,
                    })}>
                        <p>Record the coding you reviewed for this record. Recent human choices improve later suggestions. Invoice choices are retained separately from original invoice evidence. Change request terms through the request’s normal edit and approval flow.</p>
                        <Field label="Coding GL account" name="glAccount" defaultValue={defaults.glAccount} required={false}/>
                        <Field label="Coding class" name="class" defaultValue={defaults.class} required={false}/>
                        <Field label="Coding department" name="costCentre" defaultValue={defaults.costCentre} required={false} options={business.costCentres.map((value: string) => ({ value, label: value }))}/>
                        <Field label="Coding project" name="project" defaultValue={defaults.project} required={false} options={business.projects.map((value: string) => ({ value, label: value }))}/>
                        <Field label="Coding review reason" name="reason"/>
                    </Form></Details>}
                {run.limitations.map((limitation: string) => <p key={limitation}>{limitation}</p>)}
                <a href={'/api/purse/download/agentRun/' + run.id}>Download complete coding record</a>
            </article>;
        })}
    </Details></section>;
}
