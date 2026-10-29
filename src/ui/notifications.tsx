import { useEffect, useState } from 'react';
import { Form, Field, call, when, type D } from './shared';
const labels: D = { 'approver-nudge':'Approval reminder', 'approval-needed': 'Approval needed', returned: 'Request returned', approved: 'Request approved', 'comment-mention': 'Comment mention', 'receipt-needed': 'Receipt needed', 'comment-reply':'Comment reply', 'approver-edit':'Approver edited request', 'buyer-edit':'Buyer edited conversion', 'po-acknowledged':'PO acknowledged', 'chase-sent':'Supplier chase sent', delivered:'Delivery received', 'exception-assigned':'Exception assigned', 'document-expiring':'Supplier document due' };
export function Notifications({ refresh }: { refresh: unknown }) {
    const [items, setItems] = useState<D[]>([]), [error, setError] = useState(''), [history, setHistory] = useState(false);
    async function reload() { const result = await call('notifications'); setItems(result.items); setError(''); }
    useEffect(() => { let active = true; call('notifications').then(result => { if (active) { setItems(result.items); setError(''); } }).catch(e => { if (active) { setItems([]); setError(e.message); } }); return () => { active = false; }; }, [refresh]);
    async function change(op: string, id: string) { try { await call('command/notification-' + op, { id }); await reload(); } catch (e) { setError((e as Error).message); await reload().catch(() => setItems([])); } }
    const visible = items.filter(n => history || !n.dismissed);
    return <section className="panel" aria-label="Notifications"><details><summary>Notifications · {items.filter(n => !n.read && !n.dismissed).length} unread</summary>
        <label><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)}/> Show dismissed notifications</label>
        {error && <p role="alert">{error}</p>}
        {!visible.length && <p>No notifications to show.</p>}
        <ul className="ruled-list">{visible.map(n => <li key={n.id}><article aria-label={labels[n.type]} data-notification={n.id}>
            <p><strong>{labels[n.type]}</strong> · {n.dismissed ? 'Dismissed' : n.read ? 'Read' : 'Unread'} · {when(n.at)}</p>
            {n.canRead ? <><p><a href={n.url}>{n.title}</a>{n.commentVersion ? ` · Comment version ${n.commentVersion}` : n.sourceRevision ? ` · Revision ${n.sourceRevision}` : ''}{!n.actionable && ' · Earlier event'}</p>{n.body && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.body}</p>}
                <div className="form-end">{!n.read && <button type="button" onClick={() => change('read', n.id)}>Mark as read</button>}{!n.dismissed && <button type="button" onClick={() => change('dismiss', n.id)}>Dismiss notification</button>}</div></> : <p>{n.message}</p>}
        </article></li>)}</ul>
    </details></section>;
}

export function NotificationSettings({ owner }: { owner: boolean }) {
    const [settings,setSettings] = useState<D>(), [error,setError] = useState('');
    async function reload() { setSettings(await call('notification-settings')); }
    useEffect(() => { reload().catch(e => setError(e.message)); },[]);
    if (!settings) return <section className="panel"><h2>Notification preferences</h2><p role={error?'alert':undefined}>{error || 'Loading notification preferences…'}</p></section>;
    const p=settings.preferences;
    return <section className="panel" aria-label="Notification preferences"><h2>Notification preferences</h2>
        <p>Your in-app list always remains available. Choose how new events reach you. Slack, Teams and device push need a connected service; unavailable outcomes remain visible below.</p>
        <Form key={p.version} label="Save notification preferences" onSubmit={async b => { await call('command/notification-preferences',{...b,version:p.version,quiet:b.quiet==='true',weekends:b.weekends==='true'}); await reload(); }}>
            <Field label="Notification channel" name="channel" defaultValue={p.channel} options={['in-app','email','slack','teams','push'].map(value=>({value,label:({'in-app':'In-app only',email:'Email',slack:'Slack — not connected',teams:'Teams — not connected',push:'Device push — not connected'} as D)[value]}))}/>
            <Field label="Notification frequency" name="cadence" defaultValue={p.cadence} options={[{value:'immediate',label:'As events arrive'},{value:'daily',label:'Daily digest'}]}/>
            <Field label="Your time zone" name="timezone" defaultValue={p.timezone}/>
            <Field label="Quiet hours" name="quiet" defaultValue={String(p.quiet)} options={[{value:'true',label:'Hold non-urgent notifications'},{value:'false',label:'No quiet hours'}]}/>
            <Field label="Quiet hours start" name="quietStart" type="time" defaultValue={p.quietStart}/>
            <Field label="Quiet hours end" name="quietEnd" type="time" defaultValue={p.quietEnd}/>
            <Field label="Quiet weekends" name="weekends" defaultValue={String(p.weekends)} options={[{value:'false',label:'Use daily hours on weekends'},{value:'true',label:'Hold throughout weekends'}]}/>
            <Field label="Daily digest time" name="digestAt" type="time" defaultValue={p.digestAt}/>
        </Form>
        <p>Only owner-marked urgent events bypass your digest and quiet hours. Pending sends follow your current settings. Delivery attempts are consumed once; an uncertain outcome is never automatically resent.</p>
        {owner && <><details><summary>Approval reminder schedule</summary><Form key={settings.nudgePolicy.version} label="Save approval reminder schedule" onSubmit={async b=>{await call('command/notification-nudge-policy',{...b,version:settings.nudgePolicy.version,enabled:b.enabled==='true',hours:Number(b.hours)});await reload();}}>
            <Field label="Approval reminders" name="enabled" defaultValue={String(settings.nudgePolicy.enabled)} options={[{value:'false',label:'Off'},{value:'true',label:'Remind current approvers'}]}/>
            <Field label="Hours between reminders" name="hours" type="number" defaultValue={settings.nudgePolicy.hours}/>
        </Form><p>Reminders retain the current approval step and original queue age. Escalation and out-of-office routing remain separate approval controls.</p></details><details><summary>Urgent notification events</summary><p>Mark only event families that need immediate attention for all recipients.</p><Form label="Save notification urgency" onSubmit={async b => { const current=await call('notification-settings'); await call('command/notification-urgency',{type:b.type,version:current.urgency.find((u:D)=>u.type===b.type)?.version??0,urgent:b.urgent==='true'}); await reload(); }}>
            <Field label="Notification event" name="type" options={Object.entries(labels).map(([value,label])=>({value,label}))}/>
            <Field label="Urgency" name="urgent" defaultValue="false" options={[{value:'false',label:'Respect recipient schedule'},{value:'true',label:'Deliver immediately'}]}/>
        </Form><p>Immediate event families: {settings.urgentTypes.map((type:string)=>labels[type]).join(', ') || 'None'}</p></details></>}
        <details><summary>Notification delivery history</summary>{!settings.deliveries.length?<p>No delivery attempts yet.</p>:<ul className="ruled-list">{Array.from(new Map<string,D>(settings.deliveries.map((d:D)=>[d.batch,d])).values()).reverse().map((d:D)=><li key={d.batch}>{when(d.at)} · {d.channel} · {d.cadence==='daily'?'Daily digest':'Individual notice'} · {d.status} · {d.count} notification{d.count===1?'':'s'}{d.code==='channel-not-connected'?' · Connect this channel before delivery can succeed.':d.code==='mail-not-configured'?' · Email is not configured.':d.code==='source-unavailable'?' · Source or recipient access changed.':''}</li>)}</ul>}</details>
    </section>;
}
