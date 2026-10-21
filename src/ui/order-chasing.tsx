import { useState } from 'react';
import { Form, Field, Table, call, when, type D } from './shared';

export function OrderChasing({ order, data, actor, mutate, reload }: { order: D; data: D; actor: D; mutate: (op: string, b: D) => Promise<any>; reload: () => Promise<void> }) {
    const [notice, setNotice] = useState('');
    const policy = data.orderChasePolicy.find((p: D) => p.order === order.id);
    const events = data.orderChaseEvent.filter((e: D) => e.order === order.id);
    const evidence = data.orderChaseEvidence.find((e: D) => e.order === order.id);
    return <section className="panel"><h3>Supplier follow-up</h3>
        {evidence ? <><p>Supplier promise: {evidence.promisedDate}. Acknowledgment: {evidence.acknowledgedAt ? when(evidence.acknowledgedAt) : 'not recorded'}.</p><details><summary>Buyer-recorded supplier replies and promises</summary><ul className="ruled-list">{evidence.history.map((h: D) => <li key={h.version}>{when(h.at)} · {h.source} · promised {h.promisedDate}{h.acknowledgedAt && <> · acknowledged {when(h.acknowledgedAt)}</>}</li>)}</ul></details></> : <p>No supplier acknowledgment or promise has been recorded. Issuance alone is not an acknowledgment.</p>}
        {order.mayManagePurchasing && ['issued', 'closed'].includes(order.status) && !order.imported && <>
            <Form key={policy?.version ?? 0} label="Save chase schedule" initial={{ order: order.id, version: policy?.version ?? 0 }} onSubmit={b => mutate('order-chase-policy', { ...b, enabled: b.enabled === 'yes', cadenceDays: Number(b.cadenceDays), maxChases: Number(b.maxChases) })}>
                <Field label="Automatic supplier chases" name="enabled" defaultValue={policy?.enabled ? 'yes' : 'no'} options={[{ value: 'yes', label: 'Enabled' }, { value: 'no', label: 'Paused' }]}/>
                <Field label="Days between chase attempts" name="cadenceDays" type="number" defaultValue={policy?.cadenceDays ?? 3}/>
                <Field label="Chase attempt limit before escalation" name="maxChases" type="number" defaultValue={policy?.maxChases ?? 3}/>
                <Field label="Escalation buyer email" name="escalateTo" type="email" defaultValue={policy?.escalateTo ?? actor.email}/>
                <p className="quiet">Use an active buyer, or your own address as owner. Each saved schedule starts a new attempt limit. Chases use the approved PO contact. Closed balances and current supplier holds stop follow-up. Cadence days are elapsed 24-hour periods; overdue dates use America/New_York.</p>
            </Form>
            <button onClick={async () => { try { await call('order-chases', {}); await reload(); setNotice('Due attempts processed. Check each outcome below.'); } catch (e) { setNotice((e as Error).message); } }}>Process due supplier chases</button>
            <p role="status">{notice}</p>
        </>}
        <Table heads={['When', 'Action', 'Reason', 'Recipient', 'Outcome']}>
            {events.map((e: D) => <tr key={e.id}><td>{when(e.at)}</td><td>{e.kind === 'chase' ? `Chase attempt ${e.sequence}` : 'Buyer escalation'}</td><td>{e.reason.replaceAll('-', ' ')}</td><td>{e.outcome.recipient || 'Contact not configured'}</td><td>{e.outcome.status === 'development' ? 'Suppressed locally' : e.outcome.status === 'accepted' ? 'Provider accepted; delivery unconfirmed' : e.outcome.status}</td></tr>)}
        </Table>
        <p className="quiet">Every attempt retains its outcome. An interrupted attempt stays unknown and is not sent again. Supplier replies shown here are recorded by a buyer. Check your usual email inbox for new replies.</p>
    </section>;
}
