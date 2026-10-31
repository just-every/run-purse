import { useState } from 'react';
import { Field, Form, Table, type D } from './shared';

export function EntityChoice({ data, name = 'entity', label = 'Legal entity', value = 'main' }: { data: D; name?: string; label?: string; value?: string }) {
    return <Field label={label} name={name} defaultValue={value} options={[{value:'main',label:data.business[0]?.name ?? 'Main business'}, ...(data.entity ?? []).map((entity: D)=>({value:entity.id,label:entity.legalName + (entity.active ? '' : ' · Inactive')}))]}/>;
}
export function Entities({ data, mutate }: { data: D; mutate: (op: string, input: D) => Promise<any> }) {
    const [current, setCurrent] = useState<D>();
    return <section className="panel" aria-label="Legal entities"><h2>Legal entities</h2>
        <p>Domestic USD purchases use each entity’s own budget, legal identity and PO sequence. Accounting connections are unconfigured.</p>
        <Table heads={['Legal name','Prefix','Status','Accounting','Actions']}>
            {(data.entity ?? []).map((entity: D)=><tr key={entity.id}><td>{entity.legalName}</td><td>{entity.prefix}</td><td>{entity.active ? 'Active' : 'Inactive'}</td><td>Unconfigured</td><td><button type="button" onClick={()=>setCurrent(entity)}>Edit entity</button></td></tr>)}
        </Table>
        <Form key={current?.id ?? 'new'} label="Save legal entity" initial={{id:current?.id,version:current?.version ?? 0}} onSubmit={async input=>{await mutate('entity',{...input,country:'US',currency:'USD',active:input.active==='true'});setCurrent(undefined);}}>
            <Field label="Entity legal name" name="legalName" defaultValue={current?.legalName}/>
            <Field label="Entity bill-to address" name="billTo" type="textarea" defaultValue={current?.billTo}/>
            <Field label="Entity ship-to address" name="shipTo" type="textarea" defaultValue={current?.shipTo}/>
            <Field label="Immutable PO prefix" name="prefix" defaultValue={current?.prefix}/>
            <Field label="Entity status" name="active" defaultValue={current?.active === false ? 'false' : 'true'} options={[{value:'true',label:'Active'},{value:'false',label:'Inactive'}]}/>
        </Form>{current && <button type="button" onClick={()=>setCurrent(undefined)}>Add another legal entity</button>}
    </section>;
}
