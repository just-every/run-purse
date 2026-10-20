import { Hono } from 'hono';
import type { Bindings } from '../auth.server';
import { actor, readFence } from './store';
import { Fault, requireThat, type Actor, type Data } from './types';
import { likeText, normalizeSearchSql, searchExpression, searchFilters, type SearchFilters } from './search-index';

type SearchContext = { actor: Actor; roles: string[]; revision: number; normalized: string; grant: Data };
export const searchApi = new Hono<{ Bindings: Bindings }>();
searchApi.use('/api/purse/search*', async (c, next) => {
    c.header('cache-control', 'no-store'); c.header('x-content-type-options', 'nosniff'); await next();
});
searchApi.onError((error, c) => c.json({ error: error.message }, error instanceof Fault ? error.status as 400 : 400));

async function context(request: Request, env: Bindings, q = ''): Promise<SearchContext> {
    const a = await actor(request, env);
    // Membership and the one current catalogue grant are the only source JSON read.
    // All purchasing records are queried through the safe, trigger-maintained projection.
    const [meta, members, grants, folded] = await env.DB.batch<Data>([
        env.DB.prepare('SELECT revision FROM p_meta WHERE id=1'),
        env.DB.prepare("SELECT value FROM p_records WHERE business='main' AND kind='member'"),
        env.DB.prepare("SELECT value FROM p_records WHERE business='main' AND kind='catalogueGrant' AND id=?").bind(a.email.toLowerCase()),
        env.DB.prepare(normalizeSearchSql).bind(q),
    ]);
    const member = members.results.map(row => JSON.parse(String(row.value)) as Data).find(value => value.active && String(value.email).toLowerCase() === a.email.toLowerCase());
    const roles: string[] = a.owner ? ['owner', 'requester', 'approver', 'buyer', 'receiver'] : member?.roles ?? [];
    requireThat(roles.length, 'No active business membership', 403);
    return { actor: a, roles, revision: Number(meta.results[0].revision), normalized: String(folded.results[0].normalized), grant: grants.results[0] ? JSON.parse(String(grants.results[0].value)) : {} };
}

/** Filter first in SQL, including scope, before selecting any result or excerpt. */
function queryParts(filters: SearchFilters, current: SearchContext) {
    const params: unknown[] = [], clauses = ["s.business='main'"];
    const bind = (value: unknown) => { params.push(value); return '?'; };
    const buyer = current.roles.includes('buyer'), staff = current.roles.some(role => ['owner', 'approver', 'buyer', 'receiver'].includes(role));
    let catalogue = '1';
    if (!buyer) {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
        catalogue = `s.approved=1 AND (s.validFrom='' OR s.validFrom<=${bind(today)}) AND (s.validUntil='' OR s.validUntil>=${bind(today)})`;
        for (const dimension of ['departments', 'locations', 'entities', 'roles']) {
            const allowed = dimension === 'roles' ? current.roles : current.grant[dimension] ?? [];
            catalogue += ` AND (NOT EXISTS(SELECT 1 FROM json_each(s.access_${dimension})) OR EXISTS(SELECT 1 FROM json_each(s.access_${dimension}) restriction JOIN json_each(${bind(JSON.stringify(allowed))}) allowed ON allowed.value=restriction.value))`;
        }
    }
    const own = staff ? '1' : `(r.requesterId=${bind(current.actor.id)} OR r.requesterEmail=${bind(current.actor.email)})`;
    clauses.push(`(s.kind='supplier' OR (s.kind='catalogue' AND (${catalogue})) OR (s.kind='supplierDocument' AND ${buyer ? '1' : '0'}) OR (s.kind='invoiceReading' AND ${buyer ? '1' : '0'} AND o.id IS NOT NULL AND r.id IS NOT NULL) OR (s.kind IN ('request','order','invoice','receipt','quoteReading') AND r.id IS NOT NULL AND (${own})))`);
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

    const ctes: string[] = [], candidateParams: unknown[] = [];
    if (filters.q) {
        const expression = searchExpression(filters.q);
        const candidates: string[] = [];
        if (expression) { candidates.push('SELECT rowid FROM p_search_fts WHERE p_search_fts MATCH ?'); candidateParams.push(expression); }
        candidates.push("SELECT rowid FROM p_search WHERE business='main' AND number LIKE ? ESCAPE '\\' COLLATE NOCASE"); candidateParams.push(likeText(filters.q));
        if (current.normalized) {
            ctes.push("matched_suppliers AS (SELECT id FROM p_search WHERE business='main' AND kind='supplier' AND namesKey LIKE ? ESCAPE '\\')");
            candidateParams.unshift(likeText(current.normalized));
            candidates.push("SELECT rowid FROM p_search WHERE business='main' AND namesKey LIKE ? ESCAPE '\\'"); candidateParams.push(likeText(current.normalized));
            ctes.push("supplier_records AS (SELECT rowid,id,kind FROM p_search WHERE business='main' AND supplierId IN (SELECT id FROM matched_suppliers))");
            candidates.push('SELECT rowid FROM supplier_records');
            candidates.push("SELECT rowid FROM p_search WHERE business='main' AND orderId IN (SELECT id FROM supplier_records WHERE kind='order')");
            candidates.push("SELECT rowid FROM p_search WHERE business='main' AND requestId IN (SELECT id FROM supplier_records WHERE kind='request')");
        }
        ctes.push(`candidates AS (${candidates.join(' UNION ')})`);
        clauses.push('s.rowid IN (SELECT rowid FROM candidates)');
    }
    const from = `FROM p_search s
        LEFT JOIN p_search o ON o.business=s.business AND o.kind='order' AND o.id=s.orderId
        LEFT JOIN p_search r ON r.business=s.business AND r.kind='request' AND r.id=CASE WHEN s.kind='request' THEN s.id ELSE coalesce(nullif(s.requestId,''),o.requestId) END
        LEFT JOIN p_search supplier ON supplier.business=s.business AND supplier.kind='supplier' AND supplier.id=coalesce(nullif(s.supplierId,''),nullif(o.supplierId,''),r.supplierId)
        WHERE ${clauses.join(' AND ')}`;
    return { prefix: ctes.length ? 'WITH ' + ctes.join(',') + ' ' : '', from, params: [...candidateParams, ...params] };
}

function result(row: Data) {
    const kind = String(row.kind), id = String(row.id);
    const recordKind = ['invoice', 'receipt', 'invoiceReading'].includes(kind) ? 'order' : kind === 'quoteReading' ? 'request' : kind === 'supplierDocument' ? 'supplier' : kind;
    const recordId = ['invoice', 'receipt', 'invoiceReading'].includes(kind) ? row.orderId : kind === 'quoteReading' ? row.requestId : kind === 'supplierDocument' ? row.supplierId : id;
    return { kind, id, title: row.title, ...(row.number ? { number: row.number } : {}), ...(row.supplierName ? { supplier: row.supplierName } : {}), ...(row.currency ? { currency: row.currency } : {}), ...(row.amountMinor !== null ? { amountMinor: row.amountMinor } : {}), ...(row.date ? { date: row.date } : {}), ...(row.status ? { status: row.status } : {}), url: '/app?search=1&open=' + encodeURIComponent(kind + ':' + id), ...(row.body ? { excerpt: String(row.body).trim().slice(0, 240) } : {}), recordKind, recordId };
}

searchApi.get('/api/purse/search/meta', async c => {
    const current = await context(c.req.raw, c.env);
    await readFence(c.env.DB, current.actor, current.revision);
    return c.json({ actor: { id: current.actor.id, email: current.actor.email, roles: current.roles } });
});
searchApi.get('/api/purse/search', async c => {
    const filters = searchFilters(c.req.query()), current = await context(c.req.raw, c.env, filters.q);
    const query = queryParts(filters, current);
    const [count, found] = await c.env.DB.batch<Data>([
        c.env.DB.prepare(query.prefix + 'SELECT count(*) AS total ' + query.from).bind(...query.params),
        c.env.DB.prepare(query.prefix + `SELECT s.*,supplier.title AS supplierName ${query.from} ORDER BY s.date DESC,s.kind,s.id LIMIT ? OFFSET ?`).bind(...query.params, filters.limit, filters.offset),
    ]);
    await readFence(c.env.DB, current.actor, current.revision);
    return c.json({ results: found.results.map(result), total: Number(count.results[0].total), limit: filters.limit, offset: filters.offset });
});
