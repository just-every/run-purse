import { useState } from 'react';
import { Details, Field, Form, Table, money, amountText, type D } from './shared';

export function DepositTermFields({ term }: { term?: D }) {
    const [basis, setBasis] = useState(term?.basis ?? '');
    return <fieldset className="wide"><legend>Structured deposit</legend>
        <label className="field">Deposit basis<select aria-label="Deposit basis" name="depositBasis" value={basis} onChange={event => setBasis(event.target.value)}>
            <option value="">No structured deposit</option><option value="amount">Fixed amount</option><option value="percentage">Percentage of PO total</option>
        </select></label>
        {basis && <>{basis === 'amount' ? <Field label="Deposit amount" name="depositAmount" defaultValue={amountText(term?.amountMinor)}/>
            : <Field label="Deposit percentage" name="depositPercentage" defaultValue={term?.percentageBps == null ? '' : String(term.percentageBps / 100)}/>}
            <Field label="Deposit due trigger" name="depositTrigger" defaultValue={term?.trigger ?? 'issue'} options={[{ value: 'issue', label: 'On issue' }, { value: 'date', label: 'Explicit date' }]}/>
            <Field label="Deposit due date" name="depositDate" type="date" required={false} defaultValue={term?.dueDate ?? ''}/>
            <p>One term for this goods PO. Prepaid account mapping and ledger posting are unavailable. Changes require renewed purchase approval.</p></>}
    </fieldset>;
}
export const depositTermInput = (body: D) => !body.depositBasis ? null : {
    basis: body.depositBasis, ...(body.depositBasis === 'amount' ? { amount: body.depositAmount } : { percentage: body.depositPercentage }),
    trigger: body.depositTrigger, ...(body.depositTrigger === 'date' ? { dueDate: body.depositDate } : {}),
};

export function Deposits({ order, data, mutate }: { order: D; data: D; mutate: (op: string, b: D) => Promise<any> }) {
    const term = order.poDetails?.deposit, position = order.nativeDepositPosition;
    if (!term) return null;
    const invoices = data.invoice.filter((invoice: D) => invoice.order === order.id && invoice.depositKind);
    return <section aria-label="Deposit position"><h4>Deposit and final billing</h4>
        <p>{term.basis === 'percentage' ? term.percentageBps / 100 + '% · ' : ''}{money(term.amountMinor, order.currency)} · {term.trigger === 'issue' ? 'Due on issue' : 'Due ' + term.dueDate}</p>
        <p>Prepaid account unmapped · ledger posting unavailable.</p>
        {position && <><p>Approved deposit {money(position.approvedMinor, order.currency)} · Applied {money(position.appliedMinor, order.currency)} · Unapplied {money(position.unappliedMinor, order.currency)}</p>
            <p>Approval consent {position.enabled ? 'enabled' : 'off or held'}. Deposit application leaves the separate deposit payable outstanding until genuine settlement evidence exists.</p>
            <Table heads={['Invoice', 'Kind', 'Gross', 'Applied', 'Net payable', 'Approval']} figures={['Gross', 'Applied', 'Net payable']}>
                {invoices.map((invoice: D) => <tr key={invoice.id}><td><a href={'#invoice-' + invoice.id}>{invoice.reference}</a></td><td>{invoice.depositKind === 'deposit' ? 'Deposit obligation' : 'Final goods bill'}</td>
                    <td>{money(invoice.grossMinor ?? invoice.totalMinor, invoice.currency)}</td><td>{money(invoice.depositAppliedMinor ?? 0, invoice.currency)}</td><td>{money(invoice.totalMinor, invoice.currency)}</td>
                    <td>{invoice.paymentApproval ? invoice.depositEligible ? 'Approved' : 'Historical approval held' : 'Awaiting eligible source and consent'}</td></tr>)}
            </Table>
            {invoices.filter((invoice: D) => invoice.mayEvaluateDeposit).map((invoice: D) => <Details key={invoice.id} label={'Evaluate ' + invoice.reference}>
                <Form label="Evaluate reviewed deposit bill" onSubmit={() => mutate('deposit-evaluate', { invoice: invoice.id, termKey: position.termKey, ruleVersion: position.ruleVersion, documentSha256: invoice.document.sha256 })}>
                    <p>{invoice.reference}: recheck the exact source, current owner consent, holds and full goods receipt for a final bill.</p>
                </Form>
            </Details>)}</>}
    </section>;
}

export function DepositSettings({ data, mutate }: { data: D; mutate: (op: string, b: D) => Promise<any> }) {
    const orders = data.order.filter((order: D) => order.poDetails?.deposit && order.status === 'issued' && !order.amendedBy);
    return <section className="panel" aria-label="Deposit approval settings"><h3>Deposit approval rules</h3>
        <p>Automatic approval is off until you consent to one exact issued term. Eligible source-confirmed deposits match without receiving goods. Final bills require full receipt and apply the approved deposit once.</p>
        {!orders.length && <p>No issued purchase orders have structured deposit terms.</p>}
        {orders.map((order: D) => {
            const position = order.nativeDepositPosition, rule = data.depositRule.find((row: D) => row.order === order.id);
            return <Details key={order.id} label={order.number + ' deposit consent'}><p>{money(order.poDetails.deposit.amountMinor, order.currency)} · Version {rule?.version ?? 0} · {position?.enabled ? 'Enabled' : 'Off or held'}</p>
                <Form key={rule?.version ?? 0} label="Save deposit approval consent" onSubmit={body => mutate('deposit-rule', { order: order.id, revision: order.revision,
                    version: rule?.version ?? 0, termKey: position.termKey, enabled: body.enabled === 'true', consent: body.consent === 'yes', reason: body.reason })}>
                    <Field label="Deposit approval rule" name="enabled" defaultValue={position?.enabled ? 'true' : 'false'} options={[{ value: 'false', label: 'Off' }, { value: 'true', label: 'Approve exact eligible originals' }]}/>
                    <label className="field"><span><input type="checkbox" name="consent" value="yes" aria-label="I consent to this exact deposit approval rule" required/> I consent to this exact deposit approval rule</span></label>
                    <Field label="Deposit consent reason" name="reason"/>
                </Form></Details>;
        })}
    </section>;
}
