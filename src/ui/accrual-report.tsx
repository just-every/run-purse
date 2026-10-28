import { useState } from 'react';
import { call, Field, Form, Table, money, when, type D } from './shared';

export function AccrualReport() {
    const [report,setReport] = useState<D>(), [filters,setFilters] = useState<D>({}), [detail,setDetail] = useState<D>();
    const query = new URLSearchParams(filters).toString();
    return <section aria-label="Received not billed report"><h2>Received not billed</h2>
        <p>Choose a period end. Eligible genuine bill approvals reduce received value by invoice date. Cash-planning approval does not reduce it. Imported deposits stay separate.</p>
        <Form label="Run accrual report" onSubmit={async input => { const selected = Object.fromEntries(Object.entries(input).filter(([,value])=>value)); setFilters(selected); setReport(await call('accrual-report/view?'+new URLSearchParams(selected).toString())); setDetail(undefined); }}>
            <Field label="Period end" name="cutoff" type="date" defaultValue={filters.cutoff}/>
            {['entity','department','location','supplier','glAccount'].map(key=><Field key={key} name={key} label={({entity:'Entity',department:'Department',location:'Location',supplier:'Supplier',glAccount:'GL account'})[key]!} required={false} options={(report?.choices[key] ?? []).map((value:string)=>({value,label:value}))}/>)}
        </Form>
        {report && <><p role="status">As of {report.cutoff} · {report.timezone}</p><p>{report.limitations}</p>
            {report.warnings.length>0 && <section aria-label="Completeness warnings"><h3>Completeness warnings</h3><ul>{report.warnings.map((warning:string)=><li key={warning}>{warning}</li>)}</ul></section>}
            <p><a href={'/api/purse/accrual-report/csv?'+query}>Download accrual CSV</a> · <a href={'/api/purse/accrual-report/xlsx?'+query}>Download accrual XLSX</a></p>
            <details className="disclosure"><summary>Xero journal file</summary><p>Download for review in a single Xero currency. Nothing posts or reverses automatically. Live Xero import qualification is pending.</p>
                <form method="get" action="/api/purse/accrual-report/xero">{Object.entries(filters).map(([key,value])=><input key={key} type="hidden" name={key} value={String(value)}/>)}<Field label="Journal currency" name="currency" options={report.totals.map((row:D)=>({value:row.currency,label:row.currency}))}/><Field label="Accrued liabilities account" name="liabilityAccount"/><button>Download Xero journal</button></form>
            </details>
            <h3>Accrual totals</h3><Table heads={['Currency','Accrual']}>
                {report.totals.map((total:D)=><tr key={total.currency}><td>{total.currency}</td><td><button onClick={()=>setDetail({label:total.currency,rows:report.rows.filter((row:D)=>row.currency===total.currency)})}>{money(total.accrualMinor,total.currency)}</button></td></tr>)}
            </Table><h3>By GL and coding</h3><Table heads={['Coding','Currency','Accrual']}>
                {report.groups.map((group:D,index:number)=><tr key={index}><td>{[group.glAccount||'No GL',group.department,group.location,group.class,group.project,group.entity].filter(Boolean).join(' · ')}</td><td>{group.currency}</td><td><button onClick={()=>setDetail({label:'GL '+(group.glAccount||'unassigned'),rows:group.rows})}>{money(group.accrualMinor,group.currency)}</button></td></tr>)}
            </Table>{!report.rows.length&&<p>No supported received value matches this period and scope.</p>}
            <h3>Imported deposits, separate from accrual</h3>{report.deposits.length ? <Table heads={['PO','Deposit','Unapplied','Basis']}>{report.deposits.map((deposit:D)=><tr key={deposit.deposit}><td>{deposit.number}</td><td>{deposit.reference}</td><td>{money(deposit.unappliedMinor,deposit.currency)}</td><td>{deposit.basis}</td></tr>)}</Table>:<p>No supported imported deposits in this scope.</p>}
            {detail&&<section aria-label="Accrual source records"><h3>{detail.label} · source records</h3>{detail.rows.map((row:D,index:number)=><article className="record" key={index}>
                <h4><a href={'/app?tab=Orders&receipt='+row.order}>{row.number}</a> · {row.description}</h4><p>{row.supplierName} · {row.department} · {row.glAccount||'No GL'} · {money(row.accrualMinor,row.currency)} accrual</p>
                <p>Received {row.receivedQ/1000} · {money(row.receivedMinor,row.currency)}; approved billed {row.billedQ/1000} · {money(row.billedMinor,row.currency)} · {row.mode}</p>
                {row.receipts.map((receipt:D)=><p key={receipt.receipt}>Receipt {receipt.receipt} · {receipt.event} · effective {receipt.effectiveDate} · recorded {when(receipt.recordedAt)} · {money(receipt.valueMinor,row.currency)}{receipt.lateEntered&&<strong> · Late-entered</strong>}</p>)}
                {row.bills.map((bill:D)=><p key={bill.invoice}><a href={'/app?tab=Orders&receipt='+bill.order+'#invoice-'+bill.invoice}>Bill {bill.reference}</a> · {bill.invoiceDate} · eligible approval · {money(bill.amountMinor,row.currency)}</p>)}
                {row.excludedBills.map((bill:D)=><p key={bill.invoice}>Bill {bill.reference} · {bill.invoiceDate||'Date unavailable'} · excluded: {bill.reason}</p>)}
            </article>)}<button onClick={()=>setDetail(undefined)}>Close accrual sources</button></section>}
        </>}
    </section>;
}
