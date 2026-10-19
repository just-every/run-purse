import { Form, Field, Table, type D } from './shared';

export function DuplicateSupplierReview({ review, input, mutate, onSaved, onOpen }: {
    review: D; input: D; mutate: (op: string, b: D) => Promise<any>; onSaved: (supplier: D) => void; onOpen: (id: string) => void | Promise<void>;
}) {
    return <section className="panel"><h3>Possible duplicate suppliers</h3>
        <p>No supplier was created. Review these possible matches for {input.name}. A match is a reason to review, and does not prove the suppliers are the same.</p>
        <Table heads={['Supplier', 'Status', 'Matched fields', '']}>{review.matches.map((m: D) => <tr key={m.id}><td>{m.name}</td><td>{m.status}{m.mergedInto ? ' · merged' : ''}</td><td>{m.reasons.join(', ')}</td><td><button onClick={() => onOpen(m.mergedInto ?? m.id)}>Open existing supplier</button></td></tr>)}</Table>
        <Form label="Create separate supplier after review" onSubmit={async b => { const supplier = await mutate('supplier', { ...input, duplicateFingerprint: review.fingerprint, duplicateReason: b.reason }); onSaved(supplier); }}>
            <Field label="Why these are separate suppliers" name="reason" type="textarea"/>
        </Form>
    </section>;
}
