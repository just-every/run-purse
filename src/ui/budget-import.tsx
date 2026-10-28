import { useState } from 'react';
import { call, Field, Form, Table, money, type D } from './shared';

const labels: D = {budget:'Budget reference',amount:'Amount',currency:'Currency',department:'Department',location:'Location',project:'Project',glAccount:'GL account',owner:'Owner',thresholds:'Alert percentages'};
export function BudgetImport({data,mutate}:{data:D;mutate:(op:string,b:D)=>Promise<any>}) {
    const [source,setSource] = useState<D>(), [columns,setColumns] = useState<D>({}), [review,setReview] = useState<D>(), [result,setResult] = useState<D>();
    const policies = data.policy.filter((policy:D) => policy.active && policy.budgetPeriod);
    const values = (field:string):string[] => [...new Set<string>((source?.rows ?? []).map((row:D) => String(row[columns[field]] ?? '').trim()))];
    function input(b:D) {
        const dimensions = Object.fromEntries(['department','location','project','glAccount'].map(field => [field,Object.fromEntries(values(field).map((value,index) => [value,b[field+'-'+index]]))]));
        return {csv:source!.csv,mapping:{columns,budgets:Object.fromEntries(values('budget').map((value,index) => [value,b['budget-'+index]])),owners:Object.fromEntries(values('owner').map((value,index) => [value,b['owner-'+index]])),dimensions}};
    }
    const options = (rows:D[],value='id',label='name') => rows.map(row => ({value:row[value],label:row[label] || row[value]}));
    return <section className="panel" aria-label="Budget import"><h2>Budget import and owners</h2><p>Import UTF-8 CSV amounts into existing dated budgets. Map every source column and coding before review. Approval limits, chains and over-budget authority stay as configured.</p>
        <Form label="Read budget file" onSubmit={async b => {
            const file=b.file as File;
            if(file.size>1000000)throw Error('Choose a CSV of at most 1 MB');
            const csv=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
            const parsed=await call('budget-import/columns',{csv});
            setSource({...parsed,csv});setColumns(Object.fromEntries(Object.keys(labels).map(field => [field,parsed.columns.includes(field)?field:''])));setReview(undefined);setResult(undefined);
        }}><label className="field">Budget CSV file<input name="file" type="file" accept=".csv,text/csv" required onChange={() => {setSource(undefined);setColumns({});setReview(undefined);setResult(undefined);}}/></label></Form>
        {source && <div onChange={() => {setReview(undefined);setResult(undefined);}}><Form label="Preview budget import" onSubmit={async b => {const payload=input(b);setReview({input:payload,...await call('budget-import/preview',payload)});}}>
            {Object.entries(labels).map(([field,label]) => <label className="field" key={field}>{String(label)} column<select aria-label={String(label)+' column'} required value={columns[field] ?? ''} onChange={event => setColumns({...columns,[field]:event.target.value})}><option value="">Choose…</option>{source.columns.map((name:string) => <option key={name} value={name}>{name}</option>)}</select></label>)}
            {values('budget').map((value,index) => <Field key={'budget-'+value} label={'Target budget for '+value} name={'budget-'+index} options={options(policies)}/>)}
            {['department','location','project','glAccount'].map(field => {
                const property=({department:'costCentre',location:'location',project:'project',glAccount:'glAccount'} as D)[field];
                const choices=[...new Set<string>(policies.map((policy:D) => policy[property] || '*'))];
                return values(field).map((value,index) => <Field key={field+'-'+value} label={labels[field]+' mapping for '+value} name={field+'-'+index} options={choices.map(code => ({value:code,label:code==='*'?'All configured values':code}))}/>);
            })}
            {values('owner').map((value,index) => <Field key={'owner-'+value} label={'Budget owner for '+value} name={'owner-'+index} options={options(data.member.filter((member:D) => member.active),'email','name')}/>)}
            <p>Alert percentages are whole numbers separated by semicolons. Leave a source cell empty to disable alerts. The assigned member needs current report access to the budget; assignment adds no purchase approval authority.</p>
        </Form></div>}
        {review && <section aria-label="Reviewed budget changes"><h3>Review before writing</h3><p>{review.changes} changed budget{review.changes===1?'':'s'}. No budget has been written.</p><Table heads={['Budget','Coding','Current','Imported','Owner','Alerts']} figures={['Current','Imported']}>{review.rows.map((row:D) => <tr key={row.policy}><td>{row.name}<br/>{row.period.from} through {row.period.through}</td><td>{[row.costCentre,row.location,row.project,row.glAccount].join(' · ')}</td><td>{money(row.beforeMinor,row.currency)}</td><td>{money(row.amountMinor,row.currency)}</td><td>{data.member.find((member:D) => member.email===row.ownerEmail)?.name ?? 'Current member'}</td><td>{row.thresholds.length?row.thresholds.map((percent:number) => percent+'%').join(', '):'Off'}</td></tr>)}</Table>
            <Form key={review.fingerprint} label="Commit reviewed budgets" onSubmit={async b => {if(b.consent!=='on')throw Error('Confirm the reviewed changes');const outcome=await mutate('budget-import-commit',{...review.input,fingerprint:review.fingerprint,review:review.review,consent:true});setResult(outcome);setReview(undefined);}}><label className="field"><span><input type="checkbox" name="consent" required/> I reviewed these amounts, mappings, owners and alerts</span></label></Form>
        </section>}
        {result && <p role="status">Budget import complete: {result.changes} changed budget{result.changes===1?'':'s'}.</p>}
    </section>;
}
export function BudgetAlerts({alerts}:{alerts:D[]}) {
    if(!alerts?.length)return null;
    return <section className="panel" aria-label="Budget threshold alerts"><h2>Budget threshold alerts</h2><ul className="ruled-list">{alerts.map(alert => <li key={alert.id}><strong>{alert.name}</strong> reached {alert.percent}% · {money(alert.usedMinor,alert.currency)} reserved, committed or actual of {money(alert.amountMinor,alert.currency)}.</li>)}</ul></section>;
}
