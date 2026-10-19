import { useState } from 'react';
import { Field, Form, Table, money, when, type D } from './shared';

const percent = (rate: number | null) => rate === null ? 'No measured records' : `${(rate * 100).toFixed(1)}%`;
const elapsed = (ms: number | null) => ms === null ? 'Unknown' : ms < 60000 ? `${(ms / 1000).toFixed(1)} seconds` : `${(ms / 3600000).toFixed(2)} hours`;
const po = (id: string, label: string) => <a href={`/api/purse/download/order/${id}`}>{label}</a>;
export function SupplierPerformance({ supplier, data, mutate }: { supplier: D; data: D; mutate: (op: string, input: D) => Promise<any> }) {
    const card = data.supplierScorecards?.find((s: D) => s.supplier === supplier.id);
    const issued = data.order.filter((o: D) => o.supplier === supplier.id && o.issuedAt && !o.imported);
    const [chosen, setChosen] = useState('');
    const order = issued.find((o: D) => o.id === chosen) ?? issued[0];
    const evidence = card?.orders.find((o: D) => o.orderId === order?.id)?.evidence;
    if (!card) return null;
    return <section className="panel"><h3>Supplier performance</h3>
        <details><summary>On-time deliveries · {card.delivery.onTime} on time / {card.delivery.measured} measured · {percent(card.delivery.rate)}</summary>
            <p>{card.delivery.basis}. {card.delivery.late} late; {card.delivery.unknownPromise} receipts without a recorded promise.</p>
            <Table heads={['Receipt / PO', 'Recorded receipt', 'Promised date', 'Result', 'Evidence']}>{card.delivery.rows.map((r: D) => <tr key={r.receiptId}><td>{r.receiptId}<br/>{po(r.orderId, r.orderNumber)}</td><td>{r.quantity} · {when(r.at)}</td><td>{r.promisedDate || 'Unknown'}</td><td>{r.onTime === null ? 'Not measured' : r.onTime ? 'On time' : 'Late'}</td><td>{r.reason}<br/>Promise version {r.evidenceVersion ?? '—'}</td></tr>)}</Table>
        </details>
        <details><summary>Quality · {card.quality.rejected} rejections / {card.quality.returned} returns</summary>
            <Table heads={['Receipt / PO', 'Event', 'Quantity', 'Recorded evidence']}>{card.quality.rows.map((r: D) => <tr key={r.receiptId}><td>{r.receiptId}<br/>{po(r.orderId, r.orderNumber)}</td><td>{r.event}</td><td>{r.quantity}</td><td>{r.reason}<br/>{when(r.at)}</td></tr>)}</Table>
        </details>
        <details><summary>Invoice accuracy · {card.invoiceAccuracy.exceptions} exception invoices / {card.invoiceAccuracy.total} invoices · {percent(card.invoiceAccuracy.rate)} without exceptions</summary>
            <p>Each invoice counts once, even when several allocations have discrepancies.</p>
            {card.invoiceAccuracy.rows.map((i: D) => <article key={i.invoiceId}><h4>{i.reference} · {money(i.amountMinor, i.currency)} · {i.exception ? 'Exception' : 'No match exceptions'}</h4><p>{i.source} · Invoice {i.invoiceId} · {po(i.orderId, 'Purchase order')}</p><Table heads={['PO line', 'Invoice quantity', 'Amount', 'Discrepancies']}>{i.allocations.map((l: D) => <tr key={l.lineId}><td>{l.lineId}</td><td>{l.quantity}</td><td>{money(l.invoiceMinor, i.currency)}</td><td>{[l.priceMismatch && 'Price', l.quantityMismatch && 'Quantity', l.receiptShortfall && 'Receipt shortfall', l.closedBalance && 'Closed balance'].filter(Boolean).join(', ') || 'None'}</td></tr>)}</Table></article>)}
        </details>
        <details><summary>Acknowledgment speed · {elapsed(card.acknowledgment.averageMs)} average · {card.acknowledgment.known} evidenced / {card.acknowledgment.unknown} unknown</summary>
            <p>{card.acknowledgment.basis}.</p>
            <Table heads={['PO', 'Recorded issuance', 'Acknowledgment', 'Elapsed / source']}>{card.acknowledgment.rows.map((r: D) => <tr key={r.orderId}><td>{po(r.orderId, r.orderNumber)}</td><td>{when(r.issuedAt)}</td><td>{when(r.acknowledgedAt)}</td><td>{elapsed(r.elapsedMs)}<br/>{r.source || 'No supplier evidence'}</td></tr>)}</Table>
        </details>
        {card.spend.map((s: D) => <details key={s.currency}><summary>{s.currency} spend · issued PO value {money(s.orderedCommittedMinor, s.currency)} / invoice evidence {money(s.invoicedEvidenceMinor, s.currency)}</summary><p>{card.spendBasis}</p><Table heads={['PO', 'Face value', 'Counted']}>{s.orders.map((o: D) => <tr key={o.orderId}><td>{po(o.orderId, o.number)}</td><td>{money(o.amountMinor, s.currency)}</td><td>{o.included ? 'Included' : o.excludedReason}</td></tr>)}</Table><Table heads={['Invoice', 'Amount', 'PO']}>{s.invoices.map((i: D) => <tr key={i.invoiceId}><td>{i.reference} · {i.invoiceId}</td><td>{money(i.amountMinor, s.currency)}</td><td>{po(i.orderId, 'Purchase order')}</td></tr>)}</Table></details>)}
        <details><summary>Supplier issues · {card.issues.open} open / {card.issues.resolved} resolved</summary>{card.issues.rows.map((issue: D) => <article key={issue.issueId}><h4>{issue.category.replace('-', ' ')} · {issue.status}</h4><p>{issue.description} · {po(issue.orderId, 'Purchase order')}<br/>{when(issue.at)} · {issue.issueId}</p>{issue.resolution ? <p>Resolution: {issue.resolution.reason} · {when(issue.resolution.at)}</p> : <Form label="Resolve issue" initial={{ id: issue.issueId }} onSubmit={b => mutate('resolve-supplier-issue', b)}><Field label="Resolution reason" name="reason"/></Form>}</article>)}</details>
        {issued.length > 0 && <>
            <h4>Record supplier communication</h4><p>Record the supplier's promised date and, when known, its actual acknowledgment time and source. Recording issuance alone never counts as acknowledgment.</p>
            <label className="field">Purchase order for communication<select aria-label="Purchase order for communication" value={order.id} onChange={e => setChosen(e.target.value)}>{issued.map((o: D) => <option key={o.id} value={o.id}>{o.number}</option>)}</select></label>
            <Form key={order.id + ':' + (evidence?.version ?? 0)} label="Save supplier communication" initial={{ order: order.id, version: evidence?.version ?? 0 }} onSubmit={b => mutate('supplier-order-evidence', b)}><Field label="Supplier-promised date" name="promisedDate" type="date" defaultValue={evidence?.promisedDate}/><Field label="Acknowledged at (ISO timestamp with time zone)" name="acknowledgedAt" required={false} defaultValue={evidence?.acknowledgedAt}/><Field label="Supplier communication source" name="source" type="textarea" defaultValue={evidence?.source}/></Form>
            {evidence && <details><summary>Supplier communication history · {order.number}</summary>{evidence.history.map((h: D) => <p key={h.version}>Version {h.version}: promised {h.promisedDate}; acknowledged {when(h.acknowledgedAt)}<br/>{h.source} · recorded {when(h.at)}</p>)}</details>}
            <h4>Record supplier issue</h4><Form label="Save supplier issue" initial={{ supplier: supplier.id }} onSubmit={b => mutate('supplier-issue', b)}><Field label="Issue purchase order" name="order" options={issued.map((o: D) => ({ value: o.id, label: o.number }))}/><Field label="Issue category" name="category" options={['late', 'damaged', 'wrong-item', 'billing'].map(value => ({ value, label: value.replace('-', ' ') }))}/><Field label="Issue description" name="description" type="textarea"/></Form>
        </>}
    </section>;
}
