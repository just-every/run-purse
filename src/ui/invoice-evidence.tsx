import { useEffect, useState } from 'react';
import { call, type D } from './shared';

export function EvidenceMigration() {
 const [cleanup,setCleanup]=useState('');
 const [status,setStatus]=useState<D>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=()=>call('invoice-evidence').then(setStatus);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
 return <section className="panel" aria-label="Invoice evidence history"><h3>Invoice evidence history</h3>
 <p>Legacy hashes are preserved. A migration checks retained sources and records what it could verify. It never changes invoice holds or confirms a supplier’s bank.</p>
 {status&&<><p>{status.pending.length} legacy invoices awaiting migration.</p><button disabled={busy||!status.pending.length} onClick={()=>{setBusy(true);setError('');void call('invoice-evidence/migrate',{revision:status.revision}).then(refresh).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Check legacy evidence</button>
 {status.receipts.map((r:D)=><div key={r.id}><p>{Object.entries(r.counts).map(([name,count])=>`${name}: ${count}`).join(' · ')}</p><p>{r.warning}</p></div>)}</>}
 <form className="record-form" onSubmit={e=>{e.preventDefault();const form=e.currentTarget,input=new FormData(form);setBusy(true);void call('command/protected-context-cleanup',{confirmed:input.get('confirmed')==='on',reason:input.get('reason')}).then(r=>setCleanup(`Cleaned ${r.records} historical records; cancelled ${r.cancelledActions} pending actions. Free text remains source data.`)).catch(e=>setError(e.message)).finally(()=>{setBusy(false);form.reset();});}}>
 <p>Remove historical structured tax, bank and connector fields from preparation records and cancel their pending actions. This does not inspect free text.</p>
 <label className="field">Cleanup reason<input name="reason" required maxLength={2000}/></label><label><input type="checkbox" name="confirmed" required/>Confirm removal of historical structured protected fields</label><button disabled={busy}>Clean historical protected context</button></form>{cleanup&&<p role="status">{cleanup}</p>}
 {error&&<p role="alert">{error}</p>}</section>;
}
export function InvoiceEvidence({invoice,owner}:{invoice:D;owner:boolean}) {
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const status=invoice.evidenceStatus;
 if(!status)return null;
 return <section aria-label={'Evidence history '+invoice.reference}><p>{message||status.label}</p>
 {owner&&status.state==='unavailable-source'&&<><p>Re-enter the original bank details to verify. Confirm native reauthentication within ten minutes first. Re-entered bank input is discarded after this check.</p>
 <button onClick={()=>{void fetch('/auth/step-up',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'export',returnTo:'/app?tab=Orders'})}).then(r=>{if(!r.ok)throw new Error('Reauthentication request refused');setMessage('Confirm the native email link in this browser, then return to the invoice.');}).catch(e=>setError(e.message));}}>Request evidence reauthentication</button>
 <form className="record-form" autoComplete="off" onSubmit={e=>{e.preventDefault();const form=e.currentTarget,b=new FormData(form);setBusy(true);setError('');void call('invoice-evidence').then(current=>call('invoice-evidence/reenter',{revision:current.revision,invoice:invoice.id,reason:b.get('reason'),evidence:b.get('evidence'),remit:{bankRouting:b.get('bankRouting'),bankAccount:b.get('bankAccount')}})).then(r=>setMessage(r.label)).catch(e=>setError(e.message)).finally(()=>{form.reset();setBusy(false);});}}>
 <label className="field">Original routing number<input type="password" inputMode="numeric" name="bankRouting" required autoComplete="off" maxLength={9}/></label>
 <label className="field">Original bank account<input type="password" inputMode="numeric" name="bankAccount" required autoComplete="off" maxLength={17}/></label>
 <label className="field">Private re-entry reason<input type="password" name="reason" required autoComplete="off" maxLength={2000}/></label>
 <label className="field">Private source reference<input type="password" name="evidence" required autoComplete="off" maxLength={2000}/></label>
 <button disabled={busy} className="btn-primary">Verify original evidence</button></form></>}
 {error&&<p role="alert">{error}</p>}</section>;
}
