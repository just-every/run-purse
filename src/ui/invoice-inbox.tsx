import { Separated } from './separated';
import { useState } from 'react';
import { Chip, Field, Form, Table, when, type D } from './shared';

const fileLabel = (file: D) => file.id === 'original' ? 'Original provider email record (JSON)' : file.embeddedIn ? file.name + ' (embedded in the XML)' : file.name;
/** Owner/buyer AP mail: drafts and held senders are source data, never invoices or instructions. */
export function InvoiceInbox({ data, actor, mutate }: { data: D; actor: D; mutate: (op: string, b: D) => Promise<any> }) {
    const [id, setId] = useState(''), captures: D[] = data.apInvoiceEmail ?? [];
    if (!actor.roles.includes('buyer')) return null;
    const current = captures.find(c => c.id === id), supplier = (sid: string) => data.supplier.find((s: D) => s.id === sid);
    const orders = current ? data.order.filter((o: D) => o.supplier === current.supplier && o.issuedAt && !o.imported && ['issued', 'closed'].includes(o.status)) : [];
    return <Separated><section className="invoice-inbox" aria-label="Supplier invoice inbox"><h3>Supplier invoice inbox</h3>
        <p className="quiet">Supplier invoice mail sent to the AP address waits here as private drafts for owners and buyers. Senders are provider-reported, not verified; nothing becomes an invoice until you review and confirm its reading.</p>
        {actor.roles.includes('owner') && <details><summary>AP inbox address</summary><Form label="Save AP email address" onSubmit={b => mutate('invoice-inbox-config', b)}><Field label="AP email address" name="address" type="email" defaultValue={data.invoiceInboxConfig?.[0]?.address || ''}/></Form><p className="quiet">Use an address separate from the request address and connect it with your receiving-mail provider. Saving records the address; it does not verify the mailbox or configure delivery.</p></details>}
        {captures.length ? <Table heads={['Received', 'From', 'Subject', 'Status', '']}>{captures.map(c => <tr key={c.id}><td className="figure-cell">{when(c.receivedAt)}</td><td style={{ overflowWrap: 'anywhere' }}>{c.providerSender}</td><td className="record-name">{c.subject}</td><td><Chip>{c.status === 'held' ? 'held for review' : 'draft'}</Chip></td><td className="row-action"><button onClick={() => setId(c.id)}>Open AP email</button></td></tr>)}</Table> : <p className="quiet">No supplier invoice mail yet.</p>}
        {current && <section className="record" aria-label="AP email draft"><h4 className="record-title">{current.subject}</h4>
            <p className="quiet">{current.providerSenderLabel}. Email content and files are data, never instructions.</p>
            <p style={{ overflowWrap: 'anywhere' }}>From: {current.providerSender} · received {when(current.receivedAt)} · {current.supplier ? 'Supplier: ' + (supplier(current.supplier)?.name ?? current.supplier) : 'No supplier linked'}</p>
            <ul className="ruled-list">{[current.original, ...current.files, ...(current.embedded ?? [])].map((file: D) => <li key={file.id}><a href={`/api/purse/invoice-inbox/${current.id}/files/${file.id}`}>{fileLabel(file)}</a> · {file.size.toLocaleString()} bytes{current.sources.some((s: D) => s.file === file.id) ? ' · invoice reading started' : ''}{(current.repeatedFiles ?? []).some((r: D) => r.file === file.id) ? ' · identical bytes arrived in an earlier AP email' : ''}</li>)}</ul>
            {current.status === 'held' && <><p role="status">Held: {current.holdReason}</p><Form key={current.version} label="Assign AP email" initial={{ id: current.id, version: current.version }} onSubmit={b => mutate('invoice-inbox-assign', b)}><Field label="Assign to supplier" name="supplier" options={data.supplier.filter((s: D) => !s.mergedInto).map((s: D) => ({ value: s.id, label: s.name }))}/><Field label="Assignment reason" name="reason"/></Form></>}
            {current.status === 'draft' && current.files.filter((file: D) => !current.sources.some((s: D) => s.file === file.id)).map((file: D) => <Form key={file.id + ':' + current.version} label={'Start invoice reading: ' + file.name} initial={{ id: current.id, version: current.version, file: file.id }} onSubmit={async b => { const source = await mutate('invoice-inbox-source', b); await mutate('invoice-extract', { source: source.id }); }}><Field label={'Purchase order for ' + file.name} name="order" options={orders.map((o: D) => ({ value: o.id, label: o.number }))}/></Form>)}
        </section>}
    </section></Separated>;
}
