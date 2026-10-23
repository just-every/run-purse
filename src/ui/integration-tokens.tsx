import { useEffect, useState } from 'react';
import { Chip, Field, Form, Table, when, type D } from './shared';

type Integration = {
    id: string; name: string; requesterEmail: string; createdAt: string;
    rotatedAt?: string; revokedAt?: string; generation: number; scope: 'create-purchase-requests' | 'read-purchase-orders'; suppliers: string[]; expiresAt?: string;
};
type Requester = { id: string; email: string; name: string };
async function request(path = '', input?: D) {
    const response = await fetch('/api/purse/integration-tokens' + path, input ? {
        method: 'POST', headers: { 'content-type': 'application/json', origin: window.location.origin },
        body: JSON.stringify(input),
    } : undefined);
    const body = await response.json() as D;
    if (!response.ok) throw new Error(body.error || 'Unable to manage integration tokens.');
    return body;
}

/** Settings is owner-only; each token operation also checks the native owner session. */
export function IntegrationTokens() {
    const [tokens, setTokens] = useState<Integration[]>([]);
    const [suppliers, setSuppliers] = useState<D[]>([]);
    const [requesters, setRequesters] = useState<Requester[]>([]);
    const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
    const [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [secret, setSecret] = useState('');
    useEffect(() => {
        let active = true;
        request().then(body => {
            if (active) { setTokens(body.tokens); setRequesters(body.requesters); setSuppliers(body.suppliers); setLoaded(true); }
        }).catch(e => { if (active) setError(e.message || 'Unable to load integration tokens.'); });
        return () => { active = false; };
    }, []);
    async function change(path: string, input: D, message: string) {
        setSecret(''); setError(''); setNotice(''); setBusy(true);
        try {
            const body = await request(path, input);
            setTokens(previous => body.deleted ? previous.filter(t => t.id !== body.integration.id) : [body.integration, ...previous.filter(t => t.id !== body.integration.id)]);
            setSecret(body.token || ''); setNotice(message);
        } finally { setBusy(false); }
    }
    async function action(token: Integration, verb: 'rotate' | 'revoke' | 'delete') {
        try { await change('/' + encodeURIComponent(token.id) + '/' + verb, {}, verb === 'rotate' ? 'Token rotated. Previous token access has ended.' : verb === 'revoke' ? 'Token revoked.' : 'Integration deleted. Token access has ended; purchasing history is retained.'); }
        catch (e) { setError((e as Error).message || 'Unable to update integration token.'); }
    }
    return <section className="panel" aria-label="Integration tokens">
        <h3>Integration tokens</h3>
        <p className="quiet">Create a token for one active native requester. It can create purchase request drafts only. The requester reviews and submits drafts in Requests; normal approval remains required.</p>
        {error && <p role="alert">{error}</p>}
        {!loaded && !error && <p role="status">Loading integration tokens…</p>}
        {notice && <p role="status">{notice}</p>}
        {secret && <div>
            <p>Copy this token now. It is shown once and cannot be retrieved after dismissal. Keep it private.</p>
            <label className="field field-wide">New integration token<textarea aria-label="New integration token" readOnly value={secret} wrap="soft" spellCheck={false} autoComplete="off" style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', overflowWrap: 'anywhere', wordBreak: 'break-all' }}/></label>
            <button type="button" onClick={() => setSecret('')}>Dismiss token</button>
        </div>}
        <Table heads={['Integration', 'Requester / mapped suppliers', 'Scope', 'Status', 'Created / rotated', '']}>
            {tokens.map(token => <tr key={token.id}>
                <td style={{ overflowWrap: 'anywhere' }}>{token.name}</td><td className="email-cell">{token.scope === 'read-purchase-orders' ? token.suppliers.map(id => suppliers.find(s => s.id === id)?.name ?? id).join(', ') : token.requesterEmail}</td>
                <td>{token.scope === 'read-purchase-orders' ? 'Read PO and bill status only' : 'Create purchase request drafts'}{token.expiresAt && <p>Expires {when(token.expiresAt)}</p>}</td><td><Chip>{token.revokedAt ? 'Revoked' : token.expiresAt && token.expiresAt <= new Date().toISOString() ? 'Expired' : 'Active'} · generation {token.generation}</Chip>{token.revokedAt && <p>{when(token.revokedAt)}</p>}</td>
                <td>{when(token.createdAt)}{token.rotatedAt && <p>Rotated {when(token.rotatedAt)}</p>}</td>
                <td>{!token.revokedAt && <><button type="button" disabled={busy} onClick={() => action(token, 'rotate')}>Rotate token</button>{' '}<button type="button" disabled={busy} onClick={() => action(token, 'revoke')}>Revoke token</button>{' '}</>}<button type="button" disabled={busy} onClick={() => action(token, 'delete')}>Delete integration</button></td>
            </tr>)}
        </Table>
        {loaded && tokens.length === 0 && <p>No integration tokens created.</p>}
        <fieldset disabled={busy || !loaded || requesters.length === 0} style={{ minWidth: 0 }}>
            <legend>Create integration token</legend>
            <Form label="Create integration token" onSubmit={b => change('', b, 'Token created.')}>
                <Field label="Integration name" name="name"/>
                <Field label="Integration requester" name="requesterEmail" options={requesters.map(r => ({ value: r.email, label: r.name + ' · ' + r.email }))}/>
            </Form>
        </fieldset>
        {loaded && requesters.length === 0 && <p>An active native requester must sign in before a token can be bound.</p>}
        <fieldset disabled={busy || !loaded || suppliers.length === 0} style={{minWidth:0}}>
            <legend>Create read-only PO token</legend>
            <p>One named integration can read only the mapped supplier’s PO headers, lines, amounts and bill status. Payment status is unknown until a payment return exists. No originals, comments, requests, approvals or credentials. Every read is audited; up to 60 reads per minute. Rotation keeps the original expiry and mapping.</p>
            <Form label="Create read-only PO token" onSubmit={b => change('', {name:b.name,scope:'read-purchase-orders',suppliers:[b.supplier],expiresDays:b.expiresDays}, 'Read-only PO token created.')}>
                <Field label="PO integration name" name="name"/>
                <Field label="Mapped supplier" name="supplier" options={suppliers.map(s => ({value:s.id,label:s.name}))}/>
                <Field label="Expires in days (1–30)" name="expiresDays" type="number" defaultValue="7"/>
            </Form>
        </fieldset>
    </section>;
}
