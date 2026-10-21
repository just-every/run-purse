import type { Bindings } from '../auth.server';
import { authority, load } from './store';
import { Fault, requireThat, type Actor, type Data, type State } from './types';

export const scimPrivateKinds = ['scimConfig', 'scimCredential', 'scimUser', 'scimApprovalTransfer'];
const authorityKinds = ['scimConfig', 'scimCredential'];
/** Service authority is installation-local and never part of a domain archive. */
export async function loadScim(db: D1Database) {
    const snapshot = await load(db), rows = await db.prepare('SELECT kind,revision,value FROM p_scim_authority').all<Data>();
    for (const row of rows.results) snapshot.state.set(row.kind + ':main', { business: 'main', kind: row.kind, id: 'main', revision: row.revision, value: JSON.parse(row.value) });
    return snapshot;
}
export async function scimHash(token: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('purse:scim:v2:' + token));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function scimSecret() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export type ScimAuthority = { credential: Data; config: Data; revision: number; state: State };
export function credentialFence(db: D1Database, auth: ScimAuthority) {
    return db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM p_scim_authority c JOIN oa_operators o ON o.id=json_extract(c.value,'$.creator') WHERE c.kind='scimCredential' AND json_extract(c.value,'$.hash')=? AND json_extract(c.value,'$.generation')=? AND json_extract(c.value,'$.revokedAt') IS NULL AND o.role='owner' AND o.status='active' AND o.version=json_extract(c.value,'$.creatorVersion')) AND EXISTS(SELECT 1 FROM p_scim_authority WHERE kind='scimConfig' AND json_extract(value,'$.enabled')=1) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END AS ok`).bind(auth.credential.hash, auth.credential.generation, auth.revision);
}
export async function authenticateScim(request: Request, env: Bindings): Promise<ScimAuthority> {
    requireThat(new URL(request.url).origin === env.AUTH_ORIGIN, 'Invalid SCIM host', 403);
    const header = request.headers.get('authorization') ?? '', match = /^Bearer ([A-Za-z0-9_-]{40,100})$/i.exec(header);
    requireThat(match, 'SCIM bearer required', 401);
    const { state, revision } = await loadScim(env.DB), credential = state.get('scimCredential:main')?.value, config = state.get('scimConfig:main')?.value;
    const hash = await scimHash(match[1]);
    requireThat(credential && config?.enabled && !credential.revokedAt && credential.hash === hash, 'SCIM credential unavailable', 401);
    const auth = { state, revision, credential, config };
    requireThat((await credentialFence(env.DB, auth).first<Data>())?.ok === 1, 'SCIM authority unavailable', 401);
    return auth;
}
export async function scimReadFence(db: D1Database, auth: ScimAuthority) { requireThat((await credentialFence(db, auth).first<Data>())?.ok === 1, 'SCIM state or authority changed; retry', 409); }
export async function nativeOperators(db: D1Database): Promise<Data[]> { return (await db.prepare('SELECT id,email,display_name,role,status,version,created_at FROM oa_operators').all<Data>()).results; }
export function nativeActor(operator: Data): Actor { return { id: operator.id, email: operator.email, version: operator.version, owner: operator.role === 'owner', session: '', dev: false }; }
export function nativeFence(db: D1Database, operator: Data) { return db.prepare('INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status=? AND role=?) THEN 1 ELSE 0 END').bind(operator.id, operator.version, operator.status, operator.role); }
export function stateWrites(db: D1Database, before: State, after: State): D1PreparedStatement[] {
    const statements: D1PreparedStatement[] = [];
    for (const [key, row] of after) if (before.get(key)?.revision !== row.revision) {
        if (authorityKinds.includes(row.kind)) statements.push(db.prepare('INSERT INTO p_scim_authority(kind,revision,value) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET revision=excluded.revision,value=excluded.value').bind(row.kind, row.revision, JSON.stringify(row.value)));
        else statements.push(db.prepare('INSERT INTO p_records(business,kind,id,revision,value) VALUES(?,?,?,?,?) ON CONFLICT(business,kind,id) DO UPDATE SET revision=excluded.revision,value=excluded.value').bind(row.business, row.kind, row.id, row.revision, JSON.stringify(row.value)));
    }
    return statements;
}
/** D1 batch is one transaction: no session or transfer can settle independently. */
export async function settleScim(db: D1Database, auth: ScimAuthority, after: State, native: D1PreparedStatement[], recipients: Data[]) {
    const guard = db.prepare(`INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM p_scim_authority c JOIN oa_operators o ON o.id=json_extract(c.value,'$.creator') WHERE c.kind='scimCredential' AND json_extract(c.value,'$.hash')=? AND json_extract(c.value,'$.generation')=? AND json_extract(c.value,'$.revokedAt') IS NULL AND o.role='owner' AND o.status='active' AND o.version=json_extract(c.value,'$.creatorVersion')) AND EXISTS(SELECT 1 FROM p_scim_authority WHERE kind='scimConfig' AND json_extract(value,'$.enabled')=1) AND (SELECT revision FROM p_meta WHERE id=1)=? THEN 1 ELSE 0 END`).bind(auth.credential.hash, auth.credential.generation, auth.revision);
    try { await db.batch([guard, ...recipients.map(operator => nativeFence(db, operator)), ...native, ...stateWrites(db, auth.state, after), ...recipients.map(operator => nativeFence(db, operator)), db.prepare('DELETE FROM p_guard')]); }
    catch (error) { if (/CHECK constraint|UNIQUE constraint/.test(String(error))) throw new Fault(409, 'SCIM state or native authority changed; retry'); throw error; }
}
export function scimOwnerFence(db: D1Database, a: Actor, revision: number, since: number) {
    const auth = authority(a, true);
    return db.prepare(`INSERT INTO p_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM p_meta WHERE id=1)=? AND EXISTS(SELECT 1 FROM oa_step_up_challenges WHERE session_id=? AND operator_id=? AND operator_version=? AND consumed_at>=? AND consumed_at<=?) THEN 1 ELSE 0 END`).bind(...auth.params, revision, a.session, a.id, a.version, since, Date.now());
}
