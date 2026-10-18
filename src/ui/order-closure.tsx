import { Form, Field, options, when, type D } from './shared';

export function OrderClosure({ order, closures, mutate }: { order: D; closures: D[]; mutate: (op: string, b: D) => Promise<any> }) {
    const active = closures.filter(c => c.active);
    return <section><h4>Close or reopen a balance</h4>
        <p>Close locally with a reason to release the remaining commitment. No supplier cancellation is sent.</p>
        {order.status === 'issued' && <Form key={`close-${order.closureVersion ?? 0}`} label="Close PO balance" initial={{ id: order.id, version: order.closureVersion ?? 0 }} onSubmit={b => mutate('close-order', b)}>
            <Field label="Line to close" name="line" required={false} options={options(order.lines, 'description')}/>
            <Field label="Quantity to close" name="quantity" required={false}/>
            <p>Leave both blank to close all outstanding lines; select a line with no quantity to close that line.</p>
            <Field label="Closure reason" name="reason"/>
        </Form>}
        {active.length > 0 && <Form key={`reopen-${order.closureVersion}`} label="Reopen PO balance" initial={{ id: order.id, version: order.closureVersion }} onSubmit={b => mutate('reopen-order', b)}>
            <Field label="Balance to reopen" name="closure" required={false} options={active.map(c => ({ value: c.id, label: c.reason }))}/>
            <p>Leave blank to reopen every closed balance. Current approval and available budget are checked.</p>
            <Field label="Reopen reason" name="reason"/>
        </Form>}
        <ul className="ruled-list">{closures.map(c => <li key={c.id}>{c.active ? 'Closed' : 'Reopened'} · {c.reason} · {when(c.at)}{c.reopenReason && <> · {c.reopenReason} · {when(c.reopenedAt)}</>}</li>)}</ul>
    </section>;
}
