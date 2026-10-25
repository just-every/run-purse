import { useState } from 'react';
import { call, Field, Form, Table, money, type D } from './shared';
import { ReportSource } from './spend-report';

export function SpendQuestions({data}:{data:D}) {
    const [answer,setAnswer]=useState<D>(),[detail,setDetail]=useState<D>();
    return <details className="disclosure"><summary>Ask a spend question</summary><section className="disclosure-body" aria-label="Spend questions">
        <p>Ask about recorded spend in your current scope. For example: Show committed spend by department this quarter.</p>
        <Form label="Ask question" onSubmit={async body=>{setAnswer(await call('command/'+'spend-question',body));setDetail(undefined);}}><Field label="Spend question" name="question" type="textarea"/></Form>
        {answer && <section aria-label="Spend answer"><p>{answer.mode} · model: {answer.model} · provider: {answer.provider}</p>
            {answer.status==='declined'?<p role="status">Cannot answer: {answer.reason}</p>:<>
                <p>Period: {answer.period.from ?? 'All recorded dates'}{answer.period.through && <> through {answer.period.through}</>}. {answer.period.basis}.</p>
                <p>Filters: {Object.entries(answer.filters).map(([key,value])=>`${key}: ${value}`).join(' · ')}. Current access scope applies.</p>
                <p>Actual means recorded invoice evidence; it does not establish payment.</p>
                <Table heads={['Currency','Figure']} >{answer.figures.map((figure:D)=><tr key={figure.currency}><td>{figure.currency}</td><td><button aria-label={`Inspect ${figure.currency} ${figure.metric}`} onClick={()=>setDetail({label:figure.currency+' · '+figure.metric,rows:answer.report.rows.filter((row:D)=>row.currency===figure.currency&&row.kind===figure.metric)})}>{money(figure.amountMinor,figure.currency)} · {figure.metric}</button></td></tr>)}</Table>
                {!answer.figures.length && <p>No visible records match these filters.</p>}
                <h3>By {answer.report.groupBy}</h3><Table heads={['Group','Currency','Figure']}>{answer.report.groups.map((group:D)=><tr key={JSON.stringify([group.value,group.currency])}><td>{group.label}</td><td>{group.currency}</td><td><button onClick={()=>setDetail({label:String(group.label)+' · '+answer.metric,rows:group.rows.filter((row:D)=>row.kind===answer.metric)})}>{money(group[answer.metric+'Minor'],group.currency)}</button></td></tr>)}</Table>
                {answer.againstBudget && <><p>Undated policy budgets cover all visible outstanding authority, including outside the question period. Dated budget positions are available in the recomputed report.</p><Table heads={['Policy','Budget','Available in visible scope']} >{answer.report.budgets.map((budget:D)=><tr key={budget.id}><td>{budget.name}</td><td><button onClick={()=>setDetail({label:budget.name+' · budget',rows:budget.scopeRows})}>{money(budget.budgetMinor,budget.currency)}</button></td><td><button onClick={()=>setDetail({label:budget.name+' · available',rows:budget.scopeRows})}>{money(budget.availableMinor,budget.currency)}</button></td></tr>)}</Table></>}
                <a href={answer.reportUrl}>Recompute report figures</a>
                {detail && <section aria-label="Question source records"><h3>{detail.label}</h3><Table heads={['Source','Coding','Amount']}>
                    {detail.rows.map((row:D,index:number)=><tr key={index}><td><a href={'/app?tab=Requests&request='+encodeURIComponent(row.request)}>{row.title}</a>{row.order&&<p><a href={'/api/purse/download/order/'+row.order}>{row.number}</a></p>}{row.invoice&&<p>Invoice {row.reference}</p>}<details><summary>Source record</summary><ReportSource data={data} row={row}/></details></td><td>{row.department} · {row.project} · {row.category}{row.glAccount&&<> · {row.glAccount}</>}</td><td>{money(row.amountMinor,row.currency)}</td></tr>)}
                </Table><button onClick={()=>setDetail(undefined)}>Close question sources</button></section>}
            </>}
            <details><summary>Execution record</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(answer,null,2)}</pre></details>
        </section>}
    </section></details>;
}
