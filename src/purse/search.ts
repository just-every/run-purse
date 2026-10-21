import { ensureSearchStorage } from './search-storage';
import { Hono } from 'hono';
import type { Bindings } from '../auth.server';
import { actor, readFence } from './store';
import { Fault, requireThat, roles, type Actor, type Data, type State } from './types';
import { likeText, normalizeSearchSql, searchExpression, searchFilters, type SearchFilters } from './search-index';
import { accessGrants, resolvedPermissions, type AccessGrant } from './access';
import { searchAccessGate } from './search-access';

type SearchContext = { actor: Actor; roles: string[]; permissions: string[]; grants: AccessGrant[]; revision: number; normalized: string; catalogueGrant: Data };
export const searchApi = new Hono<{ Bindings: Bindings }>();
searchApi.use('/api/purse/search*', async (c, next) => {
    c.header('cache-control', 'no-store'); c.header('x-content-type-options', 'nosniff'); await next();
});
searchApi.onError((error, c) => c.json({ error: error.message }, error instanceof Fault ? error.status as 400 : 400));

async function context(request: Request, env: Bindings, q = ''): Promise<SearchContext> {
    const a = await actor(request, env);
    // Load only this member, role definitions and the current catalogue grant.
    // Purchasing scope stays in SQL; no purchasing state is materialized here.
    const [meta, membership, catalogue, folded] = await env.DB.batch<Data>([
        env.DB.prepare('SELECT revision FROM p_meta WHERE id=1'),
        env.DB.prepare("SELECT kind,id,revision,value FROM p_records WHERE business='main' AND (kind='accessRole' OR (kind='member' AND id=?))").bind(a.email.toLowerCase()),
        env.DB.prepare("SELECT value FROM p_records WHERE business='main' AND kind='catalogueGrant' AND id=?").bind(a.email.toLowerCase()),
        env.DB.prepare(normalizeSearchSql).bind(q),
    ]);
    const state: State = new Map(membership.results.map(row => [String(row.kind) + ':' + String(row.id), { business: 'main', kind: String(row.kind), id: String(row.id), revision: String(row.revision), value: JSON.parse(String(row.value)) }]));
    const grants = accessGrants(state, a); requireThat(grants.length, 'No active business membership', 403);
    // Portability restores the exact projection while suppressing domain triggers.
    // FTS is derived storage, rebuilt before exposing the ready search workspace.
    await ensureSearchStorage(env.DB);
    return { actor: a, roles: roles(state, a), permissions: resolvedPermissions(state, a), grants, revision: Number(meta.results[0].revision), normalized: String(folded.results[0].normalized), catalogueGrant: catalogue.results[0] ? JSON.parse(String(catalogue.results[0].value)) : {} };
}

/** Filter first in SQL, including scope, before selecting any result or excerpt. */
function queryParts(filters: SearchFilters, current: SearchContext) {
    const params: unknown[] = [], clauses = ["s.business='main'"];
    const bind = (value: unknown) => { params.push(value); return '?'; };
    const access = searchAccessGate(current, bind);
    let catalogue = '1';
    if (!access.unrestrictedProcurement) {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
        catalogue = `s.approved=1 AND (s.validFrom='' OR s.validFrom<=${bind(today)}) AND (s.validUntil='' OR s.validUntil>=${bind(today)})`;
        for (const dimension of ['departments', 'locations', 'entities', 'roles']) {
            const allowed = dimension === 'roles' ? current.roles : current.catalogueGrant[dimension] ?? [];
            catalogue += ` AND (NOT EXISTS(SELECT 1 FROM json_each(s.access_${dimension})) OR EXISTS(SELECT 1 FROM json_each(s.access_${dimension}) restriction JOIN json_each(${bind(JSON.stringify(allowed))}) allowed ON allowed.value=restriction.value))`;
        }
    }
    clauses.push(`(s.kind='supplier' OR (${access.clause}) OR (s.kind='catalogue' AND (${catalogue})) OR (s.kind IN ('supplierDocument','agreement') AND ${access.unrestrictedProcurement ? '1' : '0'}))`);
    if (filters.kind) clauses.push(`s.kind=${bind(filters.kind)}`);
    if (filters.id) clauses.push(`s.id=${bind(filters.id)}`);
    if (filters.currency) clauses.push(`s.currency=${bind(filters.currency)}`);
    if (filters.amountMin !== undefined) clauses.push(`s.amountMinor>=${bind(filters.amountMin)}`);
    if (filters.amountMax !== undefined) clauses.push(`s.amountMinor<=${bind(filters.amountMax)}`);
    if (filters.dateFrom) clauses.push(`s.date>=${bind(filters.dateFrom)}`);
    if (filters.dateTo) clauses.push(`s.date<=${bind(filters.dateTo)}`);
    if (filters.status) clauses.push(`s.status=${bind(filters.status)}`);
    if (filters.requester) clauses.push(`(r.requesterId=${bind(filters.requester)} OR lower(r.requesterEmail)=lower(${bind(filters.requester)}))`);
    if (filters.coding) clauses.push(`s.coding LIKE ${bind(likeText(filters.coding))} ESCAPE '\\' COLLATE NOCASE`);

    if (filters.q) {
        const alternatives: string[] = [], expression=searchExpression(filters.q);
        if(expression)alternatives.push(`s.rowid IN (SELECT rowid FROM p_search_fts WHERE p_search_fts MATCH ${bind(expression)})`);
        alternatives.push(`s.number LIKE ${bind(likeText(filters.q))} ESCAPE '\\' COLLATE NOCASE`);
        if(current.normalized){const match=likeText(current.normalized);alternatives.push(`s.namesKey LIKE ${bind(match)} ESCAPE '\\'`);alternatives.push(`supplier.namesKey LIKE ${bind(match)} ESCAPE '\\'`);}
        clauses.push('('+alternatives.join(' OR ')+')');
    }
    const from = `FROM p_search s
        LEFT JOIN p_search o ON o.business=s.business AND o.kind='order' AND o.id=s.orderId
        LEFT JOIN p_search r ON r.business=s.business AND r.kind='request' AND r.id=CASE WHEN s.kind='request' THEN s.id ELSE coalesce(nullif(s.requestId,''),o.requestId) END
        ${access.join}
        LEFT JOIN p_search supplier ON supplier.business=s.business AND supplier.kind='supplier' AND supplier.id=coalesce(nullif(s.supplierId,''),nullif(o.supplierId,''),r.supplierId)
        WHERE ${clauses.join(' AND ')}`;
    return { prefix: '', from, params: [...(access.scopeParameter === undefined ? [] : [access.scopeParameter]), ...params] };
}

function result(row: Data, query: string) {
    const kind = String(row.kind), id = String(row.id);
    const recordKind = ['invoice', 'receipt', 'invoiceReading'].includes(kind) ? 'order' : kind === 'quoteReading' ? 'request' : kind === 'supplierDocument' ? 'supplier' : kind;
    const recordId = ['invoice', 'receipt', 'invoiceReading'].includes(kind) ? row.orderId : kind === 'quoteReading' ? row.requestId : kind === 'supplierDocument' ? row.supplierId : id;
    const body=String(row.body??'').trim(),at=query?body.toLowerCase().indexOf(query.toLowerCase()):-1;const excerpt=body.slice(Math.max(0,at-80),Math.max(0,at-80)+240);
    return { kind, id, title: row.title, ...(row.number ? { number: row.number } : {}), ...(row.supplierName ? { supplier: row.supplierName } : {}), ...(row.currency ? { currency: row.currency } : {}), ...(row.amountMinor !== null ? { amountMinor: row.amountMinor } : {}), ...(row.date ? { date: row.date } : {}), ...(row.status ? { status: row.status } : {}), url: '/app?search=1&open=' + encodeURIComponent(kind + ':' + id), ...(body ? { excerpt } : {}), ...(row.sourceAttachment ? { sourceUrl:'/api/purse/download/attachment/'+encodeURIComponent(row.sourceAttachment) } : {}), recordKind, recordId };
}

searchApi.get('/api/purse/search/meta', async c => {
    const current = await context(c.req.raw, c.env);
    const business = await c.env.DB.prepare("SELECT json_extract(value,'$.name') AS name FROM p_records WHERE business='main' AND kind='business' LIMIT 1").first<Data>();
    await readFence(c.env.DB, current.actor, current.revision);
    return c.json({ actor: { id: current.actor.id, email: current.actor.email, roles: current.roles, permissions: current.permissions, grants: current.grants }, business: business?.name });
});
searchApi.get('/api/purse/search', async c => {
    const filters = searchFilters(c.req.query()), current = await context(c.req.raw, c.env, filters.q);
    const query = queryParts(filters, current);
    const [count, found] = await c.env.DB.batch<Data>([
        c.env.DB.prepare(query.prefix + 'SELECT count(*) AS total ' + query.from).bind(...query.params),
        c.env.DB.prepare(query.prefix + `SELECT s.*,supplier.title AS supplierName,(CASE WHEN s.kind='agreement' THEN (SELECT json_extract(value,'$.reading.attachment') FROM p_records source WHERE source.business=s.business AND source.kind=s.kind AND source.id=s.id) ELSE (SELECT json_extract(value,'$.sourceDescriptor.attachment') FROM p_records source WHERE source.business=s.business AND source.kind=s.kind AND source.id=s.id AND s.kind IN ('invoiceReading','quoteReading')) END) AS sourceAttachment ${query.from} ORDER BY s.date DESC,s.kind,s.id LIMIT ? OFFSET ?`).bind(...query.params, filters.limit, filters.offset),
    ]);
    await readFence(c.env.DB, current.actor, current.revision);
    return c.json({ results: found.results.map(row=>result(row,filters.q)), total: Number(count.results[0].total), limit: filters.limit, offset: filters.offset });
});
