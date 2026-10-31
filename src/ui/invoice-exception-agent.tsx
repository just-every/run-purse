import { Details, Form, Table, money, when, type D } from './shared';

/** Uses the queue's existing forms and report presentation. Controls live in Settings. */
export function InvoiceExceptionAgent({ item, data, mutate }: { item: D; data: D; mutate: (op: string, body: D) => Promise<any> }) {
    const runs = (data.agentRun ?? []).filter((r: D) => r.agent === 'AGENT-004' && r.exception === item.id);
    if (!item.mayAssign && !runs.length) return null;
    return <Details label="Invoice exception agent">
        <p>Deterministic v1 · Model: none · Provider: none. Drafts require human review. Receivers confirm goods; AP decides variances and payments.</p>
        {item.agent?.sourceVersion && item.agent.enabled ? <Form key={item.agent.sourceVersion} label="Prepare exception drafts"
            initial={{ id: item.id, sourceVersion: item.agent.sourceVersion }} onSubmit={b => mutate('invoice-exception-agent-run', b)}><p>Prepare source-cited drafts for review.</p></Form>
            : <p>{item.agent?.reason ?? 'Paused or not enabled for this purchase type. The owner manages agent controls in Settings.'}</p>}
        {runs.map((run: D) => <section key={run.id} aria-label="Exception agent report">
            <h4>Exception drafts · {when(run.at)}</h4>
            <p>Original exception recorded {when(run.openedAt)}. Purchasing and payment records are unchanged.</p>
            <Table heads={['Line', 'Invoice', 'Issued-price amount', 'Difference', 'Explanation']}>
                {run.explanations.map((row: D, index: number) => <tr key={row.line}><td>Line {index + 1}</td><td>{money(row.invoiceMinor, run.currency)}</td>
                    <td>{money(row.expectedMinor, run.currency)}</td><td>{money(row.priceDifferenceMinor, run.currency)}</td><td>{row.text}</td></tr>)}
            </Table>
            <ul className="ruled-list">{run.proposals.map((proposal: D, index: number) => <li key={index}><h4>{proposal.type === 'receiver-review' ? 'Receiver review draft' : 'Corrected invoice or credit request draft'}</h4><p>{proposal.draft}</p></li>)}</ul>
            <p>Unresolved risk holds: {run.holds.riskCodes.join(', ') || 'None recorded'}. {run.holds.disputed && 'Invoice remains disputed.'}</p>
            <Details label="Cited source evidence"><ul className="ruled-list">{run.sources.map((source: D) => <li key={source.kind + source.id}>
                <p>{source.kind} · {source.id} · version {source.version}</p>
                <pre>{JSON.stringify(source.value, null, 2)}</pre>
            </li>)}</ul></Details>
            {run.sourceVersion === item.agent?.sourceVersion && item.agent?.enabled && !run.sourceValuesErased
                ? <a href={'/api/purse/download/agentRun/' + run.id}>Download exception report</a>
                : <p>Historical report. Sources or controls changed; prepare a new report for current use.</p>}
            <p>{run.limitations.join(' ')}</p>
        </section>)}
    </Details>;
}
