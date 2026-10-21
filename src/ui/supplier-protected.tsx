import { useEffect, useRef, useState } from 'react';
import { call, type D } from './shared';

const fields = [
    { name: 'tin', label: 'TIN' },
    { name: 'bankAccount', label: 'Bank account' },
    { name: 'bankRouting', label: 'Bank routing number' },
];

/** All values stay in the dedicated native door; ordinary supplier saves never receive them. */
export function SupplierProtected({ supplier, owner, reload }: { supplier: D; owner: boolean; reload: () => Promise<void> }) {
    const path = 'supplier-protected/' + encodeURIComponent(supplier.id);
    const [metadata, setMetadata] = useState<D>(), [keys, setKeys] = useState<D>(), [error, setError] = useState('');
    const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const [revealed, setRevealed] = useState<{ field: string; value: string }>();
    const active = useRef(true), generation = useRef(0);
    useEffect(() => {
        active.current = true;
        void (async () => {
            try { const value = await call(path); if (active.current) setMetadata(value); }
            catch { if (active.current) setError('Unable to load protected values. Reload to try again.'); }
            // A refused metadata read appends audit history. Load the key
            // status afterwards so recovery has that settled revision.
            if (owner) {
                try { const value = await call('protected-keys'); if (active.current) setKeys(value); }
                catch { if (active.current) setError('Unable to load encryption status. Sign in again and reload.'); }
            }
        })();
        const hide = () => { generation.current++; setRevealed(undefined); };
        const onVisibility = () => { if (document.hidden) hide(); };
        window.addEventListener('pagehide', hide);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            active.current = false; generation.current++;
            window.removeEventListener('pagehide', hide);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [path, owner]);
    async function refresh() {
        const value = await call(path);
        if (active.current) setMetadata(value);
    }
    async function refreshKeys() { if (owner) { const value = await call('protected-keys'); if (active.current) setKeys(value); } }
    async function perform(work: () => Promise<void>) {
        generation.current++; setRevealed(undefined); setError(''); setNotice(''); setBusy(true);
        try { await work(); await refreshKeys(); }
        catch (e) {
            if (active.current) setError((e as Error).message || 'Protected operation refused.');
            // A refused operation can append audit history and advance the revision.
            await refresh().catch(() => {}); await refreshKeys().catch(() => {});
        } finally { if (active.current) setBusy(false); }
    }
    return <section className="panel" aria-label="Protected supplier values">
        <h3>Protected tax and bank values</h3>
        <p className="quiet">{metadata?.bankStatus ?? (error ? 'Protected values unavailable. Check installation encryption and recovery.' : 'Loading protected values…')}</p>
        {metadata && <dl>{fields.map(field => <div key={field.name}><dt>{field.label}</dt><dd>{metadata.masks[field.name] ?? 'Not recorded'}</dd></div>)}</dl>}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {owner && <>
            <p className="quiet">Reveal and encryption recovery require a native email confirmation in this browser within ten minutes. Development sign-in alone does not qualify.</p>
            <button type="button" disabled={busy} onClick={() => void perform(async () => {
                const response = await fetch('/auth/step-up', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'export', returnTo: '/app?tab=Suppliers' }) });
                if (!response.ok) throw new Error('Reauthentication request refused. Sign in again and retry.');
                if (active.current) setNotice('Reauthentication requested. If email delivery is configured, confirm its link in this browser, then return to this supplier. Local mail is suppressed; this request alone does not authorize reveal or encryption changes.');
            })}>Request native reauthentication</button>
        </>}
        {owner && metadata && <>
            {!supplier.mergedInto && <form className="record-form" autoComplete="off" onSubmit={e => {
                e.preventDefault(); const form = e.currentTarget, input = new FormData(form);
                const values = Object.fromEntries(fields.map(field => [field.name, input.get(field.name)]).filter(([, value]) => value !== ''));
                const body = { revision: metadata.revision, values, reason: input.get('reason'), evidence: input.get('evidence') };
                void perform(async () => {
                    try {
                        await call(path + '/store', body);
                    } finally { form.reset(); }
                    if (active.current) setNotice('Protected values saved. Bank details remain unverified and inactive for payment.');
                    await refresh(); await reload();
                });
            }}>
                <p className="quiet wide">Only the current owner can store or reveal these values. Blank fields keep their existing values. Change bank account and routing together. Matching-only identity above cannot recover these values.</p>
                <fieldset disabled={busy} className="wide" style={{ minWidth: 0 }}><legend>Store protected values</legend>
                    {fields.map(field => <label className="field" key={field.name}>{field.label + ' to store'}<input name={field.name} type="password" inputMode="numeric" autoComplete="off" maxLength={field.name === 'bankAccount' ? 17 : 9}/></label>)}
                    <label className="field">Private storage reason<input name="reason" type="password" autoComplete="off" required maxLength={2000}/></label>
                    <label className="field">Private evidence reference<input name="evidence" type="password" autoComplete="off" required maxLength={2000}/></label>
                    <button className="btn-primary" disabled={busy}>Store protected values</button>
                </fieldset>
            </form>}
            <form className="record-form" autoComplete="off" onSubmit={e => {
                e.preventDefault(); const form = e.currentTarget, input = new FormData(form);
                const body = { revision: metadata.revision, field: input.get('field'), reason: input.get('reason') };
                void perform(async () => {
                    const attempt = generation.current;
                    try {
                        const value = await call(path + '/reveal', body);
                        await refresh();
                        if (active.current && generation.current === attempt) setRevealed({ field: value.field, value: value.value });
                    } finally { form.reset(); }
                });
            }}>
                <fieldset disabled={busy} className="wide" style={{ minWidth: 0 }}><legend>Reveal one protected value</legend>
                    <label className="field">Protected field<select name="field" aria-label="Protected field" required>{fields.map(field => <option key={field.name} value={field.name}>{field.label}</option>)}</select></label>
                    <label className="field">Private reveal reason<input name="reason" type="password" autoComplete="off" required maxLength={2000}/></label>
                    <button className="btn-primary" disabled={busy}>Reveal protected value</button>
                </fieldset>
            </form>
            {revealed && <div role="region" aria-label="Revealed protected value">
                <p>{fields.find(field => field.name === revealed.field)?.label}</p>
                <output style={{ overflowWrap: 'anywhere' }}>{revealed.value}</output>{' '}
                <button type="button" onClick={() => { generation.current++; setRevealed(undefined); }}>Hide protected value</button>
            </div>}
        </>}
        {owner && keys && <details style={{ minWidth: 0 }}>
            <summary>Installation encryption and recovery</summary>
            <p>Applies to every supplier in this installation. Protected values remain encrypted and changes are audited.</p>
            <dl><div><dt>Active installation key</dt><dd>{keys.activeKeyAvailable ? 'Available' : 'Unavailable – configure an installation key privately before reentry'}</dd></div>
                <div><dt>Stored fields</dt><dd>{keys.stored}</dd></div><div><dt>Fields awaiting rotation</dt><dd>{keys.awaitingRotation}</dd></div>
                <div><dt>Unreadable fields</dt><dd>{keys.unreadable}</dd></div></dl>
            <p>To rotate, retain the existing key as the previous Worker secret and configure the new active Worker secret through private installation controls. Keep both secrets until this ceremony confirms that every stored field was reencrypted and checked. Never enter a key in this page, a command argument, logs or an archive.</p>
            <form className="record-form" autoComplete="off" onSubmit={e => {
                e.preventDefault(); const form = e.currentTarget, input = new FormData(form);
                void perform(async () => {
                    try {
                        const result = await call('protected-keys/rotate', { revision: keys.revision, reason: input.get('reason') });
                        if (active.current) setNotice(result.result);
                    } finally { form.reset(); }
                    await refreshKeys(); await refresh(); await reload();
                });
            }}><fieldset className="wide" style={{ minWidth: 0 }} disabled={busy || !keys.activeKeyAvailable || keys.unreadable > 0}>
                <legend>Rotate installation encryption</legend>
                <label className="field">Private rotation reason<input name="reason" type="password" autoComplete="off" required maxLength={2000}/></label>
                <button type="submit" disabled={busy}>Reencrypt and check all protected values</button>
            </fieldset></form>
            <p>{keys.previousKeyMayBeRemoved ? 'All stored fields are readable under the active key. The previous Worker secret may be removed privately.' : 'Keep the previous key. Rotation is incomplete while fields are unreadable or await rotation.'}</p>
            <p>Lost keys cannot be recovered. Restore the original installation secret privately if you have it. Otherwise, acknowledge the loss below and re-enter the values from their source. No escrow or plaintext copies exist.</p>
            {keys.unreadable > 0 && <form className="record-form" autoComplete="off" onSubmit={e => {
                e.preventDefault(); const form = e.currentTarget, input = new FormData(form);
                void perform(async () => {
                    try {
                        const result = await call('protected-keys/recover', { revision: keys.revision, reason: input.get('reason'), acknowledge: input.get('acknowledge') });
                        if (active.current) setNotice(result.result);
                    } finally { form.reset(); }
                    await refreshKeys(); await refresh(); await reload();
                });
            }}><fieldset className="wide" style={{ minWidth: 0 }} disabled={busy || !keys.activeKeyAvailable}>
                <legend>Acknowledge irreversible key loss</legend>
                <label className="field">Private recovery reason<input name="reason" type="password" autoComplete="off" required maxLength={2000}/></label>
                <label><input name="acknowledge" type="checkbox" value="discard-unreadable-and-reenter" required/> I understand that all unreadable fields will be permanently discarded and must be re-entered from their source.</label>
                <button type="submit" disabled={busy}>Discard unreadable values for reentry</button>
            </fieldset></form>}
        </details>}
        {!owner && <p className="quiet">Only the current native owner can change or reveal protected values.</p>}
    </section>;
}
