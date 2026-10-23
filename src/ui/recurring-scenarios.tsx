import { ScenarioSources } from './scenario-sources';
import { Field, Form, Table, Details, money, type D } from './shared';

const amount = (value: string) => {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter a nonnegative amount with up to two decimal places');
    const [whole, fraction = ''] = value.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};
export function RecurringScenarios({data,actor,mutate}:{data:D;actor:D;mutate:(op:string,b:D)=>Promise<any>}) {
    const owner=actor.roles.includes('owner'), scenarios=data.recurringScenario??[], agreements=data.agreement??[];
    const linked=(agreement:D)=>data.recurringSeries.filter((series:D)=>series.agreement===agreement.id).flatMap((series:D)=>data.order.filter((order:D)=>order.id===series.order&&data.cashRequirements?.commitments.some((row:D)=>row.order===order.id)));
    return <section className="panel" aria-label="Recurring spend scenarios"><h2>Recurring spend scenarios</h2>
        <p>Compare overlapping services using recorded agreements and issued PO obligations. These are human-entered assumptions, never realized savings. Finance and each affected agreement owner approve the exact scenario before a nonbinding brief can be drafted.</p>
        <p className="quiet">Deterministic v1 · model and provider: none. Future unissued renewals stay unknown. Preparing or approving a scenario changes no commitment, cash forecast, agreement or order, and sends nothing.</p>
        {owner&&<Form label="Prepare recurring scenario" onSubmit={b=>{
            const selected=agreements.filter((agreement:D)=>b['include-'+agreement.id]==='on');
            const evidence=['valueSeatImport','valueConfirmation','supplierIssue','supplierOrderEvidence','receipt'].flatMap(kind=>(data[kind]??[]).filter((row:D)=>b['evidence-'+kind+'-'+row.id]==='on').map((row:D)=>({kind,id:row.id})));
            return mutate('recurring-scenario-prepare',{kind:b.kind,from:b.from,to:b.to,reason:b.reason,operationalRisk:b.risk,agreementIds:selected.map((row:D)=>row.id),evidence,
                assumptions:selected.flatMap((agreement:D)=>{const orders=linked(agreement);return orders.length?orders.map((order:D)=>({agreement:agreement.id,order:order.id,expectedDate:b['date-'+order.id],proposedMinor:amount(b['cash-'+order.id]),proposedCommitmentMinor:amount(b['commit-'+order.id]),reason:b['reason-'+agreement.id]})):[{agreement:agreement.id,reason:b['reason-'+agreement.id]}];})});
        }}>
            <Field label="Scenario action" name="kind" options={['consolidate','renegotiate','cancel'].map(value=>({value,label:value}))}/><Field label="Scenario from" name="from" type="date"/><Field label="Scenario through" name="to" type="date"/>
            <Field label="Scenario reason" name="reason"/><Field label="Operational risk and mitigation" name="risk" type="textarea"/>
            <div className="field-wide">{agreements.map((agreement:D)=><fieldset key={agreement.id}><legend><label><input type="checkbox" name={'include-'+agreement.id}/> {agreement.name} · {agreement.currency} · notice {agreement.noticeDeadline}</label></legend>
                <Field label={'Assumption for '+agreement.name} name={'reason-'+agreement.id} required={false}/>
                {linked(agreement).map((order:D)=><div key={order.id}><p>{order.number} · current forecast {money(data.cashRequirements.commitments.find((row:D)=>row.order===order.id).amountMinor,agreement.currency)}</p><Field label={'Proposed cash for '+order.number+' ('+agreement.currency+')'} name={'cash-'+order.id} required={false}/><Field label={'Proposed commitment for '+order.number+' ('+agreement.currency+')'} name={'commit-'+order.id} required={false}/><Field label={'Proposed date for '+order.number} name={'date-'+order.id} type="date" required={false}/></div>)}
                {!linked(agreement).length&&<p>No linked outstanding issued PO: future forecast and commitment effect are unknown.</p>}
            </fieldset>)}</div>
            <Details label="Choose recorded usage and service evidence">{['valueSeatImport','valueConfirmation','supplierIssue','supplierOrderEvidence','receipt'].flatMap(kind=>(data[kind]??[]).map((row:D)=><label key={kind+row.id}><input type="checkbox" name={'evidence-'+kind+'-'+row.id}/> {kind} · {row.provider??row.category??row.event??row.usefulness??row.id} · {row.at??row.periodEnd}</label>))}</Details>
        </Form>}
        {scenarios.map((scenario:D)=>{const snapshot=scenario.snapshot, currency=snapshot.currency, consents=(data.recurringScenarioConsent??[]).filter((row:D)=>row.scenario===scenario.id),draft=(data.recurringScenarioDraft??[]).find((row:D)=>row.scenario===scenario.id);return <section className="record" key={scenario.id} aria-label={'Scenario '+scenario.id}>
            <h3>{scenario.choices.kind} · scenario, not realized savings</h3><p>{scenario.choices.from} through {scenario.choices.to} · {scenario.mode} · model {scenario.model}</p>
            <p>{scenario.choices.reason}</p><p>Operational risk: {scenario.choices.operationalRisk}</p>
            <Table heads={['Measure','Recorded baseline','Proposed scenario','Change']}><tr><td>Outstanding cash</td><td>{money(snapshot.baseline.cashMinor,currency)}</td><td>{money(snapshot.proposed.cashMinor,currency)}</td><td>{money(snapshot.effect.cashMinor,currency)}</td></tr><tr><td>Commitment ledger</td><td>{money(snapshot.baseline.commitmentsMinor,currency)}</td><td>{money(snapshot.proposed.commitmentsMinor,currency)}</td><td>{money(snapshot.effect.commitmentsMinor,currency)}</td></tr></Table>
            {!!snapshot.unknownForecastAgreements.length&&<p>Unknown future forecast for {snapshot.unknownForecastAgreements.length} selected agreements; excluded from numeric effects.</p>}
            <p>{snapshot.basis}</p><ul>{snapshot.agreements.map((row:D)=><li key={row.id}>{snapshot.sources.find((source:D)=>source.kind==='agreement'&&source.id===row.id)?.value.name} · notice deadline {row.noticeDeadline}</li>)}</ul>
            <ScenarioSources scenario={scenario}/>
            <p className="quiet" style={{overflowWrap:'anywhere'}}>Exact scenario: {scenario.hash}</p>
            {owner?scenario.choices.agreementIds.filter((id:string)=>!consents.some((row:D)=>row.role==='owner'&&row.agreement===id)).map((id:string)=><Form key={id} label={'Approve owner scenario for '+snapshot.sources.find((row:D)=>row.kind==='agreement'&&row.id===id).value.name} onSubmit={b=>mutate('recurring-scenario-approve',{id:scenario.id,hash:scenario.hash,role:'owner',agreement:id,confirmed:b.confirmed==='on',reason:b.reason})}><Field label="Owner approval reason" name="reason"/><label><input type="checkbox" name="confirmed"/> I approve this exact scenario for this agreement.</label></Form>):<Form label="Approve finance scenario" onSubmit={b=>mutate('recurring-scenario-approve',{id:scenario.id,hash:scenario.hash,role:'finance',confirmed:b.confirmed==='on',reason:b.reason})}><Field label="Finance approval reason" name="reason"/><label><input type="checkbox" name="confirmed"/> I approve these exact scenario figures.</label></Form>}
            {owner&&<><p>Recorded approvals: {consents.filter((row:D)=>row.role==='owner').length} agreement owners · {consents.some((row:D)=>row.role==='finance')?'finance approved':'finance pending'}. Changed sources or authority block drafting.</p>{draft?<><h4>Nonbinding {draft.kind}</h4><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{draft.text}</pre></>:<Form label="Draft nonbinding brief" onSubmit={()=>mutate('recurring-scenario-draft',{id:scenario.id,hash:scenario.hash})}><p>Requires all exact approvals. A person reviews and sends separately.</p></Form>}</>}
        </section>;})}
    </section>;
}
