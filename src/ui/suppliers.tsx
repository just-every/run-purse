import { SupplierTax } from './supplier-tax';
import { SupplierCreditBalances } from './supplier-credits';
import { Comments } from './comments';
import { SupplierProtected } from './supplier-protected';
import { Separated } from './separated';
import { useState } from 'react';
import { DuplicateSupplierReview } from './supplier-duplicates';
import { SupplierMerge, SupplierHistory } from './supplier-merge';
import { SupplierScreening } from './supplier-screening';
import { SupplierPerformance } from './supplier-performance';
import { SupplierDocuments } from './supplier-documents';
import { Form, Field, Table, Attachments, Chip, call, calendarDay, type D } from './shared';

export function Suppliers({ data, actor, mutate, reload }: { data: D; actor: D; mutate: (op: string, b: D) => Promise<any>; reload: () => Promise<void> }) {
    const [selectedId, setSelectedId] = useState<string | undefined>(new URLSearchParams(window.location.search).get('supplier') ?? undefined), [duplicate, setDuplicate] = useState<D>(), [openError, setOpenError] = useState('');
    const selected = data.supplier.find((s: D) => s.id === selectedId);
    const open = (id?: string) => { setSelectedId(id); setDuplicate(undefined); };
    return <Separated><><h2 className="page-title">Known suppliers</h2>
        <Table heads={['Supplier', 'Status', 'Reason', 'Renewal', '']}>{data.supplier.map((s: D) => <tr key={s.id}>
            <td className="record-name">{s.name}</td><td><Chip>{s.status}</Chip></td><td>{s.reason}</td><td className="figure-cell">{calendarDay(s.renewal)}</td>
            <td className="row-action"><button onClick={() => open(s.id)}>Open</button></td>
        </tr>)}</Table>
        {selected?.mergedInto ? <section className="panel"><h3>Merged supplier history · {selected.name}</h3><p>This supplier is no longer purchasable. Its original records remain intact.</p><button onClick={() => open(selected.mergedInto)}>Open surviving supplier</button></section> : data.mayManageSupplierRegister && <>
            <h3>{selected ? 'Edit ' + selected.name : 'Add supplier'}</h3>
            <Form key={selected?.id ?? 'new'} initial={{ id: selected?.id }} label="Save supplier" onSubmit={async b => {
                const input = { ...b, contacts: b.email ? [{ name: b.contactName, email: b.email }] : [], matching: { tin: b.matchTin, bankRouting: b.matchRouting, bankAccount: b.matchAccount } };
                const review = await call('command/supplier-duplicates', input);
                if (!b.id && review.matches.length) { setDuplicate({ review, input }); return; }
                const saved = await mutate('supplier', input); open(saved.id);
            }}>
                <Field label="Supplier name" name="name" defaultValue={selected?.name}/>
                <Field label="Doing business as" name="dba" required={false} defaultValue={selected?.dba}/>
                <Field label="Supplier phone" name="phone" required={false} defaultValue={selected?.phone}/>
                <Field label="Remit-to postal address" name="remitTo" defaultValue={selected?.remitTo} required={false}/><Field label="Supplier postal state (two letters)" name="postalState" defaultValue={selected?.postalState} required={false}/><Field label="Address" name="address" required={false} defaultValue={selected?.address}/>
                <Field label="Status" name="status" defaultValue={selected?.requestedStatus || selected?.status || 'active'} options={['active', 'preferred', 'blocked'].map(x => ({ value: x, label: x }))}/>
                <Field label="Reason" name="reason" defaultValue={selected?.reason}/>
                <Field label="Contact name" name="contactName" required={false} defaultValue={selected?.contacts[0]?.name}/>
                <Field label="Contact email" name="email" required={false} type="email" defaultValue={selected?.contacts[0]?.email}/>
                <Field label="Contract reference" name="contractRef" required={false} defaultValue={selected?.contractRef}/>
                <Field label="Renewal date" name="renewal" type="date" required={false} defaultValue={selected?.renewal}/>
                <fieldset className="wide"><legend>Matching-only identity</legend>
                    <p className="quiet">Values are used only to find possible duplicates and are never stored in full. This does not validate a TIN, certify a supplier or verify a bank account. Blank keeps existing matching evidence. TIN matching: {selected?.matchingOnly?.tin ? 'recorded' : 'not recorded'}; bank matching: {selected?.matchingOnly?.bank ? 'recorded' : 'not recorded'}.</p>
                    <Field label="Matching-only TIN" name="matchTin" type="password" required={false}/>
                    <Field label="Matching-only bank routing number" name="matchRouting" type="password" required={false}/>
                    <Field label="Matching-only bank account number" name="matchAccount" type="password" required={false}/>
                </fieldset>
            </Form>
        </>}
        {data.mayManageSupplierRegister && duplicate && <DuplicateSupplierReview review={duplicate.review} input={duplicate.input} mutate={mutate} onSaved={s => open(s.id)} onOpen={async id => { try { await reload(); open(id); setOpenError(''); } catch (e) { setOpenError((e as Error).message); } }}/>}
        {openError && <p role="alert">{openError}</p>}
        {selected && <><SupplierCreditBalances data={data} supplier={selected.id}/>
            <Comments key={selected.id} kind="supplier" record={selected.id} mutate={mutate}/>
            {selected.mayReadProtected && <SupplierProtected key={selected.id + ":protected"} supplier={selected} owner={actor.roles.includes('owner')} reload={reload}/>}
            {!selected.mergedInto && <Attachments data={data} kind="supplier" record={selected.id} editable={Boolean(data.mayManageSupplierRegister && selected.mayManagePurchasing)} mutate={mutate}/>}
            {!selected.mergedInto && data.mayManageSupplierRegister && <><SupplierPerformance key={selected.id} supplier={selected} data={data} mutate={mutate}/><SupplierScreening supplier={selected} owner={actor.roles.includes('owner')} mutate={mutate}/><SupplierDocuments key={selected.id + ":documents"} supplier={selected} data={data} mutate={mutate} reload={reload}/><SupplierMerge key={selected.id} supplier={selected} data={data} mutate={mutate} onMerged={() => setDuplicate(undefined)}/></>}
            {actor.roles.includes('owner') && data.supplierTax?.find((view: D) => view.supplier === (selected.mergedInto ?? selected.id)) && <SupplierTax key={selected.id + ':tax'} supplier={selected} files={data.attachment} view={data.supplierTax.find((view: D) => view.supplier === (selected.mergedInto ?? selected.id))} mutate={mutate}/>}
            <SupplierHistory supplier={selected} data={data}/>
            {data.mayManageSupplierRegister && <button onClick={() => open()}>Add another supplier</button>}
        </>}
    </></Separated>;
}
