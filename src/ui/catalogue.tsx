import { CatalogueAccessFields, accessInput } from './catalogue-access';
import { useState } from 'react';
import { Form, Field, Table, Chip, options, money, amountText, calendarDay, type D } from './shared';

const csv = (value: string) => value.split(',').map(s => s.trim()).filter(Boolean);
export function Catalogue({ data, mutate }: { data: D; mutate: (op: string, b: D) => Promise<any> }) {
    const [selected, setSelected] = useState<D>();
    const business = data.business[0] ?? {};
    return <><h2 className="page-title">Approved catalogue</h2>
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
