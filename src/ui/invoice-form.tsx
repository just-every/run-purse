import { Details, Form, Field, options, type D } from './shared';
export function InvoiceForm({ order, mutate }: { order: D; mutate: (op: string, b: D) => Promise<any> }) {
    return <Details label="Add invoice evidence"><Form label="Save invoice evidence" initial={{ order: order.id }} onSubmit={async b => {
        const file = b.invoiceFile as File;
        let document;
        if (file?.name) { const bytes = new Uint8Array(await file.arrayBuffer()); let raw = ''; for (const byte of bytes) raw += String.fromCharCode(byte); document = { name: file.name, mediaType: file.type || 'application/octet-stream', base64: btoa(raw) }; }
        return mutate('invoice', { order: b.order, reference: b.reference, source: b.source, ...(b.release ? {release:b.release}:{}), ...(b.invoiceDate ? { invoiceDate: b.invoiceDate } : {}),
            ...(b.senderEmail ? { senderEmail: b.senderEmail } : {}), ...(b.bankRouting || b.bankAccount ? { remit: { bankRouting: b.bankRouting, bankAccount: b.bankAccount } } : {}), ...(document ? { document } : {}),
            ...(b.depositAppliedAmount ? { depositAppliedAmount: b.depositAppliedAmount } : {}), allocations: [{ line: b.line, quantity: b.quantity, amount: b.amount }] });
    }}>{order.releasePosition?.releases?.length>0&&<Field label="Blanket release (optional)" name="release" required={false} options={[{value:'',label:'Unallocated blanket authority'},...order.releasePosition.releases.filter((r:D)=>!r.closed).map((r:D)=>({value:r.id,label:r.reference}))]}/>}<Field label="Invoice reference" name="reference"/><Field label="Evidence source" name="source"/><Field label="PO line" name="line" options={options(order.lines, 'description')}/><Field label="Invoice quantity" name="quantity"/><Field label="Invoice amount" name="amount"/>
        {order.depositPosition?.unappliedMinor > 0 && <Field label="Imported deposit credit applied to this invoice" name="depositAppliedAmount" required={false}/>}
        <Field label="Invoice document date" name="invoiceDate" type="date" required={false}/><Field label="Recorded sender email (unverified)" name="senderEmail" type="email" required={false}/>
        <Field label="Invoice remit routing number (matching only)" name="bankRouting" required={false}/><Field label="Invoice remit account (matching only)" name="bankAccount" required={false}/>
        <label className="field">Original invoice document · up to 1 MB<input type="file" name="invoiceFile"/></label>
        <p className="quiet">Optional source facts are buyer recorded. No sender authentication or bank verification is claimed. Structured bank digits are compared in memory and discarded. Original documents retain their uploaded contents; omitted document dates use today’s UTC entry date.</p>
    </Form></Details>;
}
