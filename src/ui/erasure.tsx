import { useEffect, useState } from 'react';
import { call, type D } from './shared';
import { requestReauthentication } from './erasure-proof';
import { ErasureHistory } from './erasure-history';
import { ErasureRetention } from './erasure-retention';
export function Erasure({reload}:{reload:()=>Promise<void>}) {
 const [meta,setMeta]=useState<D>(),[selected,setSelected]=useState(''),[review,setReview]=useState<D>(),[receipt,setReceipt]=useState<D>(),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false);
 const refresh=async()=>setMeta(await call('erasure'));
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
 const perform=async(work:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError((e as Error).message);setReview(undefined);setConsent(false);await refresh().catch(()=>{});}finally{setBusy(false);}};
 return <section className="panel" aria-label="Personal data erasure" style={{overflowWrap:'anywhere'}}><h2>Personal data erasure</h2>
 <p>Erase a departed member or supplier contact after reviewing the exact fields and related original files. Financial and tax history remains with anonymous references. No records expire automatically.</p>
 <p className="quiet">TIN and bank values remain encrypted with owner-only reveal until their retention period ends. Related source files are withdrawn because an opaque PDF or attachment may contain identity. Keep the latest archive as the erasure journal when restoring an older backup.</p>
 {meta&&<ErasureHistory meta={meta} refresh={refresh}/>}
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <fieldset disabled={busy} style={{minWidth:0}}><legend>Review a person</legend>
 <label className="field">Departed member or supplier contact<select aria-label="Departed member or supplier contact" value={selected} onChange={e=>{setSelected(e.target.value);setReview(undefined);setConsent(false);}}><option value="">Choose a person</option>{meta?.choices.map((choice:D,index:number)=><option key={index} value={String(index)}>{choice.label}</option>)}</select></label>
 <button disabled={selected===''} onClick={()=>void perform(async()=>{const current=await call('erasure');setMeta(current);const subject=meta!.choices[Number(selected)];setReview(await call('erasure/preview',{...subject,revision:current.revision}));setReceipt(undefined);setConsent(false);})}>Review erasure</button>
 </fieldset>
 {review&&<div aria-label="Erasure review"><h3>Review removal</h3><p>{review.fields.length} fields in {review.affected.length} records; {review.originals} private original files will be deleted. Purchasing amounts, dates, source links and chronology remain.</p><h4>Reviewed personal stores</h4><ul>{review.coverage.map((entry:D)=><li key={entry.store}>{entry.store}: {entry.fields} field{entry.fields===1?'':'s'}</li>)}</ul><details><summary>Fields to remove</summary><ul>{review.fields.map((field:D,index:number)=><li key={index}>{field.kind} · {field.path.join('.')}</li>)}</ul><ul>{review.installationFields.map((entry:D,index:number)=><li key={index}>{entry.store}: {entry.fields.join(', ')}</li>)}</ul></details>
 <button disabled={busy} onClick={()=>void perform(async()=>{setNotice(await requestReauthentication());})}>Request native reauthentication</button>
 <label className="field"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I consent to erase these reviewed personal fields and delete their related original files while retaining anonymous purchasing and encrypted tax records.</label>
 <button className="btn-primary" disabled={busy||!consent} onClick={()=>void perform(async()=>{const result=await call('erasure/execute',{...review.subject,revision:review.revision,review:review.review,fingerprint:review.fingerprint,consent});setReceipt(result);setReview(undefined);setSelected('');setConsent(false);await refresh();await reload();})}>Erase reviewed personal data</button></div>}
 {receipt&&<div role="status"><h3>Erasure receipt</h3><p>{receipt.phase==='complete'?'Erasure complete.':'Source deletion pending.'} {receipt.fields.length} fields removed. Anonymous reference: {receipt.anonymousReference}.</p><p>{receipt.retained}</p></div>}
 {meta&&<ErasureRetention meta={meta} refresh={refresh} reload={reload}/>}
 {meta&&meta.receipts.length>0&&<details><summary>Erasure receipts ({meta.receipts.length})</summary>{meta.receipts.map((r:D)=><article key={r.id}><h3>{r.subject==='member'?'Departed member':r.subject==='retention'?'Expired retained values':'Supplier contact'} · {new Date(r.at).toLocaleString()}</h3><p>{r.fields.length} fields removed; {r.originals.length} originals. {r.phase==='complete'?'Complete':'Source deletion pending'}.</p><details><summary>Removed fields</summary><ul>{r.fields.map((f:D,index:number)=><li key={index}>{f.kind} · {f.path.join('.')}</li>)}</ul></details>{r.phase!=='complete'&&<button disabled={busy} onClick={()=>void perform(async()=>{const current=await call('erasure');setReceipt(await call('erasure/resume',{revision:current.revision,id:r.id}));await refresh();})}>Resume source deletion</button>}</article>)}</details>}
 </section>;
}
