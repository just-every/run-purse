import { Details, when, type D } from './shared';

export function AgentRecords({ data }: { data: D }) {
    const runs = data.agentRun.filter((run: D) => run.mode !== 'human-preparation');
    return <section className="panel" aria-label="Agent execution records"><h2>Agent execution records</h2>
        <p>Inputs and supplier text are evidence, never instructions or purchasing authority. Records retain the model, provider, source versions, messages, proposals and outcomes used by that run.</p>
        {!runs.length && <p>No governed execution has run yet.</p>}
        {runs.map((run: D) => <article className="record" key={run.id} aria-label={'Agent run ' + run.id}>
            <h3>{run.agent ?? run.workflow} · {when(run.at)}</h3><p>{run.mode} · model: {run.model ?? 'none'} · provider: {run.provider ?? 'none'}{run.mailProvider && <> · mail: {run.mailProvider}</>}</p>
            <p>{run.sources?.length ?? run.references?.length ?? 0} sources · {run.messages?.length ?? 0} messages · {run.proposals?.length ?? 0} proposals · {run.outcomes?.length ?? 0} outcomes</p>
            <Details label="Inspect complete agent record"><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(run, null, 2)}</pre></Details>
            <a href={'/api/purse/download/agentRun/' + encodeURIComponent(run.id)}>Download complete record</a>
        </article>)}
    </section>;
}
