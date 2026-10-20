import { Table, money, calendarDay, type D } from './shared';
/** A quiet sketch of the request thread still to come: a bubble, its card and a waiting verb. Drawn, not written. */
function EmptyThread() { return <div className="empty-thread" aria-hidden="true"><span className="empty-ask"><i className="empty-avatar"/><i className="empty-bubble"/></span><span className="empty-card"><i className="empty-dot"/><i className="empty-line"/><i className="empty-line empty-line-short"/><i className="empty-verb"/></span><span className="empty-ask empty-ask-late"><i className="empty-avatar empty-avatar-tangelo"/><i className="empty-bubble empty-bubble-short"/></span></div>; }
/** The workspace before the business exists: what Purse needs first, beside the thread it will hold. */
export function EmptyWorkspace({ owner, onSetUp }: { owner: boolean; onSetUp: () => void }) {
    return <section className="empty-state"><div><h1 className="thread-title">Requests,<span>once you set up.</span></h1><p className="lead">Start with business codes, people and approval policies. Requests from every team then arrive here as they come in.</p>{owner ? <button className="btn-primary" onClick={onSetUp}>Set up business</button> : <p className="quiet">The owner sets up the business first.</p>}</div><EmptyThread/></section>;
}
/** Overview: the business name, one figure card per currency and approvals waiting, then overdue receiving and renewals. */
export function Overview({ data, onSetUp }: {
    data: D;
    onSetUp: () => void;
}) {
    if (!data.business.length) return <EmptyWorkspace owner onSetUp={onSetUp}/>;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = data.order.filter((o: D) => o.status === 'issued' && o.needDate < today && o.positions.some((p: D) => p.outstanding > 0));
    const renewals = data.supplier.filter((s: D) => s.renewal).sort((a: D, b: D) => a.renewal.localeCompare(b.renewal));
    return <>
        <h1 className="page-title">{data.business[0].name}</h1>
        <section className="figures">{Object.entries(data.totals).map(([c, n]) => <article key={c} className="figure-card"><small>Outstanding commitments</small><h2>{money(n as number, c)}</h2></article>)}<article className="figure-card"><small>Awaiting approval</small><h2>{data.request.filter((r: D) => r.status === 'pending').length}</h2></article></section>
        <h2>Overdue receiving</h2>
        {overdue.length ? <Table stack heads={['PO', 'Due']}>{overdue.map((o: D) => <tr key={o.id}><td className="record-id">{o.number}</td><td className="figure-cell">{calendarDay(o.needDate)}</td></tr>)}</Table> : <p className="quiet">None</p>}
        <h2>Supplier renewals</h2>
        {renewals.length ? <Table heads={['Supplier', 'Renewal', 'Contract reference']}>{renewals.map((s: D) => <tr key={s.id}><td>{s.name}</td><td className="figure-cell">{calendarDay(s.renewal)}</td><td>{s.contractRef}</td></tr>)}</Table> : <p className="quiet">None</p>}
        <p className="closing-note">Follow a need from request to approval, order, receipt and invoice evidence. Each decision stays attached to the exact revision.</p>
    </>;
}
