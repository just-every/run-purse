import { useEffect, useState } from 'react';
import { call, Field, Form, money, type D } from './shared';
import { TopBar } from './top-bar';

export function ApprovalEmail() {
    const query = new URLSearchParams(window.location.search);
    const path = 'approval-email/' + encodeURIComponent(query.get('approvalEmail') ?? '') + '/' + encodeURIComponent(query.get('source') ?? '');
    const [record,setRecord] = useState<D>(), [error,setError] = useState(''), [result,setResult] = useState('');
    useEffect(() => { call(path).then(setRecord).catch(e => setError(e.message)); }, [path]);
    return <div className="app"><TopBar/><main className="workspace">
        <section className="panel" aria-label="Email approval">
            <h1>Review approval</h1>
            {error ? <><p role="alert">{error}</p><p><a href={'/signin?returnTo=' + encodeURIComponent(window.location.pathname + window.location.search)}>Sign in as the intended recipient</a></p><a href="/app">Open purchasing workspace</a></>
                : !record ? <p>Opening your approval…</p>
                : result ? <><p role="status">Decision recorded: {result}.</p><a href={record.url}>Open request</a></>
                : <><h2>{record.title}</h2><p>Revision {record.revision} · {money(record.totalMinor,record.currency)}</p>
                    <p>Opening this link changes nothing. Review the request before confirming your decision.</p>
                    <p><a href={record.url}>Open request details</a></p>
                    <Form label="Confirm decision" onSubmit={async b => {
                        const saved = await call(path,{decision:b.decision,reason:b.reason,confirm:b.confirm === 'on'});
                        setResult(saved.status);
                    }}>
                        <Field label="Decision" name="decision" options={[{value:'approved',label:'Approve'},{value:'rejected',label:'Reject'},{value:'returned',label:'Return to requester'}]}/>
                        <Field label="Decision reason" name="reason" type="textarea"/>
                        <label className="field"><span><input type="checkbox" name="confirm" required/> I confirm this decision for the revision shown.</span></label>
                    </Form>
                </>}
        </section>
    </main></div>;
}
