import { useState } from 'react';
import { Chip, Details, Field, Form, Table, options, when, type D } from './shared';

export function Stockroom({ data, mutate }: { data: D; mutate: (op: string, b: D) => Promise<any> }) {
    const [selectedId, setSelectedId] = useState('');
    const stockrooms: D[] = data.stockroom ?? [];
    const selected = stockrooms.find(s => s.id === selectedId), business = data.business[0];
    if (!business) return <p>Set up your business before configuring stockroom consumables.</p>;
    const codes = (name: string) => business[name].map((value: string) => ({ value, label: value }));
    const items = data.catalogue.filter((c: D) => c.approved && data.supplier.some((s: D) => s.id === c.supplier && s.status === 'preferred'));
    return <section className="panel">
        <h3>Stockroom consumables</h3>
        <p>Record office, cleaning and site supplies. A count below its reorder point creates a draft for the owner to review and submit in Requests.</p>
        <p className="quiet">Repeat counts keep the existing request, including after submission, until its purchase order is fully received or cancelled. Draft quantities stay as first counted; review changes in Requests.</p>
        <Table heads={['Item / location', 'Count', 'Reorder point / replenish to', 'Replenishment', '']} figures={['Count']}>
            {stockrooms.map(stock => {
                const request = data.request.find((r: D) => r.id === stock.request);
                return <tr key={stock.id}>
                    <td className="record-name">{stock.name} · {stock.location}</td>
                    <td className="figure">{stock.count ?? 'Not counted'}</td>
                    <td>{stock.reorderPoint} / {stock.replenishTo}</td>
                    <td>{request ? <>{request.title} · <Chip>{request.status}</Chip></> : 'No request'}</td>
                    <td className="row-action"><button onClick={() => setSelectedId(stock.id)}>Record count / edit</button></td>
                </tr>;
            })}
        </Table>
        {selected && <section className="record">
            <h4>{selected.name} · {selected.location}</h4>
            <p className="record-meta">Last counted: {when(selected.countedAt)}</p>
            <Form key={'count-' + selected.id + '-' + selected.countedAt} label="Record stock count" initial={{ id: selected.id }} onSubmit={b => mutate('stockroom-count', b)}>
                <Field label="Count on hand" name="count" defaultValue={selected.count ?? ''}/>
                <Field label="Replenishment need date" name="needDate" type="date" defaultValue={selected.needDate}/>
            </Form>
        </section>}
        <Details label={selected ? 'Edit stockroom item' : 'Add stockroom item'}>
            <Form key={selected?.id ?? 'new-stockroom'} label="Save stockroom item" initial={{ id: selected?.id }} onSubmit={b => mutate('stockroom-item', b)}>
                <Field label="Stockroom item name" name="name" defaultValue={selected?.name}/>
                <Field label="Preferred catalogue item" name="catalogue" options={options(items, 'description')} defaultValue={selected?.catalogue}/>
                <Field label="Location" name="location" options={codes('locations')} defaultValue={selected?.location}/>
                <Field label="Cost centre" name="costCentre" options={codes('costCentres')} defaultValue={selected?.costCentre}/>
                <Field label="Project" name="project" options={codes('projects')} defaultValue={selected?.project}/>
                <Field label="Reorder point" name="reorderPoint" defaultValue={selected?.reorderPoint}/>
                <Field label="Replenish to" name="replenishTo" defaultValue={selected?.replenishTo}/>
                <Field label="Need date" name="needDate" type="date" defaultValue={selected?.needDate}/>
                <Field label="Supplier-supplied terms" name="terms" type="textarea" defaultValue={selected?.terms}/>
            </Form>
        </Details>
        <p className="quiet">Counts and reorder quantities accept up to three decimal places. Warehouse inventory stays in Pier; its replenishment needs can enter Purse through the request API.</p>
        {selected && <button onClick={() => setSelectedId('')}>Add another stockroom item</button>}
    </section>;
}
