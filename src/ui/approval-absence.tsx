import { useState } from 'react';
import { Field, Form, when, type D } from './shared';
export function ApprovalAbsence({data,actor,mutate}:{data:D;actor:D;mutate:(op:string,input:D)=>Promise<any>}) {
    const [editing,setEditing]=useState<D>();
    const [policyId,setPolicyId]=useState('');
    const settings=data.approvalAbsenceSettings;
    if(!settings?.policies.length&&!settings?.configs.length)return null;
    const policy=settings.policies.find((p:D)=>p.id===(editing?.policy??policyId))??settings.policies[0];
    return <section className="panel" aria-label="Out of office approvals"><h2>Out of office approvals</h2>
        <p>Schedule a delegate for single-person approval steps. Original waiting time is retained. Pool, parallel and requester conflicts stay held for review.</p>
        {settings.configs.map((config:D)=><article className="ruled-item" key={config.id}>
            <h3>{settings.policies.find((p:D)=>p.id===config.policy)?.name??'Historical policy'} · version {config.version}</h3>
            <p><span className="email-token">{config.from}</span> → <span className="email-token">{config.delegate}</span></p>
            <p>{when(config.startsAt,config.timezone)} to {when(config.endsAt,config.timezone)} · {config.timezone}</p>
            <p>{!config.active?'Cancelled':!config.currentAuthority?'Held: renew native authority':'Scheduled'} · {config.reason}</p>
            {!config.erasure&&<button type="button" onClick={()=>{setEditing(config);setPolicyId(config.policy);}}>Edit absence</button>}
            {config.active&&!config.erasure&&<Form label="Cancel absence" initial={{id:config.id,version:config.version}} onSubmit={b=>mutate('cancel-approval-absence',b)}><Field label="Cancellation reason" name="reason"/></Form>}
            <details><summary>Window history</summary>{config.history.map((event:D)=><p key={event.version}>Version {event.version} · {event.action} · {when(event.at)} · {event.reason}</p>)}</details>
        </article>)}
        {policy&&<><label className="field">Approval policy<select aria-label="Absence approval policy" value={editing?.policy??policy.id} onChange={e=>{setEditing(undefined);setPolicyId(e.target.value);}}>{settings.policies.map((p:D)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <Form key={(editing?.id??policy.id)+':'+(editing?.version??0)} label="Save absence" initial={{id:editing?.id,version:editing?.version??0,policy:policy.id}} onSubmit={async b=>{await mutate('approval-absence',b);setEditing(undefined);}}>
            <Field label="Absent approver" name="from" defaultValue={editing?.from??(actor.roles.includes('owner')?policy.approvers[0]:actor.email)} options={policy.approvers.map((email:string)=>({value:email,label:email}))}/>
            <Field label="Absence delegate" name="delegate" defaultValue={editing?.delegate??''} options={settings.delegates.map((p:D)=>({value:p.email,label:p.name}))}/>
            <Field label="Absence time zone" name="timezone" defaultValue={editing?.timezone??data.business[0]?.timezone??'America/New_York'}/>
            <Field label="Absence starts" name="start" type="datetime-local" defaultValue={editing?.start??''}/>
            <Field label="Absence ends" name="end" type="datetime-local" defaultValue={editing?.end??''}/>
            <Field label="Absence reason" name="reason" defaultValue={editing?.reason??''}/>
            <p>Use local times in the named IANA zone. Nonexistent or ambiguous daylight-saving times are refused. Saving replaces the previous version of this window.</p>
        </Form>{editing&&<button type="button" onClick={()=>setEditing(undefined)}>New absence</button>}</>}
    </section>;
}
