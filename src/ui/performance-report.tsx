import { RfqOfferEvidence } from './rfq-evidence';
import { useEffect, useState } from 'react';
import { call, Table, money, type D } from './shared';
const durations = [['requestToPo', 'Request to PO'], ['approvalCycle', 'Approval cycle']];
const rates = [['onTimeDelivery', 'On-time delivery'], ['invoiceExceptionRate', 'Invoice exception rate']];
const spends = [['poCoverage', 'PO coverage'], ['offContract', 'Off-contract evidence'], ['unapprovedSpend', 'Unapproved purchase evidence']];
export function PerformanceReport({ data }: { data: D }) {
    const [report, setReport] = useState<D>(), [error, setError] = useState(''), [detail, setDetail] = useState<D>();
    useEffect(() => { call('performance-report').then(setReport).catch(e => setError(e.message)); }, []);
    return <section><h1 className="page-title">Procurement performance</h1><p className="quiet">Recorded native purchasing evidence. Unknown dates do not become zero-duration successes. Every measure opens its source records; currencies stay separate.</p>
        {error && <p role="alert">{error}</p>}{report && <>
            {report.limitations.map((s: string) => <p className="quiet" key={s}>{s}</p>)}
            <Table heads={['Measure', 'Result', 'Basis']}>
                {durations.map(([key, label]) => <tr key={key}><td><button onClick={() => setDetail({ label, rows: report[key].rows })}>{label}</button></td><td>{report[key].averageMs === null ? 'Unknown' : (report[key].averageMs / 3600000).toFixed(2) + ' hours'} · {report[key].denominator} measured · {report[key].unknown} unknown</td><td>{report[key].basis}</td></tr>)}
                {rates.map(([key, label]) => <tr key={key}><td><button onClick={() => setDetail({ label, rows: report[key].rows })}>{label}</button></td><td>{report[key].rate === null ? 'Unknown' : (report[key].rate * 100).toFixed(1) + '%'} · {report[key].numerator}/{report[key].denominator}</td><td>{report[key].basis}</td></tr>)}
                {spends.flatMap(([key, label]) => report[key].totals.map((r: D) => <tr key={key+r.currency}><td><button onClick={() => setDetail({ label: label+' '+r.currency, rows: r.rows })}>{label} {r.currency}</button></td><td>{money(r.numeratorMinor, r.currency)} / {money(r.denominatorMinor, r.currency)} · {r.rate === null ? 'Unknown' : (r.rate*100).toFixed(1)+'%'}</td><td>{report[key].basis}</td></tr>))}
            </Table>
            <h2>Savings</h2><p className="quiet">Negotiated: first-offer less awarded line values on approved request revisions. Realized: first-offer less billed line value for net received quantities, only on buyer cash-planning-approved invoice evidence. Cash-planning approval is not payment approval. Freight and tax are excluded. Unawarded discounts do not count.</p>
            <Table heads={['Currency', 'Negotiated', 'Realized · cash-planning approval']}>
                {report.savings.totals.map((r: D) => <tr key={r.currency}><td>{r.currency}</td><td><button aria-label={'Negotiated savings '+r.currency} onClick={() => setDetail({ label: 'Negotiated savings '+r.currency, rows: report.savings.rows.filter((x: D) => x.currency === r.currency), savings: true })}>{money(r.negotiatedMinor,r.currency)}</button></td><td><button aria-label={'Realized savings '+r.currency} onClick={() => setDetail({ label: 'Realized savings '+r.currency, rows: report.savings.realizedRows.filter((x: D) => x.currency === r.currency), savings: true })}>{money(r.realizedMinor,r.currency)}</button></td></tr>)}
            </Table>{!report.savings.totals.length && <p>No approved quote awards recorded.</p>}
        </>}
        {detail && <section className="record" key={detail.label} aria-label="Performance source records"><h2>{detail.label}</h2><Table heads={['Record', 'Evidence', 'Measure']}>
            {detail.rows.map((r: D, i: number) => <tr key={i}><td>{r.title || r.description || r.reference}<p>{r.requestId || r.request}</p>{(r.orderId || r.order) && <a href={'/api/purse/download/order/'+(r.orderId || r.order)}>{r.orderNumber || r.number}</a>}{(r.invoiceId || r.invoice) && <p>Invoice {r.reference}</p>}
                <details><summary>Source evidence</summary><PerformanceSource data={data} row={r}/></details></td>
                <td>{r.reason || r.source || r.promiseEvidence?.source || 'Recorded purchasing events'}{r.firstQuote && <p>First quote {r.firstQuote}<br/>Awarded quote {r.awardedQuote}<br/>Award {r.award}</p>}</td>
                <td>{detail.savings ? <>{money(r.savingsMinor,r.currency)} · first offer {money(r.firstMinor,r.currency)} · {r.billedMinor === undefined ? 'awarded '+money(r.awardedMinor,r.currency) : 'billed '+money(r.billedMinor,r.currency)}</> : <>{r.elapsedMs !== undefined ? r.elapsedMs === null ? 'Unknown elapsed time' : r.elapsedMs+' ms' : r.amountMinor !== undefined ? money(r.amountMinor,r.currency) : r.onTime === null ? 'Promise unknown' : r.onTime ? 'On time' : 'Late'}{r.exception !== undefined && <p>{r.exception ? 'Exception present' : 'No current exception'}</p>}</>}</td></tr>)}
        </Table>{!detail.rows.length && <p>No source records.</p>}<button onClick={() => setDetail(undefined)}>Close performance detail</button></section>}
    </section>;
}
function PerformanceSource({ data, row }: { data: D; row: D }) {
    const id = row.request || row.requestId, request = data.request.find((r: D) => r.id === id), order = data.order.find((o: D) => o.id === (row.order || row.orderId)), invoice = data.invoice.find((i: D) => i.id === (row.invoice || row.invoiceId));
    const quotes = data.quote.filter((q: D) => [row.firstQuote,row.awardedQuote].includes(q.id));
    const award = data.quoteAward.find((a: D) => a.id === row.award);
    return <>{request && <p>{request.title} · revision {row.revision || order?.revision || request.revision}</p>}{row.createdAt && <p>Created {row.createdAt} · issued {row.issuedAt || 'not recorded'}</p>}{row.submittedAt && <p>Submitted {row.submittedAt} · approved {row.approvedAt || 'not recorded'}</p>}{row.promisedDate && <p>Promise {row.promisedDate} · receipt {row.at} · {row.reason}</p>}{quotes.map((q: D) => <section key={q.id}><p>{q.id === row.firstQuote ? 'First offered' : 'Awarded'} · {q.source}</p>{q.lines.map((l: D) => <p key={l.id}>{l.description} · {l.quantity} · {money(l.totalMinor,q.currency)}</p>)}<RfqOfferEvidence data={data} quote={q}/></section>)}{award && <p>Buyer award · {award.reason} · {award.at}</p>}{invoice && <p>Invoice {invoice.reference} · {invoice.source} · {money(invoice.totalMinor,invoice.currency)}</p>}{data.attachment.filter((f: D) => [id,order?.id,invoice?.id].filter(Boolean).includes(f.record)).map((f: D) => <p key={f.id}><a href={'/api/purse/download/attachment/'+f.id}>{f.name}</a></p>)}</>;
}
