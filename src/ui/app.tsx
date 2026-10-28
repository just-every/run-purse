import { AccrualReport } from './accrual-report';
import { CommentNotices } from './comments';
import { BudgetAlerts } from './budget-import';
import { useSeparators } from './separated';
import { AgentValue } from './agent-value';
import { Agreements } from './agreements';
import { SearchWorkspace } from './search';
import { PerformanceReport } from './performance-report';
import { SpendReport } from './spend-report';
import { AuditLog } from './audit-log';
import { Authority } from './authority';
import { useEffect, useState } from 'react';
import { call, Form, Field, type D } from './shared';
import { Overview, EmptyWorkspace } from './overview';
import { Settings } from './settings';
import { Suppliers } from './suppliers';
import { Catalogue } from './catalogue';
import { Requests, focusComposer } from './requests';
import { Orders } from './orders';
import { Stockroom } from './stockroom';
import { Preparation } from './preparation';
import { Imports } from './imports';
import { TopBar, workspaceTabs } from './top-bar';
export function App() { useSeparators(); return new URLSearchParams(window.location.search).has('search') ? <SearchWorkspace/> : <PurchasingApp/>; }
function firstTab() { const query = new URLSearchParams(window.location.search); return query.has('valueRequest') ? 'Value' : query.has('agreement') ? 'Agreements' : query.has('receipt') ? 'Orders' : query.has('intake') ? 'Requests' : query.get('tab') || 'Requests'; }
function PurchasingApp() {
    const [state, setState] = useState<D>(), [error, setError] = useState(''), [tab, setTab] = useState(firstTab), [notice, setNotice] = useState(''), [performance, setPerformance] = useState(false), [accrual,setAccrual] = useState(false);
    async function reload() { setState(await call('state')); }
    useEffect(() => { reload().catch(e => setError(e.message)); }, []);
    async function mutate(op: string, b: D) { const result = await call('command/' + op, b); if (op !== 'request-again-preview') setNotice('Saved.'); await reload(); return result; }
    if (!state)
        return <div className="app"><TopBar/><main className="workspace">{error ? <p role="alert">{error} · <a href="/signin">Sign in</a></p> : <p className="lead">Opening purchasing workspace…</p>}</main></div>;
    const { data, actor } = state;
    const tabs = workspaceTabs(actor), current = tabs.includes(tab) ? tab : tabs[0], business = data.business[0];
    const open = (t: string) => { setTab(t); setNotice(''); };
    return <div className="app">
        <TopBar actor={actor} business={business?.name} tab={current} onTab={open} onAsk={business ? () => { open('Requests'); focusComposer(); } : undefined}/>
        <main className="workspace" data-tab={current}>
            <p className="notice" aria-live="polite">{notice}</p><BudgetAlerts alerts={data.budgetAlerts}/>
            {business && <CommentNotices refresh={data} dashboard={current === 'Overview'}/>}
            {current === 'Requests' && (business ? <Requests data={data} actor={actor} mutate={mutate}/> : <EmptyWorkspace owner={actor.roles.includes('owner')} onSetUp={() => open('Settings')}/>)}
            {current === 'Value' && <AgentValue data={data} actor={actor} mutate={mutate}/> }
            {current === 'Overview' && <Overview data={data} onSetUp={() => open('Settings')}/>}
            {current === 'Reports' && <>{actor.permissions.includes('report.read') && <button className="report-switch" onClick={()=>setAccrual(!accrual)}>{accrual?'Spend report':'Received not billed'}</button>}{accrual ? <AccrualReport/> : <>{actor.permissions.includes('performance.read') && <button className="report-switch" onClick={() => setPerformance(!performance)}>{performance ? 'Spend and commitments' : 'Procurement performance'}</button>}{(performance || !actor.permissions.includes('report.read')) && actor.permissions.includes('performance.read') ? <PerformanceReport data={data}/> : <SpendReport data={data}/>}</>}</>}
            {current === 'Orders' && <Orders data={data} actor={actor} mutate={mutate} reload={reload}/>}
            {current === 'Suppliers' && <Suppliers data={data} actor={actor} mutate={mutate} reload={reload}/>}
            {current === 'Agreements' && <Agreements data={data} actor={actor} mutate={mutate}/>}
            {current === 'Catalogue' && <><Catalogue data={data} mutate={mutate}/><Stockroom data={data} mutate={mutate}/></>}
            {current === 'Settings' && <><Settings data={data} actor={actor} mutate={mutate} reload={reload}/>{actor.roles.includes('owner') && <section className="panel"><h3>Invite saved member</h3><Form label="Send invitation" onSubmit={async b => { await call('invite', b); setNotice('Invitation sent.'); }}><Field label="Member email" name="email" type="email"/></Form><p className="quiet">Invite an active saved member to sign in.{actor.dev && <> Dev personas also require saved purchasing roles.</>}</p></section>}</>}
            {current === 'Authority' && <Authority data={data} actor={actor} mutate={mutate}/>}
            {current === 'Preparation' && <Preparation data={data} actor={actor} mutate={mutate}/>}
            {current === 'Imports' && <Imports reload={reload} jobs={data.importJobs ?? []}/>}
            {current === 'Audit' && <AuditLog actor={actor}/>}
        </main>
    </div>;
}
