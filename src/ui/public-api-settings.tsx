import { useEffect, useState } from 'react';
import { Field, Form, Chip, when, type D } from './shared';
async function request(path:string,body?:D){const response=await fetch('/api/purse/'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);const value=await response.json() as D;if(!response.ok)throw new Error(value.error||'Unable to update API settings');return value;}
/** Reuses the seed's existing Settings forms and labelled controls. */
export function PublicApiSettings(){
 const [keys,setKeys]=useState<D[]>([]),[members,setMembers]=useState<D[]>([]),[scopes,setScopes]=useState<string[]>([]),[hooks,setHooks]=useState<D[]>([]),[events,setEvents]=useState<D[]>([]),[attempts,setAttempts]=useState<D[]>([]);
 const [secret,setSecret]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 async function reload(){const [k,w]=await Promise.all([request('api-keys'),request('webhooks')]);setKeys(k.keys);setMembers(k.members);setScopes(k.scopes);setHooks(w.subscriptions);setEvents(w.events);setAttempts(w.attempts);setLoaded(true);}
 useEffect(()=>{reload().catch(e=>setError(e.message));},[]);
 async function change(path:string,body:D){setSecret('');setError('');setBusy(true);try{const value=await request(path,body);setSecret(value.token||value.secret||'');await reload();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="panel" aria-label="Public API and webhooks"><h3>Public API and webhooks</h3>
  <p>Keys use the selected member’s current permissions and the selected scopes. Requests remain drafts. Invoice originals await human confirmation in Purse. No supplier sending, payment or protected data access.</p>
  <p><a href="/api/purse/v1/openapi.json" target="_blank" rel="noreferrer">Open API specification</a></p>
  {error&&<p role="alert">{error}</p>}{!loaded&&!error&&<p role="status">Loading API settings…</p>}
  {secret&&<div><p>Copy this secret now. It is shown once. Keep it private.</p><label className="field field-wide">New API secret<textarea aria-label="New API secret" readOnly value={secret} autoComplete="off" spellCheck={false} style={{width:'100%',minWidth:0,boxSizing:'border-box',overflowWrap:'anywhere',wordBreak:'break-all'}}/></label><button type="button" onClick={()=>setSecret('')}>Dismiss secret</button></div>}
  <fieldset disabled={!loaded||busy} style={{minWidth:0}}><legend>Create scoped API key</legend>
   <Form label="Create API key" onSubmit={b=>change('api-keys',{...b,scopes:b.scopes.split(',').map((v:string)=>v.trim()),recordScope:b.department?{departments:b.department.split(',').map((v:string)=>v.trim())}:{}})}>
    <Field label="API key name" name="name"/><Field label="Bound member" name="principal" options={members.map(m=>({value:m.id,label:m.name}))}/>
    <Field label="API scopes (comma separated)" name="scopes" defaultValue="requests:write"/><Field label="Key department (blank means current member scope)" name="department" required={false}/><Field label="API key expiry in days" name="expiresDays" type="number" defaultValue="7"/>
   </Form><p>Available scopes: {scopes.join(', ')}. Keys expire in 1–30 days.</p>
  </fieldset>
  {keys.map(key=><article key={key.id}><h4>{key.name}</h4><p style={{overflowWrap:'anywhere'}}>{key.scopes.join(', ')} · <Chip>{key.revokedAt?'Revoked':'Active'}</Chip> · expires {when(key.expiresAt)}</p>{!key.revokedAt&&<><button disabled={busy} onClick={()=>change('api-keys/'+key.id+'/rotate',{})}>Rotate API key</button>{' '}<button disabled={busy} onClick={()=>change('api-keys/'+key.id+'/revoke',{})}>Revoke API key</button>{' '}</>}<button disabled={busy} onClick={()=>change('api-keys/'+key.id+'/delete',{})}>Delete API key</button></article>)}
  <fieldset disabled={!loaded||busy} style={{minWidth:0}}><legend>Create signed webhook</legend>
   <Form label="Create webhook" onSubmit={b=>change('webhooks',{...b,events:b.events.split(',').map((v:string)=>v.trim()),consent:b.consent==='yes'})}>
    <Field label="Webhook name" name="name"/><Field label="HTTPS receiver" name="endpoint" type="url"/><Field label="Webhook events (comma separated)" name="events" defaultValue="request.approved, po.issued"/><Field label="Send these record references" name="consent" options={[{value:'no',label:'Choose explicit consent'},{value:'yes',label:'I consent to this receiver and these events'}]}/>
   </Form><p>Signed events carry stable IDs and record references. The receiver must verify signatures and de-duplicate IDs. A failed or uncertain attempt needs an explicit replay.</p>
  </fieldset>
  {hooks.map(hook=><article key={hook.id}><h4>{hook.name}</h4><p style={{overflowWrap:'anywhere'}}>{hook.endpoint} · <Chip>{hook.revokedAt?'Revoked':'Active'}</Chip></p>{!hook.revokedAt&&<><button disabled={busy} onClick={()=>change('webhooks/'+hook.id+'/rotate',{})}>Rotate signing secret</button>{' '}<button disabled={busy} onClick={()=>change('webhooks/'+hook.id+'/revoke',{})}>Revoke webhook</button>{' '}<Form label="Replay webhook" onSubmit={b=>change('webhooks/'+hook.id+'/replay',b)}><Field label="Replay event" name="event" options={events.filter(e=>hook.events.includes(e.type)&&e.at>=hook.createdAt).map(e=>({value:e.id,label:e.type+' · '+new Date(e.at).toLocaleString()}))}/><Field label="Replay reason" name="reason"/></Form></>}<button disabled={busy} onClick={()=>change('webhooks/'+hook.id+'/delete',{})}>Delete webhook</button><p>{attempts.filter(a=>a.subscription===hook.id).map(a=>a.status).join(', ')||'No attempts yet'}</p></article>)}
 </section>;
}
