import { BudgetScope } from './budget-scope';
import { useEffect, useState } from 'react';
import { call, Form, Field, Table, money, type D } from './shared';
const dimensions = [['department', 'Department'], ['project', 'Project'], ['location', 'Location'], ['supplier', 'Supplier'], ['category', 'Category'], ['glAccount', 'GL account']];
export function SpendReport({ data }: { data: D }) {
    const [report, setReport] = useState<D>(), [error, setError] = useState(''), [detail, setDetail] = useState<D>();
    async function load(filters: D = {}) {
        const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== ''));
        setReport(await call('spend-report?' + params)); setDetail(undefined); setError('');
    }
    useEffect(() => { load().catch(e => setError(e.message)); }, []);
    const shownDimensions = [...dimensions, ...(report?.customDimensions ?? []).map((field:D) => [field.value, field.label])];
    return <section><h1 className="page-title">Spend and commitments</h1>
        <p className="quiet">Current outstanding authority is reserved before PO issuance and committed after issuance. Actual is recorded invoice evidence, including exceptions; it is not a payment or matching confirmation. Currencies stay separate.</p>
        <p className="quiet">Inclusive period: need dates for outstanding authority; UTC entry dates for invoices. Policy budgets fund outstanding authority; actual is shown separately. Budget and available figures cover your visible records for the whole policy, while the three activity columns follow the filters.</p>
        <PeriodBudgets data={data}/>
        {error && <p role="alert">{error}</p>}
        {report && <><Form label="Filter spend" onSubmit={load}>
            <Field label="From date" name="from" type="date" required={false}/><Field label="Through date" name="through" type="date" required={false}/>
            {shownDimensions.map(([id, label]) => <label className="field" key={id}>{label}<select aria-label={label} name={id}><option value="">All {label.toLowerCase()}s</option>{report.choices[id].map((c: D) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>)}
            <Field label="Group by" name="groupBy" defaultValue="supplier" options={shownDimensions.map(([value, label]) => ({ value, label }))}/>
        </Form>
        <h2>Currency totals</h2><Table heads={['Currency', 'Reserved', 'Committed', 'Actual invoice evidence']}>
            {report.totals.map((r: D) => <tr key={r.currency}><td>{r.currency}</td>{['reserved', 'committed', 'actual'].map(k => <td key={k}><button onClick={() => setDetail({ label: r.currency + ' · ' + k, rows: report.rows.filter((s: D) => s.currency === r.currency && s.kind === k) })}>{money(r[k + 'Minor'], r.currency)}</button></td>)}</tr>)}
        </Table>{!report.rows.length && <p className="quiet">No records match these filters.</p>}
        <h2>By {shownDimensions.find(([id]) => id === report.groupBy)?.[1].toLowerCase()}</h2><Table heads={['Group', 'Currency', 'Reserved', 'Committed', 'Actual invoice evidence']}>
            {report.groups.map((r: D) => <tr key={r.value + r.currency}><td>{r.label}</td><td>{r.currency}</td>{['reserved', 'committed', 'actual'].map(k => <td key={k}><button aria-label={`${r.label} ${k} ${r.currency}`} onClick={() => setDetail({ label: r.label + ' · ' + k, rows: r.rows.filter((s: D) => s.kind === k) })}>{money(r[k + 'Minor'], r.currency)}</button></td>)}</tr>)}
        </Table>
        <h2>Undated policy budgets</h2><Table heads={['Policy', 'Budget', 'Available in visible scope', 'Reserved', 'Committed', 'Actual invoice evidence']}>
            {report.budgets.map((r: D) => <tr key={r.id}><td>{r.name}</td><td><button onClick={() => setDetail({ label: r.name, policy: r, rows: r.scopeRows })}>{money(r.budgetMinor, r.currency)}</button></td><td><button onClick={() => setDetail({ label: r.name, policy: r, rows: r.scopeRows })}>{money(r.availableMinor, r.currency)}</button></td>{['reserved', 'committed', 'actual'].map(k => <td key={k}><button onClick={() => setDetail({ label: r.name + ' · ' + k, policy: r, rows: r.rows.filter((s: D) => s.kind === k) })}>{money(r[k + 'Minor'], r.currency)}</button></td>)}</tr>)}
        </Table></>}
        {detail && <section className="record" key={detail.label} aria-label="Report source records"><h2>{detail.label}</h2>
            {detail.policy && <p>Policy {detail.policy.id} · budget {money(detail.policy.budgetMinor, detail.policy.currency)} · available {money(detail.policy.availableMinor, detail.policy.currency)}. Available subtracts all outstanding authority in your visible scope, including outside this period.</p>}
            <Table heads={['Request / source', 'Line / coding', 'Date / basis', 'Amount']}>
                {detail.rows.map((r: D, i: number) => <tr key={i}><td><strong>{r.title}</strong><p>{r.request}</p>{r.order && <a href={`/api/purse/download/order/${r.order}`}>{r.number}</a>}{r.deposit && <p>Imported prepaid deposit {r.reference} · counted once</p>}{r.invoice && <p>Invoice {r.reference} · {r.exception ? 'Exception present' : 'Recorded evidence'}</p>}
                    <details><summary>Source record</summary><ReportSource data={data} row={r}/></details></td>
                    <td>{r.description}<br/>{r.department} · {r.project} · {r.location}<br/>{r.category} · {r.supplierName}{r.glAccount && <> · GL {r.glAccount}</>}</td><td>{r.date}<br/>{r.kind}{r.sourceBasis && <p>{r.sourceBasis}</p>}</td><td>{money(r.amountMinor, r.currency)}</td></tr>)}
            </Table><p>Source rows total: {detail.rows.length ? money(detail.rows.reduce((n: number, r: D) => n + r.amountMinor, 0), detail.rows[0].currency) : 'No amount'}</p><button onClick={() => setDetail(undefined)}>Close report detail</button>
        </section>}
    </section>;
}
function ReportSource({ data, row }: { data: D; row: D }) {
    const deposit = (data.deposit ?? []).find((deposit: D) => deposit.id === row.deposit);
    const request = data.request.find((r: D) => r.id === row.request), order = data.order.find((o: D) => o.id === row.order), invoice = data.invoice.find((i: D) => i.id === row.invoice);
    return <>{deposit && <p>Imported prepaid deposit {deposit.reference} · {money(deposit.amountMinor, row.currency)} · {deposit.evidence}. Source payment evidence is unverified.</p>}<p>Request revision {request?.revision} · {request?.status}</p>{order && <p>{order.number} · revision {order.revision} · {order.status}</p>}{invoice && <p>Invoice {invoice.reference} · {invoice.source} · {money(invoice.totalMinor, invoice.currency)}</p>}
        {(invoice ? invoice.allocations.map((a: D) => ({ ...a, description: order.lines.find((l: D) => l.id === a.line)?.description })) : order?.lines || request?.lines || []).map((l: D, i: number) => <p key={i}>{l.description} · {l.quantity} · {money(l.amountMinor ?? l.totalMinor, row.currency)}</p>)}
        {data.attachment.filter((f: D) => [row.request, row.order, row.invoice].includes(f.record)).map((f: D) => <p key={f.id}><a href={`/api/purse/download/attachment/${f.id}`}>{f.name}</a></p>)}</>;
}

function PeriodBudgets({data}:{data:D}) {
 const [selectedId,setSelected]=useState<string>();const selected=(data.periodBudgets??[]).find((budget:D)=>budget.id===selectedId);
 return <section aria-label="Dated financial budget positions"><h2>Dated financial budgets</h2><p>Budget periods follow each purchase’s need date. Received but unbilled value remains committed. Actual is recorded invoice and imported-deposit evidence, including exceptions; it is not a claim of matching, ledger sync or payment.</p><Table heads={['Budget / period','Amount','Reserved','Committed','Recorded actual','Available']}>
 {(data.periodBudgets??[]).map((budget:D)=><tr key={budget.id}><td><button onClick={()=>setSelected(budget.id)}>{budget.name}</button><p>{budget.from} through {budget.through} · <BudgetScope budget={budget} data={data}/></p></td>{['amount','reserved','committed','actual','available'].map(field=><td key={field}>{money(budget[field+'Minor'],budget.currency)}</td>)}</tr>)}
 </Table>{selected&&<section aria-label="Financial budget source records"><h3>{selected.name} · sources</h3><Table heads={['Request / PO','Reserved','Committed','Recorded actual']}>
 {selected.sources.map((source:D)=><tr key={source.request??'hidden'}><td>{source.hidden?<span>{source.title}</span>:<a href={'/app?tab=Requests&request='+source.request}>{source.title}</a>}{source.order&&<p><a href={'/api/purse/download/order/'+source.order}>{source.number}</a></p>}{source.invoiceIds.map((id:string)=>{const invoice=data.invoice.find((invoice:D)=>invoice.id===id);return invoice?<p key={id}>Invoice {invoice.reference} · {money(invoice.totalMinor,selected.currency)}</p>:null;})}</td>{['reserved','committed','actual'].map(field=><td key={field}>{money(source[field+'Minor'],selected.currency)}</td>)}</tr>)}
 </Table><button onClick={()=>setSelected(undefined)}>Close financial budget sources</button></section>}</section>;
}
