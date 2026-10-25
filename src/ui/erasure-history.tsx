import { useState } from 'react';
import { call, type D } from './shared';
import { requestReauthentication } from './erasure-proof';

const stamp = (value?: string) => value ? new Date(value).toLocaleString() : 'unknown';
/** How this installation's erasure history was established; a fresh destination acknowledges the limit before a journal-less restore. */
export function ErasureHistory({ meta, refresh }: { meta: D; refresh: () => Promise<void> }) {
 const history = meta.history, [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
 const perform = async (work: () => Promise<string | void>) => { setBusy(true); setError(''); setNotice(''); try { setNotice((await work()) || ''); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
 if (history.state === 'unverified') return <div aria-label="Erasure history" role="note"><h3>Erasure history unverified</h3>
  <p>“{history.label}”. This installation was restored from an archive made {stamp(history.archiveAt)} with no later journal, so erasures made after that backup may be unknown.</p>
  <p className="quiet">Acknowledged {stamp(history.acknowledgedAt)} by {history.acknowledgedBy}; restored {stamp(history.restoredAt)}. No journal was supplied. To verify, restore the latest archive into an empty installation with it as the journal.</p></div>;
 if (history.state === 'journal-supplied') return <div aria-label="Erasure history" role="note"><h3>Erasure history checked</h3><p>{history.label}; archive made {stamp(history.archiveAt)}.</p></div>;
 if (!meta.empty) return null;
 return <div aria-label="Restore acknowledgment"><h3>Before restoring an older backup</h3>
  <p>This installation is empty. Restoring an archive without the latest archive as its erasure journal cannot show erasures made after that backup. The restore is held until you acknowledge it.</p>
  {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  {history.state === 'acknowledged' ? <p role="status">Acknowledged {stamp(history.acknowledgedAt)}. The restore may now proceed without a journal.</p> : <>
   <button disabled={busy} onClick={() => void perform(requestReauthentication)}>Request native reauthentication</button>
   <button className="btn-primary" disabled={busy} onClick={() => void perform(async () => { await call('erasure/history', { revision: meta.revision, acknowledgment: 'erasure history unverified: supply your latest archive as the journal' }); })}>Acknowledge: erasure history unverified</button></>}
 </div>;
}
