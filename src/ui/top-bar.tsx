import type { D } from './shared';
/** The workspace screens a person can open, in top-bar order; the Requests thread is home. */
export function workspaceTabs(roles: string[]) { return ['Requests', 'Overview', 'Orders', 'Search', 'Reports', ...(roles.includes('buyer') ? ['Suppliers', 'Catalogue'] : []), 'Preparation', ...(roles.includes('approver') ? ['Authority'] : []), ...(roles.includes('owner') ? ['Settings', 'Imports', 'Audit'] : [])]; }
/** One white top bar: the mark and slab wordmark, the business, search, and Ask Purse; under a hairline,
 * the workspace tabs and who is signed in. Ask Purse and the thread's composer are one control. */
export function TopBar({ actor, business, tab, onTab, onAsk, search = true }: { actor?: D; business?: string; tab?: string; onTab?: (tab: string) => void; onAsk?: () => void; search?: boolean }) {
    const tabs = actor ? workspaceTabs(actor.roles) : [];
    const go = (t: string) => { if (t === 'Search') window.location.assign('/app?search=1'); else if (onTab) onTab(t); else window.location.assign('/app?tab=' + encodeURIComponent(t)); };
    return <header className="top-bar">
        <div className="top-row">
            <a className="top-brand" href="/app"><img className="top-mark" src="/brand/mark.svg" alt="" width="40" height="39"/><span className="top-name" data-rer-name>Purse</span></a>
            {business && <span className="top-business">{business}</span>}
            {search && actor && <form className="top-search" role="search" onSubmit={e => { e.preventDefault(); const q = String(new FormData(e.currentTarget).get('q') ?? '').trim(); window.location.assign('/app?search=1' + (q ? '&q=' + encodeURIComponent(q) : '')); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
                <input name="q" type="search" aria-label="Search purchasing records" placeholder="Search requests, orders, suppliers…"/>
            </form>}
            {onAsk && actor?.roles.includes('requester') && <button type="button" className="top-ask" onClick={onAsk}><img src="/brand/mark-32.svg" alt="" width="26" height="26"/>Ask Purse</button>}
        </div>
        {actor && <div className="top-row top-row-nav">
            <nav className="app-tabs" aria-label="Workspace">{tabs.map(t => <button key={t} type="button" aria-current={tab === t ? 'page' : undefined} onClick={() => go(t)}>{t}</button>)}</nav>
            <span className="top-who" title={actor.roles.join(', ')}>{actor.email}</span>
        </div>}
    </header>;
}
