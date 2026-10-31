import { useEffect, useState } from 'react';
import { InvoiceExceptionAgent } from './invoice-exception-agent';
import { Comments } from './comments';
import { call, Details, Field, Form, Table, money, when, type D } from './shared';

export function InvoiceExceptions({ data, mutate, openOrder }: { data: D; mutate: (op: string, b: D) => Promise<any>; openOrder: (id: string, target: HTMLButtonElement) => void }) {
    const [queue, setQueue] = useState<D[]>([]), [tasks, setTasks] = useState<D[]>([]), [error, setError] = useState('');
    useEffect(() => { let live = true; call('invoice-exceptions').then(r => { if (live) { setQueue(r.queue); setTasks(r.tasks); setError(''); } }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [data]);
    if (!queue.length && !tasks.length && !error) return null;
    return <>{tasks.length > 0 && <section aria-label="Assigned purchasing reviews"><h3>Assigned purchasing reviews</h3>
        <p>Your assignment uses your existing purchase access.</p>
        <ul className="ruled-list">{tasks.map(task => <li key={task.order}><p>{task.number} · {task.matchingStatus ?? 'Review purchase context'}</p>
            <button type="button" onClick={e => openOrder(task.order, e.currentTarget)}>Open assigned purchase</button></li>)}</ul>
    </section>}{(queue.length > 0 || error) && <section aria-label="Invoice exception work queue"><h3>Invoice exception work queue</h3>
        <p>Assignments use existing access. Clear matching context is ready for review; it does not approve a bill or payment.</p>
        {error && <p role="alert">{error}</p>}
        {queue.map(item => <section className="invoice" key={item.id} aria-label={'Exception ' + item.reference}>
            <h4>{item.reference} · {item.number}</h4>
            <p>First recorded {when(item.openedAt)} · {item.openedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(item.openedAt)) / 86400000)) + ' days old' : 'Original age unavailable'} · {item.status === 'open' ? 'Needs review' : 'Matching context clear'}</p>
            <p>Responsible member: {item.assigneeName}</p>{item.ageBasis !== 'Exception detected' && <p>{item.ageBasis}</p>}
            <button type="button" onClick={e => openOrder(item.currentOrder, e.currentTarget)}>Open receiving context</button>
            <Table heads={['Line', 'Ordered', 'Received', 'Invoiced', 'Price', 'Review']}>{item.context.map((c: D) => <tr key={c.lineId}>
                <td>{c.line}</td><td>{c.orderedQuantity}</td><td>{c.acceptedQuantity}</td><td>{c.invoiceQuantity}</td>
                <td>{money(c.invoiceMinor, c.currency)} against {money(c.expectedMinor, c.currency)}</td>
                <td>{[c.receiptShortfall && 'Receipt shortfall', c.quantityMismatch && 'Quantity mismatch', c.priceMismatch && 'Price difference', c.closedBalance && 'Closed balance', c.exception].filter(Boolean).join(' · ') || 'Clear'}</td>
            </tr>)}</Table>
            {item.mayAssign && <Details label={item.assignee ? 'Reassign exception' : 'Assign exception'}>
                <Form key={item.sourceVersion} label={item.assignee ? 'Save reassignment' : 'Save assignment'} initial={{ id: item.id, version: item.version, sourceVersion: item.sourceVersion }} onSubmit={b => mutate('assign-invoice-exception', b)}>
                    <Field label="Responsible member" name="assignee" options={item.candidates.map((m: D) => ({ value: m.id, label: m.name }))}/>
                    <Field label="Assignment reason" name="reason"/>
                </Form>
            </Details>}
            <Details label="Assignment history"><ul className="ruled-list">{item.history.map((e: D) => <li key={e.version}>Assignment {e.version} · {when(e.at)} · {e.reason}</li>)}</ul></Details>
            <InvoiceExceptionAgent item={item} data={data} mutate={mutate}/>
            <Comments kind="invoiceException" record={item.id} mutate={mutate}/>
        </section>)}
    </section>}</>;
}

export function ReceiptCorrections({ order, receipts, mutate }: { order: D; receipts: D[]; mutate: (op: string, b: D) => Promise<any> }) {
    const originals = receipts.filter(r => r.order === order.id && r.event === 'receive' && !r.imported && !r.correctionOf && !order.lines.find((l: D) => l.id === r.line)?.service);
    const [selected, setSelected] = useState('');
    if (!order.mayReceive || !['issued', 'adopted'].includes(order.status) || !originals.length) return null;
    const original = originals.find(r => r.id === selected) ?? originals[0];
    const beforeQ = original.q + receipts.filter(r => r.correctionOf === original.id).reduce((n, r) => n + r.correctionDelta, 0);
    return <section aria-label="Receipt corrections"><Details label="Correct a recorded receipt">
        <p>Keep the original and append the receiver’s reason. Corrected quantities update matching context and do not approve invoices.</p>
        <label className="field">Original receipt<select aria-label="Original receipt" value={original.id} onChange={e => setSelected(e.currentTarget.value)}>{originals.map(r => <option key={r.id} value={r.id}>{order.lines.find((l: D) => l.id === r.line)?.description} · {r.quantity} · {when(r.at)}</option>)}</select></label>
        <p>Currently recorded for this receipt: {beforeQ / 1000}</p>
        <Form key={order.receiptVersion + original.id} label="Record receipt correction" initial={{ receipt: original.id, expectedQ: beforeQ, receiptVersion: order.receiptVersion, attempt: crypto.randomUUID() }} onSubmit={b => mutate('receipt-correction', b)}>
            <Field label="Corrected receipt quantity" name="quantity" defaultValue={String(beforeQ / 1000)}/>
            <Field label="Receiver correction reason" name="reason"/>
        </Form>
    </Details></section>;
}
