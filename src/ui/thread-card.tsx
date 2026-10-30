import { Separated } from './separated';
import { useState, type ReactNode } from 'react';
import { Glyph, teamName, type Team } from '../site/landing/parts/Glyph';
import { money, calendarDay, type D } from './shared';
import { askedLabel, channelOf, checks, decisionOf, firstName, initials, nextStep, orderOf, personName, tone, verbFor } from './thread-model';

const teams = Object.fromEntries(Object.entries(teamName).map(([key, name]) => [name.toLowerCase(), key as Team]));
/** The team's glyph from the brand set where the team has one, else a filled dot. */
export function TeamMark({ team }: { team: string }) { const key = teams[team.toLowerCase()]; return key ? <Glyph team={key} className="team-glyph"/> : <span className="team-dot" aria-hidden="true"/>; }

/** The coded line as page 03 drafts it: quantity × unit price = total. Supplier leads the coding line. */
function lineSummary(r: D) {
    const [first] = r.lines, extras = r.freightMinor + r.taxMinor;
    const head = r.lines.length === 1 ? <><strong>{first.description} × {first.quantity}</strong> · {money(first.unitMinor, r.currency)} = {money(first.totalMinor, r.currency)}</> : <><strong>{first.description} + {r.lines.length - 1} more</strong> · {money(r.lines.reduce((n: number, l: D) => n + l.totalMinor, 0), r.currency)}</>;
    return <Separated><>{head}{extras > 0 && <> + {money(extras, r.currency)} {r.taxMinor ? r.freightMinor ? 'freight and tax' : 'tax' : 'freight'} = {money(r.totalMinor, r.currency)}</>}</></Separated>;
}
function coding(r: D) { const categories = [...new Set(r.lines.map((l: D) => l.category))].join(', '), projects = [...new Set(r.lines.map((l: D) => l.project))].join(', '); return `${r.supplierSnapshot?.name ? r.supplierSnapshot.name + ' · ' : ''}${categories} · ${projects} · ${r.location} · need by ${calendarDay(r.needDate).replace(/, \d{4}$/, '')}`; }

/** One request in the thread: the requester's own words in a bubble, and its coded card hung under it,
 * ending in the viewer's verb when it waits on them. A decided request folds to one grey line. */
export function ThreadItem({ r, at, data, actor, mutate, decided, together, opened, onOpen, children }: {
    r: D; at?: string; data: D; actor: D; mutate: (op: string, b: D) => Promise<any>;
    decided: boolean; together: boolean; opened: boolean; onOpen: (button: HTMLButtonElement) => void; children?: ReactNode;
}) {
    const name = personName(data, r.requesterEmail), timeZone = data.business[0]?.timezone;
    const verb = together ? null : verbFor(data, actor, r), [asking, setAsking] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const run = async (op: string, body: D) => { setBusy(true); setError(''); try { await mutate(op, body); setAsking(false); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
    const chips = checks(data, actor, r).map(c => together && c.label === 'in budget ✓' ? { label: 'together over budget', tone: 'warn' as const } : c);
    const reason = 'Approved in the request thread: ' + (chips.filter(c => c.tone === 'ok').map(c => c.label.replace(' ✓', '')).join(', ') || 'reviewed');
    const decision = decisionOf(data, r), order = orderOf(data, r), step = nextStep(data, actor, r);
    return <Separated><article className={`thread-item${verb ? ' is-waiting' : ''}`} id={'request-' + r.id} aria-labelledby={'ask-' + r.id} data-waiting={verb ? 'yes' : undefined}>
        <header className="ask-head">
            <span className={`avatar avatar-${tone(r.requesterEmail || r.id)}`} aria-hidden="true">{initials(name || '?')}</span>
            <p className="ask-meta"><strong>{name || 'Imported request'}</strong>{r.costCentre && <span className="ask-team"> · {r.costCentre}</span>}<span className="ask-when">{askedLabel(at, timeZone)}{at ? ' · ' : ''}{r.imported ? 'imported' : channelOf(r)}</span></p>
        </header>
        <p className="bubble" id={'ask-' + r.id}>{r.title}</p>
        {decided ? <div className="decided-line">
            <span className="request-status" data-status={r.status}>{decision ? `${r.status} by ${decision.preparedBy?.label || (decision.email === actor.email ? 'you' : personName(data, decision.email))} · ${askedLabel(decision.at, timeZone)}${r.status === 'approved' ? ' ✓' : ''}` : `${r.status} · v${r.revision}`}</span>
            {order && <span className="decided-po"> · {order.number}</span>}
            {!opened && <button type="button" className="btn-quiet" onClick={e => onOpen(e.currentTarget)}>Open request</button>}
        </div> : <div className="request-card">
            <TeamMark team={r.costCentre || ''}/>
            <div className="card-main">
                <p className="card-line">{lineSummary(r)}</p>
                <p className="card-coding">{coding(r)}</p>
                <ul className="checks" aria-label="Checks">
                    <li className="chip-status"><span className="request-status" data-status={r.status}>{r.status} · v{r.revision}</span></li>
                    {chips.map(c => <li key={c.label} className={'check check-' + c.tone}>{c.label}</li>)}
                    {step && <li className="check check-who">{step}</li>}
                </ul>
            </div>
            <div className="card-verbs">
                {verb === 'approve' && <>{!chips.some(c => c.label === 'over budget') && <button type="button" className="btn-primary" disabled={busy} onClick={() => run('decision', { id: r.id, revision: r.revision, chainStep:r.approvalStep, approvalAttempt:r.approvalAttempt, decision: 'approved', reason })}>Approve</button>}<button type="button" disabled={busy} aria-expanded={asking} onClick={() => setAsking(!asking)}>Ask</button></>}
                {verb === 'submit' && <button type="button" className="btn-primary" disabled={busy} onClick={() => run('submit', { id: r.id, revision: r.revision })}>Submit</button>}
                {verb === 'convert' && <button type="button" className="btn-primary" disabled={busy} onClick={() => run('convert', { id: r.id, revision: r.revision })}>Raise PO</button>}
                {!opened && <button type="button" className="btn-quiet" onClick={e => onOpen(e.currentTarget)}>Open request</button>}
            </div>
        </div>}
        {asking && <AskReply who={firstName(name)} busy={busy} onCancel={() => setAsking(false)} onSend={question => run('decision', { id: r.id, revision: r.revision, chainStep:r.approvalStep, approvalAttempt:r.approvalAttempt, decision: 'returned', reason: question })}/>}
        {error && <p role="alert">{error}</p>}
        {children}
    </article></Separated>;
}

/** Ask opens a reply under the card: the question goes back to the requester with the request, for them to revise and resubmit. */
export function AskReply({ who, busy, onSend, onCancel }: { who: string; busy: boolean; onSend: (question: string) => void; onCancel: () => void }) {
    return <Separated><form className="ask-reply" onSubmit={e => { e.preventDefault(); const q = String(new FormData(e.currentTarget).get('question') ?? '').trim(); if (q) onSend(q); }}>
        <label className="field">Question for {who}<textarea name="question" required rows={2}/></label>
        <div className="ask-reply-end"><button className="btn-primary" disabled={busy}>Return with question</button><button type="button" onClick={onCancel}>Cancel</button></div>
        <p className="quiet">The request goes back to {who} with your question; they revise and resubmit it.</p>
    </form></Separated>;
}
