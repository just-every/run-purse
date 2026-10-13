import { Table, money, type D } from './shared';
/** A blank order-book sheet beside the empty workspace: drawn, not written, so it adds no words. */
function BlankSheet() { return <div className="blank-sheet" aria-hidden="true"><span className="blank-sheet-dup blank-sheet-cream"/><span className="blank-sheet-dup blank-sheet-pink"/><span className="blank-sheet-top"><span className="blank-sheet-title"/>{[0, 1, 2, 3].map(i => <span key={i} className="blank-sheet-row"><i/><i/><i/></span>)}</span></div>; }
/** Overview: the business name, one figure card per currency and approvals waiting, then overdue receiving and renewals. */
export function Overview({ data, onSetUp }: {
    data: D;
    onSetUp: () => void;
}) {
    if (!data.business.length) return <section className="empty-state"><div><h1 className="page-title">Your purchasing workspace</h1><p className="lead">Start with business codes, people and approval policies.</p><button className="btn-primary" onClick={onSetUp}>Set up business</button></div><BlankSheet/></section>;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = data.order.filter((o: D) => o.status === 'issued' && o.needDate < today && o.positions.some((p: D) => p.outstanding > 0));
    const renewals = data.supplier.filter((s: D) => s.renewal).sort((a: D, b: D) => a.renewal.localeCompare(b.renewal));
    return <>
        <h1 className="page-title">{data.business[0].name}</h1>
        <section className="figures">{Object.entries(data.totals).map(([c, n]) => <article key={c} className="figure-card"><small>Outstanding commitments</small><h2>{money(n as number, c)}</h2></article>)}<article className="figure-card"><small>Awaiting approval</small><h2>{data.request.filter((r: D) => r.status === 'pending').length}</h2></article></section>
        <h2>Overdue receiving</h2>
        {overdue.length ? <Table stack heads={['PO', 'Due']}>{overdue.map((o: D) => <tr key={o.id}><td className="record-id">{o.number}</td><td className="figure-cell">{o.needDate}</td></tr>)}</Table> : <p className="quiet">None</p>}
        <h2>Supplier renewals</h2>
        {renewals.length ? <Table heads={['Supplier', 'Renewal', 'Contract reference']}>{renewals.map((s: D) => <tr key={s.id}><td>{s.name}</td><td className="figure-cell">{s.renewal}</td><td>{s.contractRef}</td></tr>)}</Table> : <p className="quiet">None</p>}
        <p className="closing-note">Follow a need from request to approval, order, receipt and invoice evidence. Each decision stays attached to the exact revision.</p>
    </>;
}
