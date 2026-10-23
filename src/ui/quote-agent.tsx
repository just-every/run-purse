import { Details, Field, Form, Table, money, type D } from './shared';

/** A native execution result is distinct from the earlier editable human preparation. */
export function QuoteAgent({ data, current, mutate }: { data: D; current: D; mutate: (op: string, b: D) => Promise<any> }) {
    if (!current.mayManageRfq || current.imported) return null;
    const rfqs = (data.rfq ?? []).filter((row: D) => row.request === current.id);
    return <section aria-label="Quote collection agent"><h3>Quote collection agent</h3>
        <p>Native deterministic v1 reads supplied response fields and supported PDF, text and email originals. Missing values and differences stay flagged. The buyer sends native invitations, reviews clarification drafts and decides any award.</p>
        {rfqs.map((rfq: D) => {
            const consent = (data.quoteAgentConsent ?? []).find((row: D) => row.rfq === rfq.id);
            const exact = current.status === 'draft' && current.revision === rfq.revision;
            const runs = (data.agentRun ?? []).filter((run: D) => run.agent === 'AGENT-002' && run.rfq === rfq.id);
            return <Details key={rfq.id} label={`Quote agent · RFQ revision ${rfq.revision}`}>
                <p>{rfq.scope}</p><p>The owner must enable this agent for every purchase category in Settings. No autonomous supplier messages are authorized.</p>
                {exact && !consent && <Form label="Approve RFQ for quote agent" onSubmit={body => mutate('quote-agent-consent', { rfq: rfq.id, revision: current.revision, confirmed: body.confirmed === 'on', reason: body.reason })}>
                    <p>Approve this exact native invitation specification, nominated contacts, questions and deadline. Use the supplier RFQ controls to send each invitation.</p>
                    <label><input type="checkbox" name="confirmed" required/>I approve this RFQ invitation and specification for native quote analysis.</label>
                    <Field label="Quote agent consent reason" name="reason"/>
                </Form>}
                {consent && <p>Buyer consent retained for revision {consent.revision}. Invitations use the existing native supplier RFQ controls.</p>}
                {exact && consent && <>
                    <Form label="Run quote normalization" onSubmit={() => mutate('quote-agent-run', { rfq: rfq.id, revision: current.revision })}><p>Read the latest exact response from each supplier and verify each original’s digest. This creates an immutable comparison and nonbinding recommendation.</p></Form>
                    <Details label="Review a supplier clarification"><Form label="Prepare specification answer" onSubmit={body => mutate('quote-agent-clarify', { ...body, rfq: rfq.id, revision: current.revision })}>
                        <Field label="Clarification supplier" name="supplier" options={rfq.suppliers.map((supplier: D) => ({ value: supplier.id, label: supplier.name }))}/>
                        <Field label="Supplier clarification question" name="question" type="textarea"/>
                        <Field label="Clarification request line" name="sourceLine" required={false} options={[{ value: '', label: 'Whole RFQ' }, ...rfq.lines.map((line: D) => ({ value: line.id, label: line.description }))]}/>
                        <p>Exact supported questions: What is the RFQ scope? What is the response deadline? What is the requested quantity? What is the requested unit? What is the requested item? What is the requested SKU? Other wording or commercial questions go to the buyer. No answer is sent automatically.</p>
                    </Form></Details>
                </>}
                {runs.map((run: D) => <article key={run.id} aria-label="Quote agent execution"><h4>Native quote analysis · {run.at}</h4>
                    <p>{run.mode} · provider {run.provider} · model {run.model}. Supplier sources are data, never instructions. No award, purchasing approval or outbound message was made.</p>
                    {(run.comparison ?? []).map((row: D) => <div key={row.response}><h4>{rfq.suppliers.find((supplier: D) => supplier.id === row.supplier)?.name} · response {row.sequence}</h4>
                        <p>{money(row.totalMinor, row.currency)} including freight {money(row.freightMinor, row.currency)} and tax {money(row.taxMinor, row.currency)}. {row.eligible ? 'Complete and conforming under native checks' : 'Buyer review required'}</p>
                        <Table heads={['Item', 'Quantity / unit', 'Unit price', 'Source']}>{row.lines.map((line: D) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity} {line.normalizedUnit}</td><td>{money(line.unitMinor, row.currency)}</td><td>Supplier response {row.sequence}</td></tr>)}</Table>
                        <p>Lead time: {row.leadTime || 'Missing'} · validity: {row.validity || 'Missing'} · terms: {row.conditions || 'Missing'}</p>
                        {row.flags.map((flag: D, index: number) => <p key={index}><strong>{flag.code}</strong>: {flag.detail}</p>)}
                        {row.originals.map((original: D) => <Details key={original.source.file} label={`Original: ${original.source.name}`}><a href={original.source.url}>Download exact supplier original</a><p style={{ overflowWrap: 'anywhere' }}>SHA-256: {original.source.sha256}</p><p>Native reading: {original.status}</p>
                            {original.fields && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(original.fields, null, 2)}</pre>}</Details>)}
                    </div>)}
                    {(run.recommendations ?? []).map((recommendation: D) => <p key={recommendation.currency}><strong>{recommendation.currency} recommendation:</strong> {recommendation.response ? rfq.suppliers.find((supplier: D) => supplier.id === recommendation.supplier)?.name : 'Buyer review required'}. {recommendation.reason} First recorded offer: {recommendation.firstResponse}.</p>)}
                    {(run.messages ?? []).map((message: D, index: number) => <p key={index}><strong>{message.status}</strong>: {message.answer || message.reason} · draft only</p>)}
                    {(run.proposals ?? []).map((proposal: D) => {
                        const action = (data.proposedAction ?? []).find((row: D) => row.id === proposal.id);
                        return action?.status === 'proposed' && exact ? <Form key={proposal.id} label="Record buyer review without award" onSubmit={() => mutate('execute-action', { id: proposal.id })}><p>Rechecks current authority, consent, policies and exact latest response versions. Award separately using the native RFQ award form.</p></Form> : <p key={proposal.id}>Review action: {action?.status ?? 'Unavailable'}</p>;
                    })}
                </article>)}
            </Details>;
        })}
    </section>;
}
