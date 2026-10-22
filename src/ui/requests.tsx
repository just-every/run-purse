import { TravelNewRequest } from './travel-form';
import { ApprovalEditNotices } from './approval-edit-notices';
import { GuidedIntake } from './guided-intake';
import { Fragment, useEffect, useState } from 'react';
import { EmailIntake } from './email-intake';
import { useRecord } from './use-record';
import { type D } from './shared';
import { RequestForm } from './request-form';
import { CatalogueRequest } from './catalogue-request';
import { RequestRecord } from './request-record';
import { ThreadItem } from './thread-card';
import { ThreadException } from './thread-exception';
import { askedTimes, channelOf, exceptions, isDecided, verbFor } from './thread-model';

const composerId = 'purse-composer';
/** The top bar's Ask Purse and the composer are one control: it opens Requests and focuses the composer. */
export function focusComposer() { requestAnimationFrame(() => requestAnimationFrame(() => { const input = document.getElementById(composerId); input?.scrollIntoView({ block: 'nearest' }); input?.focus(); })); }

/** Requests, as they come in: one centred thread of each requester's words and the card Purse coded from them,
 * filtered by team and channel, with decided requests folded above and the composer at the foot. */
export function Requests({ data, actor, mutate }: {
    data: D;
    actor: D;
    mutate: (op: string, b: D) => Promise<any>;
}) {
    const rawMutate = mutate;
    mutate = (op, input) => { const trip=data.request.find((request:D)=>request.id===input.id)?.purchaseType==='travel';return rawMutate(trip&&['submit','decision'].includes(op)?'travel-'+op:op,input); };
    const { id, heading, open, close } = useRecord(new URLSearchParams(window.location.search).get('request') || ''), [team, setTeam] = useState(''), [channel, setChannel] = useState(''), [draft, setDraft] = useState<string>();
    useEffect(() => { if (new URLSearchParams(window.location.search).has('ask')) focusComposer(); }, []);
    const business = data.business[0], asked = askedTimes(data), at = (r: D) => asked.get(r.id) ?? '';
    const all = [...data.request].sort((a: D, b: D) => at(a).localeCompare(at(b)) || a.id.localeCompare(b.id));
    const channels = [...new Set(all.map(channelOf))].sort();
    const shown = all.filter((r: D) => (!team || r.costCentre === team) && (!channel || channelOf(r) === channel));
    const decidedAt = (r: D) => data.decision.filter((d: D) => d.request === r.id).reduce((m: string, d: D) => d.at > m ? d.at : m, '');
    const decided = shown.filter((r: D) => isDecided(data, r)), lastDecided = decided.filter((r: D) => !r.imported).sort((a: D, b: D) => decidedAt(b).localeCompare(decidedAt(a)))[0];
    const folded = decided.filter((r: D) => r !== lastDecided), live = shown.filter((r: D) => !folded.includes(r));
    const exceptionList = exceptions(data, actor, live), joined = new Map(exceptionList.flatMap(e => e.requests.map(r => [r.id, e] as const)));
    const waiting = live.filter((r: D) => verbFor(data, actor, r) || (joined.has(r.id) && joined.get(r.id)!.requests.some(x => verbFor(data, actor, x) === 'approve')));
    const item = (r: D) => <ThreadItem key={r.id} r={r} at={asked.get(r.id)} data={data} actor={actor} mutate={mutate} decided={isDecided(data, r)} together={joined.has(r.id)} opened={id === r.id} onOpen={button => open(r.id, button)}>
        {id === r.id && <RequestRecord data={data} actor={actor} mutate={mutate} current={r} heading={heading} close={close}/>}
    </ThreadItem>;
    const chip = (label: string, value: string) => <button key={label} type="button" className="filter-chip" aria-pressed={team === value} onClick={() => setTeam(value)}>{label}</button>;
    return <section className="thread-screen" aria-label="Requests">
        <div className="thread-head">
            <h1 className="thread-title">Requests,<span>as they come in.</span></h1>
            <div className="thread-filters" role="group" aria-label="Filter requests">
                {chip('All teams', '')}{business.costCentres.map((c: string) => chip(c, c))}
                <label className="filter-select"><select aria-label="Channel" value={channel} onChange={e => setChannel(e.target.value)}><option value="">{channels.join(' · ') || 'All channels'}</option>{channels.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
            </div>
        </div>
        <ApprovalEditNotices data={data}/><div className="thread-waiting">{waiting.length ? <button type="button" className="waiting-chip" onClick={() => { const el = document.getElementById('request-' + waiting[0].id); el?.scrollIntoView({ block: 'center' }); el?.querySelector<HTMLButtonElement>('.card-verbs button, .verbs button')?.focus({ preventScroll: true }); }}>Waiting on you · {waiting.length}</button> : shown.length > 0 && <p className="waiting-none">Nothing waiting on you.</p>}</div>
        {actor.roles.includes('owner') && shown.some((r: D) => r.approvalNeedsReassignment) && <section aria-label="Needs reassignment"><h2>Needs reassignment</h2><p>Self-interested approvals are held. <a href="/app?tab=Settings">Choose another approver in SCIM settings</a>.</p>{shown.filter((r: D) => r.approvalNeedsReassignment).map((r: D) => <p key={r.id}>{r.title} · revision {r.revision}</p>)}</section>}
        <div className="thread">
            {folded.length > 0 && <details className="thread-fold" open={folded.some((request:D)=>request.id===id)}><summary>Earlier · {folded.length}</summary>{folded.map(item)}</details>}
            {live.map((r: D) => <Fragment key={r.id}>{item(r)}{exceptionList.filter(e => e.requests[e.requests.length - 1].id === r.id).map(e => <ThreadException key={e.policy.id} e={e} data={data} actor={actor} mutate={mutate}/>)}</Fragment>)}
            {!shown.length && <p className="thread-empty">{all.length ? 'No requests match these filters.' : 'No requests yet. Ask Purse for something to buy below, or connect email and integrations in Settings.'}</p>}
        </div>
        {actor.permissions.includes('request.create') && <>
            <TravelNewRequest data={data} actor={actor} mutate={mutate}/><GuidedIntake data={data} mutate={mutate}/>
            {draft !== undefined && <section className="draft-card" aria-labelledby="draft-heading"><div className="draft-head"><img src="/brand/mark-32.svg" alt="" width="26" height="26"/><h2 id="draft-heading">New purchase request</h2><button type="button" className="btn-quiet" onClick={() => setDraft(undefined)}>Cancel</button></div><p className="quiet">Code the lines, supplier and need date, then save the draft; you submit it for approval from its card.</p><RequestForm key={draft} data={data} prefillTitle={draft} mutate={async (op, b) => { const saved = await mutate(op, b); setDraft(undefined); return saved; }}/></section>}
            <CatalogueRequest data={data} mutate={mutate}/>
            <form className="composer" onSubmit={e => { e.preventDefault(); const input = e.currentTarget.elements.namedItem('ask') as HTMLInputElement; setDraft(input.value.trim()); input.value = ''; }}>
                <input id={composerId} name="ask" aria-label="Ask Purse for something to buy" placeholder="Ask Purse for something to buy…" autoComplete="off"/>
                <button type="submit" className="composer-send" aria-label="New purchase request"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.4 20.6 3.6 15.4 20.4l-3.9-6.1L3 11.4Z"/><path d="m11.5 14.3 9.1-10.7"/></svg></button>
            </form>
        </>}
        {(data.emailIntakeMayConfigure || data.emailIntakeMayReadReceipts || (data.emailIntake ?? []).length > 0) && <EmailIntake data={data} actor={actor} mutate={mutate}/>}
    </section>;
}
