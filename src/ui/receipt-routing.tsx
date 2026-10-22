import { Separated } from './separated';
import { useState } from 'react';
import { Form, Field, Table, options, when, type D } from './shared';
export function ReceiptRules({data,actor,mutate}:{data:D;actor:D;mutate:(op:string,b:D)=>Promise<any>}) {
    if(!actor.grants.some((grant:D)=>grant.permissions.includes('procurement.manage')&&Object.keys(grant.scope).length===0&&Object.keys(grant.roleScope??{}).length===0))return null;
    return <Separated><details className="disclosure"><summary>Responsible receiver rules</summary><div className="disclosure-body"><p>PO assignments take precedence, then location and category, category, location, and the requester. A category rule applies to a PO whose lines all share that category.</p>
        <Table heads={['Location','Category','Receiver','Active']}>{data.receiptRule.filter((r:D)=>!r.order).map((r:D)=><tr key={r.id}><td>{r.location}</td><td>{r.purchaseType}</td><td>{r.receiver}</td><td>{r.active?'Yes':'No'}</td></tr>)}</Table>
        <Form label="Save receiver rule" onSubmit={b=>{const old=data.receiptRule.find((r:D)=>!r.order&&r.location===b.location&&r.purchaseType===(b.purchaseType||'*'));return mutate('receipt-rule',{...b,purchaseType:b.purchaseType||'*',id:old?.id,version:old?.version??0,active:b.active==='true'});}}>
            <Field label="Rule location" name="location" options={['*',...data.business[0].locations].map(value=>({value,label:value==='*'?'Any location':value}))}/><Field label="Purchase category" name="purchaseType" required={false}/><Field label="Responsible receiver" name="receiver" options={options(data.receivers)}/><Field label="Rule active" name="active" defaultValue="true" options={[{value:'true',label:'Active'},{value:'false',label:'Inactive'}]}/><Field label="Rule reason" name="reason"/>
        </Form></div></details></Separated>;
}
export function ReceiptAssignment({order:o,data,actor,mutate}:{order:D;data:D;actor:D;mutate:(op:string,b:D)=>Promise<any>}) {
    const [error,setError]=useState(''),[busy,setBusy]=useState(false);
    const rule=data.receiptRule.find((r:D)=>r.order===o.id);
    const confirmation=async(l:D)=>{setBusy(true);setError('');try{await mutate('receipt',{order:o.id,line:l.id,event:'receive',quantity:String(o.positions.find((p:D)=>p.line===l.id).outstanding/1000),receiptVersion:o.receiptVersion,reason:'Responsible receiver confirmed remaining delivery'});}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
    return <Separated><section aria-label="Responsible receiving"><h4>Responsible receiving</h4><p>Receiver: {o.receiverAssignment.email} · {o.receiverAssignment.explicit?'Assigned':'Requester by default'}</p>
        {o.receiptMatchingStatus&&!data.invoice.some((invoice:D)=>invoice.order===o.id)&&<p>{o.receiptMatchingStatus}</p>}
        {['issued','adopted'].includes(o.status)&&o.mayReceive&&<>{o.lines.filter((l:D)=>o.positions.find((p:D)=>p.line===l.id).outstanding>0).map((l:D)=><p key={l.id}><button disabled={busy} onClick={()=>confirmation(l)}>Confirm remaining {o.positions.find((p:D)=>p.line===l.id).outstanding/1000} · {l.description}</button></p>)}{error&&<p role="alert">{error}</p>}</>}
        {['prepared','issued','adopted','closed'].includes(o.status)&&(o.mayManageReceipt||o.mayReassignReceipt)&&<Form label="Assign PO receiver" initial={{order:o.id,id:rule?.id,version:rule?.version??0}} onSubmit={b=>mutate(o.mayManageReceipt?'receipt-rule':'reassign-receipt',b)}><Field label="PO receiver" name="receiver" options={options(data.receivers)}/><Field label="Assignment reason" name="reason"/></Form>}
        <ul className="ruled-list">{data.receiptPromptEvent.filter((e:D)=>e.order===o.id).map((e:D)=><li key={e.id}>Receipt prompt · {e.reason} · {e.receiver} · {e.outcome.status} · {when(e.at)}</li>)}</ul>
    </section></Separated>;
}
