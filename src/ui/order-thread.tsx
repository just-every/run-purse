import { useEffect, useState } from 'react';
import { call, Form, Table, when, type D } from './shared';

const labels: Record<string, string> = { accepted: 'Provider accepted; mailbox delivery unconfirmed', received: 'Supplier reply received; sender identity unverified', uncertain: 'Uncertain; investigate before composing another message', suppressed: 'Suppressed locally', rejected: 'Provider rejected', rate_limited: 'Provider rate limited', unavailable: 'Mail unavailable' };
/** Place this section inside PO follow-up so live replies and chase outcomes share one history. */
export function OrderThread({ order, maySend = false, changed }: { order: D; maySend?: boolean; changed?: () => void | Promise<void> }) {
    const [history, setHistory] = useState<D | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(() => crypto.randomUUID());
    const path = 'order-thread/' + encodeURIComponent(order.id);
    const refresh = async () => { setHistory(await call(path)); };
    useEffect(() => { let active = true; setHistory(null); setError(''); setAttempt(crypto.randomUUID()); call(path).then(result => { if (active) setHistory(result); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [order.id]);
    if (!order.issuedAt) return null;
    const filePath = (message: D, file: D) => `/api/purse/${path}/messages/${encodeURIComponent(message.id)}/files/${encodeURIComponent(file.id)}`;
    return <section aria-label="Supplier message thread"><h3>Supplier messages and follow-up</h3>
        <p className="quiet">Buyer emails and supplier replies are shared with this PO’s requester. Supplier messages are untrusted correspondence and do not change approval, quantities, prices or promised dates.</p>
        {error && <p role="alert">{error}</p>}
        {history?.messages.length === 0 && <p>No supplier messages have been recorded.</p>}
        <ul className="ruled-list">{history?.messages.map((message: D) => <li key={message.id}>
            <p>{message.direction === 'outbound' ? 'Buyer question' : 'Supplier email reply'} · revision {message.revision} · {when(message.at)}</p>
            <p>{message.direction === 'outbound' ? `${message.email} → ${message.recipient}` : message.providerSender} · {labels[message.status] ?? message.status}</p>
            <p>{message.subject || 'No subject'}</p><div>{message.body.split(/\r?\n/).map((line: string, index: number) => <p key={index}>{line || '\u00a0'}</p>)}</div>
            {message.files.length > 0 && <ul>{message.files.map((file: D) => <li key={file.id}>{file.erasure || message.erasure ? <span>Original withdrawn by personal-data erasure</span> : <a href={filePath(message, file)}>{file.name}</a>} · {file.size} bytes</li>)}</ul>}
            {maySend && message.original && !message.original.erasure && !message.erasure && <p><a href={filePath(message, message.original)}>Download original provider source</a></p>}
            {message.direction === 'outbound' && <p>{message.replyRevokedAt ? <>Reply routing withdrawn {when(message.replyRevokedAt)}.</> : <>Reply routing expires {when(message.replyExpiresAt)}. {maySend && <button type="button" onClick={async () => { try { await call(`${path}/messages/${encodeURIComponent(message.id)}/revoke`, {}); await refresh(); await changed?.(); } catch (error) { setError((error as Error).message); } }}>Withdraw reply routing</button>}</>}</p>}
        </li>)}</ul>
        {history && history.chases.length > 0 && <><h4>Recorded chase outcomes</h4><Table heads={['When', 'Action', 'Outcome']}>
            {history.chases.map((event: D) => <tr key={event.id}><td>{when(event.at)}</td><td>{event.kind === 'chase' ? `Chase ${event.sequence}` : 'Buyer escalation'}</td><td>{labels[event.outcome.status] ?? event.outcome.status}</td></tr>)}
        </Table></>}
        {maySend && order.status === 'issued' && !order.imported && !order.adoption && !order.amendedBy && <details className="disclosure"><summary>Email supplier a question</summary><Form key={attempt} label="Send supplier question" onSubmit={async input => { await call('order-thread', { order: order.id, revision: order.revision, attempt, recipient: input.recipient, body: input.body, reason: input.reason, consent: input.consent === 'yes' }); setAttempt(crypto.randomUUID()); await refresh(); await changed?.(); }}>
            <label className="field">Supplier message contact<input name="recipient" type="email" required maxLength={254} defaultValue={order.supplierSnapshot?.contacts?.[0]?.email ?? ''}/></label>
            <label className="field field-wide">Question<textarea name="body" required maxLength={20_000}/></label>
            <label className="field">Message send reason<input name="reason" required maxLength={2000}/></label>
            <label><input name="consent" type="checkbox" value="yes" required/> I authorize sending this message about {order.number}, revision {order.revision}, to the contact above, with replies shared with the requester.</label>
        </Form></details>}
        <button type="button" onClick={async () => { try { await refresh(); } catch (error) { setError((error as Error).message); } }}>Refresh supplier messages</button>
    </section>;
}
