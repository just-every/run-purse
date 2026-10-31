import { EntityChoice } from './entities';
import { useState } from 'react';
import { Form, Field, Table, type D } from './shared';
const labels = ['supplier', 'remitTo', 'paymentTerms', 'shippingTerms', 'needDate', 'promisedDate', 'partNumber', 'description', 'quantity', 'unit', 'unitPrice', 'lineTax', 'lineTotal', 'freight', 'tax', 'total', 'notes'];
async function file(input: unknown) {
    if (!(input instanceof File) || !input.size) return undefined;
    const bytes = new Uint8Array(await input.arrayBuffer()); let raw = ''; for (const c of bytes) raw += String.fromCharCode(c);
    return { name: input.name, mediaType: input.type, base64: btoa(raw) };
}
export function PoProfiles({ data, mutate }: { data: D; mutate: (op: string, b: D) => Promise<any> }) {
    const [profile, setProfile] = useState<D>();
    return <section className="panel"><h2>PO document profiles</h2><p className="quiet">Configure each location before generating new POs. A category profile overrides the location’s * profile only when every line has that category. Issued documents retain their configuration and supplier identity.</p>
        <Table heads={['Location', 'Category', 'Legal name', '']}>
            {data.poProfile.map((p: D) => <tr key={p.id}><td>{p.location}</td><td>{p.purchaseType}</td><td>{p.legalName}</td><td><button onClick={() => setProfile(p)}>Edit PO profile</button></td></tr>)}
        </Table>
        <Form key={profile?.id || 'new'} label="Save PO document profile" onSubmit={async b => {
            const logo = await file(b.logoFile), termsFile = await file(b.termsFile), certificate = await file(b.certificateFile);
            await mutate('po-profile', { id: profile?.id, entity:b.entity, version: profile?.version || 0, location: b.location, purchaseType: b.purchaseType, legalName: b.legalName,
                billTo: { label: b.billLabel, name: b.billName, address: b.billAddress, attention: b.billAttention }, shipTo: { label: b.shipLabel, name: b.shipName, address: b.shipAddress, attention: b.shipAttention },
                buyerContact: b.buyerContact, shippingTerms: b.shippingTerms, standardTerms: b.standardTerms,
                logo: logo || profile?.logo, termsFile: termsFile || profile?.termsFile,
                certificate: certificate ? { ...certificate, supplierStates: String(b.supplierStates).split(',').map(s => s.trim().toUpperCase()) } : profile?.certificate,
                fieldLabels: Object.fromEntries(labels.filter(k => b['label_' + k]).map(k => [k, b['label_' + k]])) });
        }}>
            <EntityChoice data={data} label="Profile legal entity" value={profile?.entity}/><Field label="Profile location" name="location" defaultValue={profile?.location} options={(data.business[0]?.locations || []).map((v: string) => ({ value: v, label: v }))}/>
            <Field label="Purchase category (* means all)" name="purchaseType" defaultValue={profile?.purchaseType || '*'}/><Field label="Legal entity name" name="legalName" defaultValue={profile?.legalName || data.business[0]?.name}/>
            {['bill', 'ship'].flatMap(prefix => { const a = profile?.[prefix === 'bill' ? 'billTo' : 'shipTo']; return [['Label', 'label'], ['Name', 'name'], ['Address', 'address'], ['Attention', 'attention']].map(([suffix, key]) => <Field key={prefix + suffix} label={`${prefix === 'bill' ? 'Bill-to' : 'Ship-to'} ${suffix.toLowerCase()}`} name={prefix + suffix} defaultValue={a?.[key] || (key === 'label' ? (prefix === 'bill' ? 'Bill to' : 'Ship to') : '')} required={key !== 'attention'}/>); })}
            <Field label="Buyer contact" name="buyerContact" defaultValue={profile?.buyerContact}/><Field label="FOB / shipping terms" name="shippingTerms" defaultValue={profile?.shippingTerms} required={false}/><Field label="Purchase terms and conditions" name="standardTerms" type="textarea" defaultValue={profile?.standardTerms}/>
            <label className="field">Bill-to logo (PNG/JPEG, up to 1 MB)<input type="file" name="logoFile" accept="image/png,image/jpeg"/></label>
            <label className="field">Attached purchase terms PDF<input type="file" name="termsFile" accept="application/pdf"/></label><label className="field">Configured exemption/resale certificate PDF<input type="file" name="certificateFile" accept="application/pdf"/></label>
            <Field label="Certificate supplier states (comma separated)" name="supplierStates" required={false} defaultValue={profile?.certificate?.supplierStates?.join(', ')}/>
            <details className="wide"><summary>Document field labels</summary>{labels.map(k => <Field key={k} label={'Label for ' + k} name={'label_' + k} defaultValue={profile?.fieldLabels?.[k]} required={false}/>)}</details>
        </Form><p className="quiet">Configured certificates are attached when the supplier’s recorded postal state matches. This does not validate tax exemption. Existing files remain when no replacement is selected.</p>{profile && <button onClick={() => setProfile(undefined)}>Add another PO profile</button>}
    </section>;
}
