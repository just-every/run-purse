import { operatorAuth, runtimeBindings, type Bindings } from '../auth.server';
import { key, requireThat, Fault, type Actor, type Row, type State } from './types';
export async function actor(request: Request, original: Bindings): Promise<Actor> { const env = runtimeBindings(original); requireThat(new URL(request.url).origin === env.AUTH_ORIGIN, 'Invalid host', 403); if (!['GET', 'HEAD'].includes(request.method))
    requireThat(request.headers.get('origin') === env.AUTH_ORIGIN && request.headers.get('sec-fetch-site') !== 'cross-site', 'Invalid origin', 403); const session = await operatorAuth(env).getSession(request); requireThat(session, 'Sign in required', 401); return { id: session.operator.id, email: session.operator.email, session: session.id, version:session.operator.version, owner: session.operator.role === 'owner', dev: session.kind === 'dev' }; }
export function authority(a: Actor, owner = false) { return { sql: `EXISTS(SELECT 1 FROM oa_sessions se JOIN oa_operators o ON o.id=se.operator_id WHERE se.id=? AND o.id=? AND o.version=se.operator_version AND o.status='active' AND se.revoked_at IS NULL AND se.expires_at>unixepoch()*1000 ${owner ? "AND o.role='owner'" : ""})`, params: [a.session, a.id] }; }
export async function load(db: D1Database) { const result = await db.batch([db.prepare('SELECT revision FROM p_meta WHERE id=1'), db.prepare("SELECT * FROM p_records WHERE business='main'")]); const revision = Number((result[0].results[0] as any).revision); const state: State = new Map(result[1].results.map((r: any) => [key(r.kind, r.id), { ...r, value: JSON.parse(r.value) }])); return { revision, state }; }
export async function save(db: D1Database, a: Actor, before: State, after: State, revision: number) { const auth = authority(a); const q = [db.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(...auth.params, revision)]; for (const [k, r] of after) {
    if (before.get(k)?.revision === r.revision)
        continue;
    // Fresh grants cover preparation and issuance; issued receiving metadata is physical history.
    if(r.kind==='order'&&(r.value.status==='prepared'||(r.value.status==='issued'&&(before.get(k)?.value.status!=='issued'||r.value.reopenedAt!==before.get(k)?.value.reopenedAt))))q.push(db.prepare("INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active') THEN 1 ELSE 0 END").bind(r.value.approvalActor,r.value.approvalVersion));
    q.push(db.prepare('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value').bind(r.business, r.kind, r.id, r.revision, JSON.stringify(r.value)));
} for (const [k, r] of before)
    if (!after.has(k))
        q.push(db.prepare('DELETE FROM p_records WHERE business=? AND kind=? AND id=?').bind(r.business, r.kind, r.id)); q.push(db.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) THEN 1 ELSE 0 END`).bind(...auth.params), db.prepare('DELETE FROM p_guard')); try {
    await db.batch(q);
}
catch (e) {
    if (String(e).includes('CHECK constraint'))
        throw new Fault(409, 'State or authority changed; reload before trying again');
    throw e;
} }
export async function readFence(db: D1Database, a: Actor, revision: number) { const auth = authority(a); const result = await db.prepare(`SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END AS ok`).bind(...auth.params, revision).first<{
    ok: number;
}>(); requireThat(result?.ok === 1, 'State or authority changed; reload', 409); }
