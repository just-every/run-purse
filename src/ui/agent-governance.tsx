import { useState } from 'react';
import { Field, Form, Table, when, type D } from './shared';

export function AgentGovernance({ data, mutate }: { data: D; mutate: (op: string, body: D) => Promise<any> }) {
    const [agent, setAgent] = useState('AGENT-003'), [type, setType] = useState('*');
    const policies = data.agentPolicy ?? [], current = policies.find((row: D) => row.agent === agent && row.purchaseType === type.trim().toLowerCase());
    const value = data.valuePolicy?.[0];
    return <section className="panel" aria-label="Agent controls"><h2>Agent controls</h2>
        <p>Owners enable each native agent for the approved form’s purchase type, or each line category when no form type is recorded. An exact type overrides the all-types setting. Pausing stops subsequent effects; an email already submitted retains its actual outcome.</p>
        <Table heads={['Agent', 'Purchase type', 'State', 'Supplier chase limits', 'Changed']}>
            {policies.map((row: D) => <tr key={row.id}><td>{row.agent === 'AGENT-003' ? 'Late-order follow-up' : row.agent === 'AGENT-002' ? 'Quote collection' : row.agent === 'AGENT-011' ? 'Spend questions' : 'Recurring spend'}</td><td>{row.purchaseType}</td><td>{row.enabled ? 'Enabled' : 'Paused'}</td><td>{row.agent === 'AGENT-003' ? `${row.maxChases} attempts · ${row.cadenceDays} days apart` : 'No supplier sends'}</td><td>{when(row.at)}</td></tr>)}
        </Table>
        <label className="field">Native agent<select aria-label="Native agent" value={agent} onChange={event => setAgent(event.target.value)}><option value="AGENT-002">Quote collection</option><option value="AGENT-003">Late-order follow-up</option><option value="AGENT-006">Recurring spend</option><option value="AGENT-011">Spend questions</option></select></label>
        <label className="field">Agent purchase type<input aria-label="Agent purchase type" value={type} onChange={event => setType(event.target.value)}/></label>
        <Form key={agent + ':' + type + ':' + (current?.version ?? 0)} label="Save agent controls" onSubmit={body => mutate('agent-policy', { agent, purchaseType: type, version: current?.version ?? 0,
            enabled: body.enabled === 'yes', cadenceDays: Number(body.cadenceDays), maxChases: Number(body.maxChases), reason: body.reason })}>
            <Field label="Agent state" name="enabled" defaultValue={current?.enabled ? 'yes' : 'no'} options={[{ value: 'yes', label: 'Enabled' }, { value: 'no', label: 'Paused' }]}/>
            <Field label="Minimum days between supplier chases" name="cadenceDays" type="number" defaultValue={current?.cadenceDays ?? 1}/>
            <Field label="Maximum supplier chase attempts" name="maxChases" type="number" defaultValue={current?.maxChases ?? 2}/>
            <Field label="Agent control reason" name="reason"/>
        </Form>
        <Form label="Pause this agent for every type" onSubmit={body => mutate('agent-pause', { agent, reason: body.reason })}><Field label="Pause reason" name="reason"/></Form>
        <p>Value realization: {value?.enabled ? 'Enabled' : 'Paused'}. Its owner controls, including purchase types, are on <a href="/app?tab=Value">Value realization</a>.</p>
        {value?.enabled && <Form label="Pause value realization" onSubmit={body => mutate('value-policy', { version: value.version, enabled: false, purchaseTypes: value.purchaseTypes ?? ['*'], reason: body.reason })}><Field label="Value pause reason" name="reason"/></Form>}
        <p className="quiet">Late follow-up also needs a buyer's exact PO schedule. Pausing or resuming the agent never resets that schedule's attempt count. Recurring spend produces proposals and human-send drafts only. Other agent executors are not connected.</p>
    </section>;
}
