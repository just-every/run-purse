import { useEffect, useState } from 'react';
import { call, type D } from './shared';

/** The encrypted supplement is a separate file; the ordinary installation archive stays unchanged. */
export function ProtectedArchive() {
    const [revision, setRevision] = useState<number>(), [busy, setBusy] = useState(false);
    const [error, setError] = useState(''), [notice, setNotice] = useState('');
    useEffect(() => {
        let active = true;
        call('protected-keys').then(value => { if (active) setRevision(value.revision); })
            .catch(() => { if (active) setError('Unable to load archive authority. Sign in and reload.'); });
        return () => { active = false; };
    }, []);
    async function perform(form: HTMLFormElement, operation: 'export' | 'restore') {
        const input = new FormData(form);
        setBusy(true); setError(''); setNotice('');
        try {
            const body: D = { revision, passphrase: input.get('passphrase'), reason: input.get('reason'), evidence: input.get('evidence'), include: input.get('include') };
            if (operation === 'restore') {
                const file = input.get('archive') as File;
                if (!file || file.size > 8 * 1024 * 1024) throw new Error('Choose an encrypted protected supplement of up to 8 MB.');
                try { body.archive = JSON.parse(await file.text()); } catch { throw new Error('Protected supplement is not a valid JSON file.'); }
            }
            const result = await call('protected-archive/' + operation, body);
            if (operation === 'export') {
                const url = URL.createObjectURL(new Blob([JSON.stringify(result.archive)], { type: 'application/json' }));
                const link = document.createElement('a'); link.href = url; link.download = 'purse-protected.purse-protected.json';
                document.body.appendChild(link); link.click(); link.remove();
                // Let the browser consume the download before releasing its encrypted bytes.
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                setNotice('Encrypted supplement downloaded. Keep it with the ordinary archive and store the passphrase separately.');
            } else setNotice(result.result);
        } catch (e) { setError((e as Error).message || 'Protected archive operation refused.'); }
        finally {
            form.reset();
            try { setRevision((await call('protected-keys')).revision); } catch { setRevision(undefined); }
            setBusy(false);
        }
    }
    return <section className="panel" aria-label="Encrypted protected archive">
        <h3>Encrypted protected archive</h3>
        <p>The ordinary installation archive excludes protected tax and bank values and sensitive matching data. Export the ordinary archive with <code>rer export</code>, then download this separate encrypted supplement before changing supplier records. Keep both files.</p>
        <p>Restore the ordinary archive into an empty installation with <code>rer import</code> first. Sign in as its current owner and configure a new installation encryption key privately. Restore this supplement before changing supplier records or entering protected values. Supplier records must match. The original installation key and access grants are never included.</p>
        <p>A private passphrase of at least 12 characters encrypts the supplement. Lost passphrases cannot be recovered. Both actions require native email confirmation in this browser within ten minutes.</p>
        {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        <button type="button" disabled={busy} onClick={async () => {
            setError('');
            try {
                const response = await fetch('/auth/step-up', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'export', returnTo: '/app?tab=Settings' }) });
                if (!response.ok) throw new Error('Native reauthentication request refused.');
                setNotice('Confirm the native email link in this browser, then return here. Local mail is suppressed; requesting a link alone grants no archive authority.');
            } catch { setError('Native reauthentication request refused. Sign in again and retry.'); }
        }}>Request archive reauthentication</button>
        {(['export', 'restore'] as const).map(operation => <form key={operation} className="record-form" autoComplete="off" onSubmit={e => { e.preventDefault(); void perform(e.currentTarget, operation); }}>
            <fieldset className="wide" disabled={busy || revision === undefined} style={{ minWidth: 0 }}>
                <legend>{operation === 'export' ? 'Export protected supplement' : 'Restore protected supplement'}</legend>
                {operation === 'restore' && <label className="field">Encrypted protected supplement<input name="archive" type="file" accept=".json,application/json" required/></label>}
                <label className="field">Private archive passphrase<input type="password" name="passphrase" autoComplete="off" minLength={12} maxLength={1024} required/></label>
                <label className="field">Private archive reason<input type="password" name="reason" autoComplete="off" maxLength={2000} required/></label>
                <label className="field">Private archive evidence reference<input type="password" name="evidence" autoComplete="off" maxLength={2000} required/></label>
                <label><input type="checkbox" name="include" value="protected-values-and-matching" required/> I explicitly choose to {operation} protected values and sensitive matching data in the encrypted supplement.</label>
                <button className="btn-primary" type="submit">{operation === 'export' ? 'Download encrypted supplement' : 'Restore encrypted supplement'}</button>
            </fieldset>
        </form>)}
    </section>;
}
