import { useEffect, useState } from 'react';
import { call, when, type D } from './shared';
const labels: D = { 'approval-needed': 'Approval needed', returned: 'Request returned', approved: 'Request approved', 'comment-mention': 'Comment mention', 'receipt-needed': 'Receipt needed' };
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
