import { useState } from 'react';
import { call, Details, Field, Form, money, Table, when, type D } from './shared';

function Citation({ source }: { source: D }) {
    const label = source.kind === 'order' ? 'PO ' + source.number : source.kind === 'agreement' ? 'Agreement ' + source.id : 'Quotation ' + source.id;
    return <span className="benchmark-citation"><a href={source.kind === 'order' ? '/app?tab=Orders&receipt=' + source.id : source.kind === 'agreement' ? '/app?tab=Agreements&agreement=' + source.id : '/app?tab=Requests&request=' + source.request}>{label}</a>
        {' · ' + (source.kind === 'agreement' ? 'version ' + source.agreementVersion : 'revision ' + source.revision) + ' · line ' + source.line}<br/>{source.partNumber} · {source.unit} · {money(source.unitMinor, source.currency)}<br/>
        {source.kind === 'agreement' && <span>Term {source.startDate} to {source.endDate} · notice deadline {source.noticeDeadline}<br/></span>}
        {source.dateBasis}: {when(source.at)}{source.missing?.length > 0 && <p>Missing: {source.missing.join('; ')}</p>}</span>;
}
export function PriceBenchmark({ data, current, mutate }: { data: D; current: D; mutate: (op: string, body: D) => Promise<any> }) {
    const [preview, setPreview] = useState<D>(), [selected, setSelected] = useState<D[]>([]);
    if (!current.mayManagePurchasing || current.imported || current.purchaseType === 'travel') return null;
    const runs = (data.agentRun ?? []).filter((run: D) => run.agent === 'AGENT-009' && run.request === current.id);
    const base = { request: current.id, revision: current.revision };
    const renewalAward = (data.agreementAward ?? []).find((award: D) => award.request === current.id && award.revision === current.revision);
    return <section aria-label={'Price benchmark for ' + current.title}><Details label="Price benchmark">
        <p>Deterministic v1 · model none · provider none. A nonbinding negotiation brief from exact buyer-reviewed item, unit and currency matches. Descriptions never establish equivalence.</p>
        <p>Qualified current PunchOut price unavailable. Recorded prices do not establish current supplier availability. This brief makes no offer and sends no message.</p>
        <Form label="Review comparable prices" onSubmit={async body => { setPreview(await call('price-benchmark/preview', { ...base, ...(body.context === 'renewal' ? { renewalAward: renewalAward.id } : {}) })); setSelected([]); }}>
            <p>Review permitted issued PO revisions and recorded quotations before choosing source lines.</p>
            {renewalAward && <Field label="Benchmark context" name="context" options={[{value:'request',label:'Purchase request'}, {value:'renewal',label:'Agreement renewal with the existing buyer mapping'}]}/>}
        </Form>
        {preview && <Form label="Create nonbinding benchmark" key={preview.fingerprint} onSubmit={async body => {
            await mutate('price-benchmark-run', { ...base, ...(preview.renewal ? {renewalAward:preview.renewal.award} : {}), fingerprint: preview.fingerprint, mappings: selected, reviewed: body.reviewed === 'yes', reason: body.reason });
            setPreview(undefined); setSelected([]);
        }}>
            {preview.renewal && <p>Renewal preparation · agreement version {preview.renewal.agreementVersion} · term {preview.renewal.startDate} to {preview.renewal.endDate} · notice deadline {preview.renewal.noticeDeadline}. The existing buyer mapping supplies context only; this brief cannot renew an agreement or change a purchase.</p>}
            {preview.target.lines.map((target: D) => <section key={target.line} aria-label={'Compare requested line ' + target.line}>
                <h4>{target.partNumber || 'Missing exact item identifier'} · {target.unit} · requested {money(target.unitMinor, preview.target.currency)}</h4>
                <p className="benchmark-citation">Requested line {target.line}</p>
                {preview.sources.filter((source: D) => source.partNumber === target.partNumber && source.unit === target.unit && source.currency === preview.target.currency).map((source: D) => {
                    const mapping = { targetLine: target.line, kind: source.kind, id: source.id, line: source.line,
                        ...(source.kind === 'agreement' ? {agreementVersion:source.agreementVersion} : {}) };
                    const key = JSON.stringify(mapping), checked = selected.some(row => JSON.stringify(row) === key);
                    return <label className="field field-wide" key={key}><span><input type="checkbox" aria-label={'Compare ' + source.kind + ' ' + source.id + (source.kind === 'agreement' ? ' version ' + source.agreementVersion : '') + ' line ' + source.line + ' to ' + target.line} checked={checked} onChange={event => setSelected(event.target.checked ? [...selected, mapping] : selected.filter(row => JSON.stringify(row) !== key))}/> Include this exact source line</span><Citation source={source}/></label>;
                })}
                {!preview.sources.some((source: D) => source.partNumber === target.partNumber && source.unit === target.unit && source.currency === preview.target.currency) && <p>No comparable permitted source lines. No target will be proposed for this line.</p>}
            </section>)}
            <Field label="Exact mappings reviewed" name="reviewed" options={[{ value: 'yes', label: 'I reviewed the exact item, unit and currency mappings' }]}/>
            <Field label="Mapping review reason" name="reason"/>
        </Form>}
        {runs.map((run: D) => <section key={run.id} aria-label={'Benchmark record ' + run.id}><h4>Nonbinding brief · request revision {run.revision}</h4><p>{when(run.at)} · {run.mode} · model {run.model} · provider {run.provider}</p>
            {run.inputs.renewal && <p>Renewal preparation · agreement version {run.inputs.renewal.agreementVersion} · term {run.inputs.renewal.startDate} to {run.inputs.renewal.endDate} · notice deadline {run.inputs.renewal.noticeDeadline}. No renewal decision or offer has been made.</p>}
            {run.sourceValuesErased && <p>Source identities since erased. Anonymous financial history remains; this record grants no execution authority.</p>}
            <Table heads={['Requested item', 'Calculation and target', 'Exact evidence']}>
                {run.results.map((result: D) => <tr key={result.line}><td>{result.partNumber} · {result.unit}<br/>Requested {money(result.unitMinor, result.currency)}</td>
                    <td><strong>{result.targetMinor === null ? 'No target' : 'Target ' + money(result.targetMinor, result.currency) + ' per ' + result.unit}</strong><p>{result.calculation}</p>
                        {result.targetMinor !== null && <p>Minimum of {result.unitMinor} and {result.citations.map((source: D) => source.unitMinor).join(', ')} = {result.targetMinor} minor units. Difference {money(result.differenceMinor, result.currency)} per unit.</p>}
                        <p>{result.arguments}</p><p>Missing: {result.missing.join('; ')}</p></td>
                    <td>{result.citations.map((source: D) => <p key={source.kind + source.id + source.agreementVersion + source.line}><Citation source={source}/></p>)}</td></tr>)}
            </Table><a href={'/api/purse/download/agentRun/' + run.id}>Download benchmark record</a>
        </section>)}
    </Details></section>;
}
