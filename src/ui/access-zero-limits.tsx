import { useState } from 'react';
import { Form, type D } from './shared';
import { roleLabels, scopeSummary } from './access-ui';

const subjectKey = (subject: D) => JSON.stringify([subject.email, subject.grantIndex]);
export function ZeroBuyerLimits({ data, mutate, saved }: { data: D; mutate: (operation: string, input: D) => Promise<any>; saved: (message: string) => void }) {
    const [selected, select] = useState(''), [role, selectRole] = useState('buyer');
    const subjects: D[] = data.buyerZeroSubjects ?? [], subject = subjects.find(row => subjectKey(row) === selected);
    const roles = [{ id: 'buyer', name: roleLabels.buyer }, ...(data.accessRole ?? []).filter((row: D) => row.active !== false && row.permissions.includes('po.convert'))];
    return <section aria-label="Set buyer limits to zero"><h4>Set buyer limits to zero</h4>
        <p>Set dollar, price percentage and quantity allowances to zero for an existing buyer grant within your administrative scope. Decreases remain allowed. Other grants stay unchanged.</p>
        <Form label="Set buyer grant limits to zero" onSubmit={async () => {
            if (!subject) throw new Error('Choose an eligible buyer grant.');
            await mutate('buyer-zero-limit', { email: subject.email, grantIndex: subject.grantIndex });
            saved('Buyer grant limits set to zero and recorded in audit history. Other grants were retained.');
        }}>
            <label className="field">Buyer grant to zero<select aria-label="Buyer grant to zero" required value={selected} onChange={event => select(event.target.value)}>
                <option value="">Choose…</option>{subjects.map(row => <option key={subjectKey(row)} value={subjectKey(row)}>{row.name} · {row.email} · {roleLabels[row.role] ?? data.accessRole?.find((item: D) => item.id === row.role)?.name ?? row.role} · {scopeSummary(row.scope)}{row.roleScope ? ' · Role restriction: ' + scopeSummary(row.roleScope) : ''}</option>)}
            </select></label>
        </Form>
        {!subjects.length && <p>No buyer grants are fully covered by your administrative scope.</p>}
        {data.mayZeroBuyerRoleLimits && <Form label="Set buyer role limits to zero" onSubmit={async () => {
            await mutate('buyer-role-limit', { role, entity: 'main', limits: { absoluteMinor: 0, percent: 0, quantityPercent: 0 } });
            saved('Buyer role limits set to zero and recorded in audit history. Explicit person overrides still apply.');
        }}>
            <p className="wide">Unrestricted administrators can also zero a buyer role's defaults for the main business. Explicit person overrides still apply.</p>
            <label className="field">Buyer role to zero<select aria-label="Buyer role to zero" value={role} onChange={event => selectRole(event.target.value)}>{roles.map((row: D) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        </Form>}
    </section>;
}
