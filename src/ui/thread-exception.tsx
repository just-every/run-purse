import { useState } from 'react';
import { money, type D } from './shared';
import { AskReply } from './thread-card';
import { channelOf, firstName, holdsAuthority, personName, type Exception } from './thread-model';

/** The policy budget drawn to one linear scale: on order (solid), approved without a PO (outline) and
 * pending (pale tangelo) laid end to end, with the cerise end mark at the budget that pending crosses. */
function BudgetBar({ e, currency }: { e: Exception; currency: string }) {
    const budget = e.policy.budgetMinor, total = e.onOrderMinor + e.approvedMinor + e.pendingMinor, scale = Math.max(budget, total) || 1;
    const pct = (n: number) => `${(n / scale) * 100}%`, a = e.onOrderMinor, b = a + e.approvedMinor;
    const label = `${e.policy.name}: on order ${money(e.onOrderMinor, currency)}, approved ${money(e.approvedMinor, currency)}, pending ${money(e.pendingMinor, currency)} against ${money(budget, currency)}; ${money(e.overMinor, currency)} over`;
    return <div className="budget">
        <div className="budget-row">
            <svg className="budget-bar" role="img" aria-label={label} width="100%" height="28" preserveAspectRatio="none">
                <defs><clipPath id={'clip-' + e.policy.id}><rect x="0" y="4" width={pct(total)} height="20" rx="6"/></clipPath></defs>
                <g clipPath={`url(#clip-${e.policy.id})`}>
                    <rect className="band-pending" x={pct(b)} y="4" width={pct(e.pendingMinor)} height="20"/>
                    <rect className="band-approved" x={pct(a)} y="4" width={pct(e.approvedMinor)} height="20"/>
                    <rect className="band-on-order" x="0" y="4" width={pct(e.onOrderMinor)} height="20"/>
                </g>
                <rect className="band-approved-edge" x={pct(a)} y="5" width={pct(e.approvedMinor)} height="18" fill="none"/>
                <line className="budget-end" x1={pct(budget)} x2={pct(budget)} y1="0" y2="28"/>
            </svg>
            <span className="budget-over">{money(e.overMinor, currency)} over budget</span>
        </div>
        <ul className="budget-legend">
            <li><i className="key key-on-order"/>on order {money(e.onOrderMinor, currency)}</li>
            <li><i className="key key-approved"/>approved, PO not issued {money(e.approvedMinor, currency)}</li>
            <li><i className="key key-pending"/>pending {money(e.pendingMinor, currency)}</li>
        </ul>
    </div>;
}

/** The one exception on the thread: requests that together overfill their budget, Purse's check of it, and the
 * verbs for the policy's approver. It hangs under the requests it joins; cerise appears nowhere else. */
export function ThreadException({ e, data, actor, mutate }: { e: Exception; data: D; actor: D; mutate: (op: string, b: D) => Promise<any> }) {
    const p = e.policy, currency = p.currency, [asking, setAsking] = useState<D>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const can = e.requests.every(r => holdsAuthority(data, actor, r)), approver = p.approver === actor.email ? 'You' : personName(data, p.approver);
    const run = async (op: string, body: D) => { setBusy(true); setError(''); try { await mutate(op, body); setAsking(undefined); } catch (x) { setError((x as Error).message); } finally { setBusy(false); } };
    const who = (r: D) => firstName(personName(data, r.requesterEmail)), short = (r: D) => r.lines.length === 1 ? r.lines[0].description : r.title;
    const fitsText = e.fits.map(r => `${who(r)}'s ${money(r.totalMinor, currency)}`).join(' and ');
    return <section className="thread-exception" aria-label={`${p.name} budget exception`}>
        <div className="exception-card">
            <p className="card-line"><span className="exception-dot" aria-hidden="true"/><strong>{p.name}</strong> · budget {money(p.budgetMinor, currency)}</p>
            <ul className="exception-asks">{e.requests.map(r => <li key={r.id}><strong>{channelOf(r)}</strong> · {personName(data, r.requesterEmail)} · {short(r)} · {money(r.totalMinor, currency)}</li>)}</ul>
            <BudgetBar e={e} currency={currency}/>
        </div>
        <div className="purse-says"><img src="/brand/mark-32.svg" alt="Purse" width="28" height="28"/><p>Approving {e.requests.length === 2 ? 'both' : 'all ' + e.requests.length} puts {p.name} {money(e.overMinor, currency)} over its {money(p.budgetMinor, currency)}, and Purse would refuse the last approval. {fitsText ? `Approve ${fitsText} and it ends ${money(e.underIfFitsMinor, currency)} under; ` : ''}{e.rest.map(who).join(' and ')} would need a budget change or a return.</p></div>
        <div className="exception-verbs">
            <p className="exception-for"><strong>{approver}</strong> · {p.name} approver</p>
            {can && <div className="verbs">
                {e.fits.map((r, i) => <button key={r.id} type="button" className={i === 0 ? 'btn-primary' : ''} disabled={busy} onClick={() => run('decision', { id: r.id, revision: r.revision, decision: 'approved', reason: `Approved in the request thread: fits ${p.name} with ${money(e.underIfFitsMinor, currency)} left` })}>Approve {who(r)}'s</button>)}
                {e.rest.map(r => <button key={r.id} type="button" disabled={busy} aria-expanded={asking?.id === r.id} onClick={() => setAsking(asking?.id === r.id ? undefined : r)}>Ask {who(r)}</button>)}
            </div>}
        </div>
        {asking && <AskReply who={who(asking)} busy={busy} onCancel={() => setAsking(undefined)} onSend={question => run('decision', { id: asking.id, revision: asking.revision, decision: 'returned', reason: question })}/>}
        {error && <p role="alert">{error}</p>}
    </section>;
}
