import { Form, Field, Table, Details, money, type D } from './shared';
const terms = ['Net 15', 'Net 30', 'Net 60', '2/10 Net 30', 'Due on receipt'];
export function Payables({ data, mutate, openOrder }: { data: D; mutate: (op: string, b: D) => Promise<any>; openOrder: (id: string, button: HTMLButtonElement) => void }) {
    const cash = data.cashRequirements;
    if (!cash) return null;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return <section className="panel"><h3>Payment terms and cash requirements</h3>
        <p>Buyer-confirmed cash planning only. No payment is scheduled or sent. Weeks start Monday; currencies stay separate. Expected PO liability includes received but unbilled goods, excludes canceled and closed balances, and subtracts approved bills once. Forecast dates default to the PO need date.</p>
        <Details label="Record bill terms and cash-planning approval">{data.invoice.filter((i: D) => !i.imported).map((i: D) => {
            const p = data.payable.find((p: D) => p.invoice === i.id), o = data.order.find((o: D) => o.id === i.order);
            return <section className="invoice" key={i.id}><h4>{i.reference} · {o.number} · {money(i.totalMinor, i.currency)}</h4>
                {p?.approvedAt ? <p>Approved for cash planning · {p.term} · Due {p.dueDate}</p> : <><Form label="Save bill terms" initial={{ invoice: i.id, version: p?.version ?? 0 }} onSubmit={b => mutate('payable-terms', b)}>
                    <Field label="Invoice date" name="invoiceDate" type="date" defaultValue={p?.invoiceDate ?? ''}/><Field label="Payment term" name="term" options={terms.map(value => ({ value, label: value }))} defaultValue={p?.term ?? ''}/><Field label="Terms evidence" name="reason" defaultValue={p?.reason ?? ''}/>
                </Form>{p && <><p>Due {p.dueDate}{p.discountDate && <> · 2% discount through {p.discountDate}</>}</p><Form label="Approve for cash planning" initial={{ invoice: i.id, version: p.version }} onSubmit={b => mutate('approve-payable', b)}><Field label="Cash-planning approval reason" name="reason"/></Form></>}</>}
            </section>;
        })}</Details>
        <h4>Bills due by week</h4>
        <Table heads={['Invoice', 'PO', 'Week', 'Due', 'Amount', 'Discount']} figures={['Amount']}>{cash.bills.map((p: D) => <tr key={p.id}><td>{p.reference}</td><td><button onClick={e => openOrder(p.order, e.currentTarget)}>{p.number}</button></td><td>{p.week}</td><td>{p.dueDate}</td><td className="figure">{money(p.amountMinor, p.currency)}</td><td>{p.discountDate ? <>{money(p.discountMinor, p.currency)} through {p.discountDate} · {today <= p.discountDate ? 'Deadline not passed' : 'Expired'}</> : 'None'}</td></tr>)}</Table>
        <h4>Cash requirements by week</h4>
        <Table heads={['Week', 'Currency', 'Approved bills', 'Expected PO liability', 'Total']} figures={['Approved bills', 'Expected PO liability', 'Total']}>{cash.weeks.map((w: D) => <tr key={w.week + w.currency}><td>{w.week}</td><td>{w.currency}</td><td className="figure">{money(w.billsMinor, w.currency)}</td><td className="figure">{money(w.commitmentsMinor, w.currency)}</td><td className="figure">{money(w.totalMinor, w.currency)}</td></tr>)}</Table>
        <Details label="Expected invoices and source POs"><Table heads={['PO', 'Expected invoice', 'Basis', 'Remaining liability']} figures={['Remaining liability']}>{cash.commitments.map((o: D) => <tr key={o.order}><td><button onClick={e => openOrder(o.order, e.currentTarget)}>{o.number}</button></td><td>{o.expectedDate}</td><td>{o.basis}</td><td className="figure">{money(o.amountMinor, o.currency)}</td></tr>)}</Table>
            <Form label="Save expected invoice date" onSubmit={b => mutate('cash-expectation', { ...b, version: data.cashExpectation.find((e: D) => e.order === b.order)?.version ?? 0 })}><Field label="Forecast PO" name="order" options={data.order.filter((o: D) => o.issuedAt && !o.imported && ['issued', 'amendment-pending'].includes(o.status)).map((o: D) => ({ value: o.id, label: o.number }))}/><Field label="Expected invoice date" name="expectedDate" type="date"/><Field label="Forecast reason" name="reason"/></Form>
        </Details>
    </section>;
}
