import { Authority } from './authority';
import { useEffect, useState } from 'react';
import { call, Form, Field, Table, when, type D } from './shared';
import { Overview } from './overview';
import { Settings } from './settings';
import { Suppliers, Catalogue } from './suppliers';
import { Requests } from './requests';
import { Orders } from './orders';
import { Stockroom } from './stockroom';
import { Preparation } from './preparation';
import { Imports } from './imports';
/** Mark, name and tagline at left; who is signed in at right. */
function Masthead({ actor }: { actor?: D }) { return <header className="app-header"><a className="app-brand" href="/app"><img className="app-mark" src="/brand/mark.svg" alt=""/><span className="app-name" data-rer-name>Purse</span> <span className="app-tagline">Purchasing, with a clear record</span></a>{actor && <span className="app-who">{actor.email}<span className="app-roles"> · {actor.roles.join(', ')}</span></span>}</header>; }
export function App() {
    const [state, setState] = useState<D>(), [error, setError] = useState(''), [tab, setTab] = useState('Overview'), [notice, setNotice] = useState('');
    async function reload() { setState(await call('state')); }
    useEffect(() => { reload().catch(e => setError(e.message)); }, []);
    async function mutate(op: string, b: D) { const result = await call('command/' + op, b); setNotice('Saved.'); await reload(); return result; }
    if (!state)
        return <div className="app"><Masthead/><main className="workspace"><h1 className="page-title">Purse</h1>{error ? <p role="alert">{error} · <a href="/signin">Sign in</a></p> : <p className="lead">Opening purchasing workspace…</p>}</main></div>;
    const { data, actor } = state;
    const tabs = ['Overview', 'Requests', 'Orders', ...(actor.roles.includes('buyer') ? ['Suppliers', 'Catalogue'] : []), 'Preparation', ...(actor.roles.includes('approver') ? ['Authority'] : []), ...(actor.roles.includes('owner') ? ['Settings', 'Imports', 'Audit'] : [])];
    return <div className="app">
        <Masthead actor={actor}/>
        <nav className="app-tabs" aria-label="Workspace">{tabs.map(t => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => { setTab(t); setNotice(''); }}>{t}</button>)}</nav>
        <main className="workspace">
            <p className="notice" aria-live="polite">{notice}</p>
            {tab === 'Overview' && <Overview data={data} onSetUp={() => setTab('Settings')}/>}
            {tab === 'Requests' && <Requests data={data} actor={actor} mutate={mutate}/>}
            {tab === 'Orders' && <Orders data={data} actor={actor} mutate={mutate}/>}
            {tab === 'Suppliers' && <Suppliers data={data} actor={actor} mutate={mutate}/>}
            {tab === 'Catalogue' && <><Catalogue data={data} mutate={mutate}/><Stockroom data={data} mutate={mutate}/></>}
            {tab === 'Settings' && <><Settings data={data} mutate={mutate}/><section className="panel"><h3>Invite saved member</h3><Form label="Send invitation" onSubmit={async b => { await call('invite', b); setNotice('Invitation sent.'); }}><Field label="Member email" name="email" type="email"/></Form><p className="quiet">Invite an active saved member to sign in.{actor.dev && <> Dev personas also require saved purchasing roles.</>}</p></section></>}
            {tab === 'Authority' && <Authority data={data} actor={actor} mutate={mutate}/>}
            {tab === 'Preparation' && <Preparation data={data} mutate={mutate}/>}
            {tab === 'Imports' && <Imports reload={reload} jobs={data.importJobs ?? []}/>}
            {tab === 'Audit' && <><h2 className="page-title">Audit history</h2><Table heads={['When', 'Actor', 'Action', 'Record', 'Reason']}>{data.audit.map((e: D) => <tr key={e.id}><td className="figure-cell">{when(e.at)}</td><td className="email-cell">{e.email}</td><td>{e.action}</td><td>{e.record}</td><td>{e.reason ?? ''}</td></tr>)}</Table></>}
        </main>
        <footer className="app-footer">Purse · Native purchasing records.</footer>
    </div>;
}
