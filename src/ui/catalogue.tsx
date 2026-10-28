import { CatalogueAccessFields, accessInput } from './catalogue-access';
import { useState } from 'react';
import { call, Form, Field, Table, Chip, options, money, amountText, calendarDay, type D } from './shared';

const cataloguePreview = (csv: string) => call('catalogue-import/preview', { csv });
const csv = (value: string) => value.split(',').map(s => s.trim()).filter(Boolean);
export function Catalogue({ data, mutate }: { data: D; mutate: (op: string, b: D) => Promise<any> }) {
    const [selected, setSelected] = useState<D>();
    const business = data.business[0] ?? {};
    return <><h2 className="page-title">Approved catalogue</h2>{data.mayManageSupplierRegister && <p><a href="/app?tab=Settings#catalogue-import">Import hosted catalogue CSV in Settings</a></p>}
        <Table heads={['Item / service', 'Supplier', 'Reference price', 'Validity', 'Status']} figures={['Reference price']}>
            {data.catalogue.map((c: D) => <tr key={c.id}><td>{c.description}<br/>{c.partNumber} · {c.unit ?? 'each'}</td><td>{data.supplier.find((s: D) => s.id === c.supplier)?.name}</td><td className="figure">{money(c.unitMinor, c.currency)}</td><td>{c.validFrom ? calendarDay(c.validFrom) : 'No start'} – {c.validUntil ? calendarDay(c.validUntil) : 'No end'}</td><td><span className="cell-with-action"><Chip>{c.approved ? 'Approved' : 'Unapproved'}</Chip> {data.mayManageSupplierRegister&&<button onClick={() => setSelected(c)}>Edit item</button>}</span></td></tr>)}
        </Table>
        {data.mayManageSupplierRegister&&<Form key={selected?.id ?? 'new'} initial={{ id: selected?.id }} label="Save catalogue item" onSubmit={b => mutate('catalogue', { ...b, approved: b.approved === 'true', access: accessInput(b), requiredAttachments: csv(b.requiredAttachments) })}>
            <Field label="Item or service description" name="description" defaultValue={selected?.description}/>
            <Field label="Supplier" name="supplier" defaultValue={selected?.supplier} options={options(data.supplier)}/>
            <Field label="Supplier part number" name="partNumber" required={false} defaultValue={selected?.partNumber}/>
            <Field label="Unit" name="unit" defaultValue={selected?.unit ?? 'each'}/>
            <Field label="Currency" name="currency" defaultValue={selected?.currency ?? 'USD'}/>
            <Field label="Reference price" name="unitAmount" defaultValue={amountText(selected?.unitMinor)}/>
            <Field label="Price valid from" name="validFrom" type="date" required={false} defaultValue={selected?.validFrom}/>
            <Field label="Price valid until" name="validUntil" type="date" required={false} defaultValue={selected?.validUntil}/>
            <Field label="Category" name="category" defaultValue={selected?.category}/>
            {(['project', 'location', 'costCentre'] as const).map(name => <Field key={name} label={'Default ' + ({ project: 'project', location: 'location', costCentre: 'cost centre' })[name]} name={name} required={false} defaultValue={selected?.[name]} options={(business[({ project: 'projects', location: 'locations', costCentre: 'costCentres' })[name]] ?? []).map((value: string) => ({ value, label: value }))}/>)}
            <Field label="Required attachment filenames (comma separated)" name="requiredAttachments" required={false} defaultValue={selected?.requiredAttachments?.join(', ')}/>
            <CatalogueAccessFields access={selected?.access}/><Field label="Approved" name="approved" defaultValue={selected?.approved === false ? 'false' : 'true'} options={[{ value: 'true', label: 'Approved' }, { value: 'false', label: 'Unapproved' }]}/>
        </Form>}{selected && <button onClick={() => setSelected(undefined)}>Add another catalogue item</button>}
        <CatalogueBundles data={data} mutate={mutate}/>
    </>;
}
function CatalogueBundles({ data, mutate }: { data: D; mutate: (op: string, b: D) => Promise<any> }) {
    const [selected, setSelected] = useState<D>();
    const [items, setItems] = useState<D[]>([{ catalogue: '', quantity: '1' }]);
    const edit = (bundle?: D) => { setSelected(bundle); setItems(bundle?.items ?? [{ catalogue: '', quantity: '1' }]); };
    return <section className="panel"><h3>Catalogue bundles</h3>
        <Table heads={['Bundle', 'Items', 'Status', '']}>{(data.catalogueBundle ?? []).map((b: D) => <tr key={b.id}><td>{b.name}</td><td>{b.items.map((i: D) => (data.catalogue.find((c: D) => c.id === i.catalogue)?.description ?? i.catalogue) + ' × ' + i.quantity).join('; ')}</td><td><Chip>{b.approved ? 'Approved' : 'Unapproved'}</Chip></td><td>{data.mayManageSupplierRegister&&<button onClick={() => edit(b)}>Edit bundle</button>}</td></tr>)}</Table>
        {data.mayManageSupplierRegister&&<Form key={selected?.id ?? 'new'} initial={{ id: selected?.id }} label="Save catalogue bundle" onSubmit={b => mutate('catalogue-bundle', { ...b, approved: b.approved === 'true', access: accessInput(b), items })}>
            <Field label="Bundle name" name="name" defaultValue={selected?.name}/>
            <Field label="Bundle approved" name="approved" defaultValue={selected?.approved === false ? 'false' : 'true'} options={[{ value: 'true', label: 'Approved' }, { value: 'false', label: 'Unapproved' }]}/>
            <CatalogueAccessFields access={selected?.access}/><fieldset className="wide"><legend>Bundle items</legend>{items.map((item, i) => <div className="line" key={i}>
                <label>Bundle item<select aria-label={'Bundle item ' + (i + 1)} required value={item.catalogue} onChange={e => setItems(items.map((x, n) => i === n ? { ...x, catalogue: e.target.value } : x))}><option value="">Choose…</option>{options(data.catalogue, 'description').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                <label>Bundle quantity<input aria-label={'Bundle quantity ' + (i + 1)} required value={item.quantity} inputMode="decimal" onChange={e => setItems(items.map((x, n) => i === n ? { ...x, quantity: e.target.value } : x))}/></label>
                {items.length > 1 && <button type="button" onClick={() => setItems(items.filter((_, n) => i !== n))}>Remove bundle item</button>}
            </div>)}<button type="button" onClick={() => setItems([...items, { catalogue: '', quantity: '1' }])}>Add bundle item</button></fieldset>
        </Form>}{selected && <button onClick={() => edit()}>Add another bundle</button>}
    </section>;
}

export function CatalogueImport({ data, mutate }: { data: D; mutate: (op: string, b: D) => Promise<any> }) {
    const [review, setReview] = useState<D>(), [result, setResult] = useState<D>();
    return <section id="catalogue-import" className="panel" aria-label="Catalogue import"><h2>Hosted catalogue CSV</h2>
        <p>Load prices for existing active suppliers. Use supplier IDs from the list below and exact supplier SKUs. Review each currency and validity period before writing. Existing item access and required files are preserved.</p>
        <p>Required columns: supplierId, sku, currency, description, unit, unitPrice, category, validFrom, validUntil. Optional columns: project, location, costCentre. Dates use YYYY-MM-DD; prices use a decimal point. Limit: 500 rows and 1 MB.</p>
        <details className="disclosure"><summary>Supplier IDs for import</summary><Table heads={['Supplier', 'Exact supplier ID']}>{data.supplier.filter((supplier: D) => ['active', 'preferred'].includes(supplier.status) && !supplier.mergedInto).map((supplier: D) => <tr key={supplier.id}><td>{supplier.name}</td><td>{supplier.id}</td></tr>)}</Table></details>
        <Form label="Preview catalogue import" onSubmit={async b => {
            setReview(undefined); setResult(undefined);
            const file = b.file as File;
            if (file.size > 1000000) throw Error('Choose a catalogue CSV of at most 1 MB');
            const csv = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
            setReview({ csv, ...await cataloguePreview(csv) });
        }}><label className="field">Catalogue CSV file<input type="file" name="file" accept=".csv,text/csv" required onChange={() => { setReview(undefined); setResult(undefined); }}/></label></Form>
        {review && <section aria-label="Reviewed catalogue prices"><h3>Review catalogue prices</h3><p>{review.changes} changed items. No catalogue item has been written.</p>
            <Table heads={['Supplier and SKU', 'Item', 'Current price', 'Imported price', 'Validity', 'Availability']} figures={['Current price', 'Imported price']}>
                {review.rows.map((row: D) => <tr key={row.row}><td>{row.supplierName}<br/>{row.next.partNumber}</td><td>{row.next.description}<br/>{row.next.unit} · {row.next.category}</td><td>{row.before ? money(row.before.unitMinor, row.before.currency) : 'New item'}</td><td>{money(row.next.unitMinor, row.next.currency)}</td><td>{calendarDay(row.next.validFrom)} – {calendarDay(row.next.validUntil)}</td><td>{row.availability}</td></tr>)}
            </Table><Form key={review.fingerprint} label="Commit reviewed catalogue" onSubmit={async b => {
                if (b.consent !== 'on') throw Error('Confirm the reviewed prices');
                const outcome = await mutate('catalogue-import-commit', { csv: review.csv, fingerprint: review.fingerprint, review: review.review, consent: true });
                setResult(outcome); setReview(undefined);
            }}><label className="field"><span><input type="checkbox" name="consent" required/> I reviewed these supplier identities, prices, currencies and validity dates</span></label></Form>
        </section>}
        {result && <p role="status">Catalogue import complete: {result.changes} changed items.</p>}
    </section>;
}
