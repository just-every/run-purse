import { useState } from 'react';
import { Details, Field, Form, Table, money, options, type D } from './shared';

export function CatalogueRequest({ data, mutate }: { data: D; mutate: (op: string, b: D) => Promise<any> }) {
    const [bundleId, setBundleId] = useState(''), [created, setCreated] = useState<D[]>([]);
    const business = data.business[0];
    const bundles = (data.catalogueBundle ?? []).filter((b: D) => b.requestable);
    const bundle = bundles.find((b: D) => b.id === bundleId);
    if (!business || !bundles.length) return null;
    return <Details label="Request a catalogue bundle">
        <Form label="Create bundle drafts" onSubmit={async b => { const result = await mutate('request-bundle', { ...b, bundle: bundleId }); setCreated(result.requests); }}>
            <label className="field">Catalogue bundle<select aria-label="Catalogue bundle" required value={bundleId} onChange={e => { setBundleId(e.target.value); setCreated([]); }}><option value="">Choose…</option>{options(bundles).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            <Field label="Bundle request title" name="title" required={false}/>
            <Field label="Bundle need date" name="needDate" type="date"/>
            {(['location', 'costCentre'] as const).map(name => <Field key={name} label={'Bundle ' + (name === 'location' ? 'location' : 'cost centre')} name={name} options={(business[name === 'location' ? 'locations' : 'costCentres'] ?? []).map((value: string) => ({ value, label: value }))}/>)}
            <Field label="Bundle project (blank uses each item's default)" name="project" required={false} options={(business.projects ?? []).map((value: string) => ({ value, label: value }))}/>
            <Field label="Bundle supplier-supplied terms" name="terms" type="textarea"/>
            {bundle && <div className="wide"><Table heads={['Item', 'Quantity', 'Price', 'Required files']}>{bundle.items.map((i: D) => { const c = data.catalogue.find((c: D) => c.id === i.catalogue); return <tr key={i.catalogue}><td>{c?.description}</td><td>{i.quantity} {c?.unit ?? 'each'}</td><td>{c && money(c.unitMinor, c.currency)}</td><td>{c?.requiredAttachments?.join(', ') || 'None'}</td></tr>; })}</Table></div>}
            <p className="quiet wide">One draft per supplier and currency. Upload required files and submit each draft for approval.</p>
        </Form>
        {created.length > 0 && <p role="status">Created {created.length} draft{created.length === 1 ? '' : 's'}: {created.map(r => r.title).join('; ')}. Open each in Requests to review and submit.</p>}
    </Details>;
}
