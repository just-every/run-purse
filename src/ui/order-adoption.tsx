import { useState } from 'react';
import { Details, Field, Form, Table, money, options, when, type D } from './shared';

export function OrderAdoption({ order, data, actor, mutate }: { order: D; data: D; actor: D; mutate: (op: string, input: D) => Promise<any> }) {
    const [review, setReview] = useState<D>(), [input, setInput] = useState<D>();
    const adoption = (data.orderAdoption ?? []).find((record: D) => record.order === order.id);
    if (order.adoptionBasis) return <section aria-label="Imported order adoption"><h4>Adopted open purchase order</h4><p>{order.adoptionBasis}. Original PO reference: {order.number}. Supplier messages were not sent on adoption.</p>
        {adoption && <><p>Adopted {when(adoption.at)} · {adoption.actor} · {adoption.reason}</p><p>Source approval: {adoption.sourceApproval.status} · {adoption.sourceApproval.evidence || 'Evidence not recorded'}. Later amendments and cancellations need current native approval.</p></>}
        {order.depositPosition && <p>Imported prepaid deposits {money(order.depositPosition.amountMinor, order.currency)} · applied {money(order.depositPosition.appliedMinor, order.currency)} · unapplied {money(order.depositPosition.unappliedMinor, order.currency)}. Source payment evidence is recorded, not independently verified.</p>}
    </section>;
    if (!actor.roles.includes('owner') || !order.imported || order.status !== 'imported') return null;
    return <Details label="Adopt this imported open PO"><p>Review the original supplier approval, received and billed balances, prepaid deposits, coding and remaining budget commitment. Adoption enables receiving and invoice review under the original number. It records your custody without creating a native approval or sending supplier mail.</p>
        <Form key={order.id} label="Review adoption balances" onSubmit={async values => { setReview(undefined); setInput(values); setReview(await mutate('adopt-order-preview', { ...values, id: order.id })); }}>
            <Field label="Imported source budget" name="budget" required={Boolean(order.sourceBudget)} options={options((data.budget ?? []).filter((budget:D) => budget.currency === order.currency && (!order.sourceBudget || budget.sourceId === order.sourceBudget)))}/>
            <Field label="Adoption budget" name="policy" options={options(data.policy.filter((policy: D) => policy.active && policy.currency === order.currency))}/>
            <Field label="Adoption location" name="location" defaultValue={order.location || ''} options={data.business[0].locations.map((value: string) => ({ value, label: value }))}/>
            <Field label="Adoption department" name="costCentre" defaultValue={order.costCentre || ''} options={data.business[0].costCentres.map((value: string) => ({ value, label: value }))}/>
            <Field label="Adoption receiver" name="receiver" options={options(data.receivers)}/>
        </Form>
        {review && <section aria-label="Reviewed adoption balances"><p>{review.number} · remaining commitment {money(review.remainingMinor, review.currency)} · imported bills {money(review.billedMinor, review.currency)} · unapplied deposits {money(review.unappliedDepositMinor, review.currency)}</p>
            <Table heads={['Line', 'Ordered', 'Received', 'Billed']}>{review.lines.map((line: D) => <tr key={line.line}><td>{order.lines.find((item: D) => item.id === line.line)?.description}</td><td>{line.ordered / 1000}</td><td>{line.received / 1000}</td><td>{line.billed / 1000}</td></tr>)}</Table>
            <p>Mapped budget {money(review.budgetMinor, review.currency)} · source {review.budget || 'Current native budget; no imported source supplied'}</p><p>Historical approval: {review.sourceApproval.status} · {review.sourceApproval.evidence || 'Not recorded'}. Imported bills require source confirmation and current risk review before a new cash-planning approval.</p>
            <Form label="Adopt reviewed open PO" onSubmit={values => mutate('adopt-order', { ...input, id: order.id, fingerprint: review.fingerprint, reviewed: values.reviewed === 'yes', reason: values.reason })}>
                <label className="field"><span><input type="checkbox" name="reviewed" value="yes" required/> I reviewed the source balances, approval evidence and budget mapping</span></label><Field label="Adoption reason" name="reason"/>
            </Form>
        </section>}
    </Details>;
}
