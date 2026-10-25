import { useState } from 'react';
import { call, type D } from './shared';
import { requestReauthentication } from './erasure-proof';

/** Owner retention period and the list of expired retained values: nothing leaves until the owner confirms. */
export function ErasureRetention({ meta, refresh, reload }: { meta: D; refresh: () => Promise<void>; reload: () => Promise<void> }) {
 const retention = meta.retention, [years, setYears] = useState(String(retention.years)), [warned, setWarned] = useState(false), [chosen, setChosen] = useState<string[]>([]), [consent, setConsent] = useState(false);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [receipt, setReceipt] = useState<D>();
 const perform = async (work: () => Promise<string | void>) => { setBusy(true); setError(''); setNotice(''); try { setNotice((await work()) || ''); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
 const number = Number(years), short = Number.isSafeInteger(number) && number < retention.default;
 return <div aria-label="Retention and ready to erase"><h3>Retention period</h3>
  <p>TIN and bank values and W-9 originals are kept for a whole number of years from a supplier's latest supported payable. Nothing is removed automatically.</p>
  {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  <fieldset disabled={busy} style={{ minWidth: 0 }}><legend>Retention in whole years</legend>
   <label className="field">Years to keep (minimum {retention.minimum}, default {retention.default})<input aria-label="Years to keep" type="number" min={retention.minimum} step={1} value={years} onChange={e => { setYears(e.target.value); setWarned(false); }} /></label>
   {short && <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={warned} onChange={e => setWarned(e.target.checked)} />IRS Pub. 583 suggests keeping tax-supporting records at least seven years. I choose a shorter period.</label>}
   {retention.warning && !short && <p className="quiet">{retention.warning}</p>}
   <button disabled={!Number.isSafeInteger(number) || (short && !warned)} onClick={() => void perform(async () => { await call('erasure/retention', { revision: meta.revision, years: number, warningAcknowledged: short && warned }); return 'Retention period saved. Nothing was removed.'; })}>Save retention period</button></fieldset>
  <h3>Ready to erase</h3>
  {retention.ready.length === 0 ? <p className="quiet">Nothing is past its retention period.{retention.waiting.length > 0 && ` ${retention.waiting.length} held value${retention.waiting.length === 1 ? '' : 's'} not yet due.`}</p> : <>
   <ul style={{ listStyle: 'none', padding: 0 }}>{retention.ready.map((item: D) => <li key={item.id}><label className="field" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={chosen.includes(item.id)} onChange={e => setChosen(e.target.checked ? [...chosen, item.id] : chosen.filter(id => id !== item.id))} />{item.label} · {item.supplierName} · last payable {item.latestPayable}, due {item.eligibleOn}</label></li>)}</ul>
   <button disabled={busy} onClick={() => void perform(requestReauthentication)}>Request native reauthentication</button>
   <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I confirm erasing the selected expired values. Purchasing, payable and tax history, totals, hashes and attestations stay and say the source values were since erased.</label>
   <button className="btn-primary" disabled={busy || !consent || chosen.length === 0} onClick={() => void perform(async () => { setReceipt(await call('erasure/ready', { revision: meta.revision, items: chosen, consent })); setChosen([]); setConsent(false); await reload(); return 'Expired values erased.'; })}>Erase selected expired values</button></>}
  {receipt && <div role="status"><h3>Retention receipt</h3><p>{receipt.items.length} expired value{receipt.items.length === 1 ? '' : 's'} erased. Reference: {receipt.anonymousReference}.</p></div>}
 </div>;
}
