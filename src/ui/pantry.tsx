import { useEffect, useState } from 'react';
import { Chip, Field, Form, Table, money, when, type D } from './shared';
async function request(path='',body?:D) {
    const response=await fetch('/api/purse/pantry'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);
    const result=await response.json() as D;if(!response.ok)throw new Error(result.error||'Pantry request failed');return result;
}
export function Pantry({data,reload}:{data:D;reload:()=>Promise<void>}) {
    const [view,setView]=useState<D>(),[mappings,setMappings]=useState<D>(),[preview,setPreview]=useState<D>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const refresh=async()=>setView(await request());
    useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
    const act=async(path:string,body:D)=>{setError('');setBusy(true);try{const result=await request(path,body);await refresh();await reload();return result;}catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}};
    const candidates=data.invoice.filter((invoice:D)=>data.payable.some((p:D)=>p.invoice===invoice.id&&p.approvedAt));
    return <section className="panel" aria-label="Pantry connection"><h3>Pantry accounting</h3>
        <p>The owner approves each exact bill before posting. Re-sync adopts a matching external bill and never intentionally posts it twice. Payments are recorded in Pantry; Purse reads their status. No payment is initiated here.</p>
        <p className="quiet">This connector currently covers native PO bills, vendor identity and payment return. Structured PO/source provenance, credits, 1099 boxes, non-PO reporting and reconciliation qualification remain incomplete.</p>
        {error&&<p role="alert">{error}</p>}{!view&&<p role="status">Loading Pantry connection…</p>}
        {view&&<>
            {view.connection&&<p>{view.connection.origin} · <Chip>{view.connection.revokedAt?'Revoked':'Connected'} · generation {view.connection.generation}</Chip></p>}
            <Form key={view.connection?.generation??0} label={view.connection?'Replace Pantry credential':'Connect Pantry'} onSubmit={async b=>{if(b.confirmed!=='on')throw new Error('Confirm the exact installation and book currency');await act('/connection',{...b,generation:view.connection?.generation??0,confirmed:true});setMappings(undefined);setPreview(undefined);}}>
                <Field label="Pantry origin" name="origin" defaultValue={view.config?.origin??''}/>
                <Field label="Pantry book currency" name="currency" defaultValue={view.config?.currency??'USD'}/>
                <Field label="New Pantry credential" name="token" type="password"/>
                <label><input type="checkbox" name="confirmed"/> I checked this Pantry installation and its book currency, and authorize this connection.</label>
            </Form>
            <p className="quiet">Create a named integration in Pantry with contacts:write, bills:write, payments:read and post. Paste its shown-once token privately. Purse stores it encrypted and never reads it back; revoke the original in Pantry to end its provider access.</p>
            {view.connection&&!view.connection.revokedAt&&<div className="row-actions"><button disabled={busy} onClick={()=>request('/options').then(setMappings).catch(e=>setError(e.message))}>Load Pantry mappings</button><button disabled={busy} onClick={()=>act('/connection/revoke',{}).then(()=>{setMappings(undefined);setPreview(undefined);}).catch(()=>{})}>Revoke Pantry connection</button></div>}
            {view.connection&&<button disabled={busy} onClick={()=>act('/connection/delete',{}).then(()=>{setMappings(undefined);setPreview(undefined);}).catch(()=>{})}>Delete Pantry credential</button>}
            {mappings&&view.connection&&!view.connection.revokedAt&&<Form label="Preview Pantry bill" onSubmit={async b=>{const invoice=data.invoice.find((i:D)=>i.id===b.invoice),payable=data.payable.find((p:D)=>p.invoice===invoice.id);setPreview((await request('/preview',{...b,payableVersion:payable.version})).plan);}}>
                <Field label="Approved native bill" name="invoice" options={candidates.map((invoice:D)=>({value:invoice.id,label:invoice.reference+' · '+money(invoice.totalMinor,invoice.currency)}))}/>
                <Field label="Pantry expense account" name="accountId" options={mappings.accounts.map((account:D)=>({value:account.id,label:account.code+' · '+account.name}))}/>
                <Field label="Existing Pantry vendor (blank creates one)" name="vendorId" required={false} options={mappings.vendors.map((vendor:D)=>({value:vendor.id,label:vendor.name}))}/>
                {mappings.moreVendors&&<p>More Pantry vendors exist. Confirm the exact vendor ID in Pantry before posting a vendor absent from this page.</p>}
            </Form>}
            {preview&&<div aria-label="Exact Pantry bill preview"><h4>Review exact Pantry posting</h4><p>{preview.payload.reference} · {preview.supplierName} · {preview.currency} · bill date {preview.payload.billDate} · due {preview.payload.dueDate} · {preview.term}</p>
                <Table heads={['Line','Account','Amount']}>{preview.payload.lines.map((line:D,index:number)=><tr key={index}><td>{line.description}</td><td>{line.accountId}</td><td>{line.amount} {preview.currency}</td></tr>)}</Table>
                <p>{preview.vendorId?'Use the selected existing vendor':'Create this vendor, or reuse its previously recorded source identity'}. Create or adopt only an exactly matching posted bill. This is accounting posting consent, separate from cash-planning approval.</p>
                <Form label="Approve and sync exact bill" onSubmit={async b=>{if(b.confirmed!=='on')throw new Error('Confirm this exact posting');await act('/sync',{...preview,confirmed:true,reason:b.reason});setPreview(undefined);}}>
                    <Field label="Posting approval reason" name="reason"/>
                    <label><input type="checkbox" name="confirmed"/> I approve this exact bill, mapping and amount for accounting posting.</label>
                </Form>
            </div>}
            <h4>Synced bills and payment return</h4>
            <Table heads={['Bill','Sync state','Payment status','Outstanding','Last return','Actions']}>{view.syncs.map((sync:D)=><tr key={sync.id}>
                <td>{sync.payload.reference}{sync.url&&<p><a href={sync.url} target="_blank" rel="noreferrer">Open Pantry bill</a></p>}</td>
                <td><Chip>{sync.status}</Chip>{sync.outcome&&<p>{sync.outcome}</p>}</td><td>{sync.returned?.paymentStatus??'Unknown'}<p>Reconciliation: {sync.returned?.reconciliationStatus??'unknown'}</p></td>
                <td>{sync.returned?money(sync.returned.openMinor,sync.currency):'Unknown'}</td><td>{when(sync.at)}</td>
                <td>{sync.externalId&&<button disabled={busy||!!view.connection?.revokedAt||!view.connection} onClick={()=>act('/refresh',{invoice:sync.invoice}).catch(()=>{})}>Refresh payment status</button>}</td>
            </tr>)}</Table>
        </>}
    </section>;
}
