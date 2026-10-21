import { Hono } from 'hono';
import type { Bindings } from '../auth.server';
import { protectedProof } from './protected-controls';
import { actor, readFence } from './store';
import { scimBody } from './scim-input';
import { scimMappings } from './scim-mapping';
import { loadScim, nativeFence, nativeOperators, scimHash, scimOwnerFence, scimSecret, stateWrites } from './scim-storage';
import { all, audit, Fault, put, requireThat, text, type Data } from './types';
import { insertRfqRecord } from './rfq-links';
import { builtinRoles } from './access-permissions';

export const scimSettingsApi = new Hono<{ Bindings: Bindings }>();
scimSettingsApi.use('/api/purse/scim', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
scimSettingsApi.onError(async (error, c) => {
    const status = error instanceof Fault ? error.status : 500;
    await insertRfqRecord(c.env.DB, 'audit', { id: crypto.randomUUID(), actor: 'unidentified', action: 'scim-settings-refused', record: 'scim', status, at: new Date().toISOString() }).run();
    return c.json({ error: error instanceof Fault ? error.message : 'SCIM settings operation failed' }, status as 400);
});
function metadata(credential?: Data) { if (!credential) return null; const { hash, ...safe } = credential; return safe; }
scimSettingsApi.get('/api/purse/scim', async c => {
    const a = await actor(c.req.raw, c.env); requireThat(a.owner, 'Current native owner required', 403);
    const { state, revision } = await loadScim(c.env.DB), operators = await nativeOperators(c.env.DB);
    await readFence(c.env.DB, a, revision);
    const business = state.get('business:main')?.value;
    return c.json({ revision, endpoint: c.env.AUTH_ORIGIN + '/scim/v2', config: state.get('scimConfig:main')?.value ?? null, credential: metadata(state.get('scimCredential:main')?.value),
        choices: { departments: business?.costCentres ?? [], locations: business?.locations ?? [], projects: business?.projects ?? [], entities: [{ id: 'main', name: business?.name ?? 'Main business' }, ...all(state, 'entity').map(e => ({ id: e.id, name: e.name }))], roles: [...builtinRoles.filter(role => role !== 'owner').map(id => ({ id, name: id.replace(/-/g, ' ') })), ...all(state, 'accessRole').filter(r => r.active).map(r => ({ id: r.id, name: r.name }))] },
        delegates: operators.filter(o => o.status === 'active').map(o => ({ id: o.id, email: o.email, name: o.display_name })), users: all(state, 'scimUser').map(u => ({ id: u.id, email: u.userName, department: u.department, manager: u.manager, active: u.active })) });
});
scimSettingsApi.post('/api/purse/scim', async c => {
    const a = await actor(c.req.raw, c.env); requireThat(a.owner, 'Current native owner required', 403);
    const since = Date.now() - 600000; await protectedProof(c.env, a, since);
    const b = await scimBody(c.req.raw), { state, revision } = await loadScim(c.env.DB);
    requireThat(b.revision === revision, 'SCIM settings changed; reload', 409);
    const after = structuredClone(state), at = new Date().toISOString(), operators = await nativeOperators(c.env.DB), fences: Data[] = [];
    let token: string | undefined;
    if (b.action === 'configure') {
        requireThat(b.consent === true, 'Explicit owner consent is required for identity provisioning, mapped grants and approval transfer');
        const issuer = text(b.issuer, 'IdP issuer', 1000); let issuerUrl: URL;
        try { issuerUrl = new URL(issuer); } catch { throw new Fault(400, 'IdP issuer must be an absolute URL'); }
        requireThat(issuerUrl.protocol === 'https:' || issuerUrl.origin === c.env.AUTH_ORIGIN, 'IdP issuer requires HTTPS');
        requireThat(!issuerUrl.username && !issuerUrl.password && !issuerUrl.search && !issuerUrl.hash, 'IdP issuer must not contain credentials or query parameters');
        const previous = state.get('scimConfig:main')?.value;
        requireThat(!previous || previous.issuer === issuer || all(state, 'scimUser').length === 0, 'Existing provisioned identities pin the issuer', 409);
        requireThat(typeof b.enabled === 'boolean', 'enabled must be boolean');
        const delegate = b.delegate ? text(b.delegate, 'Fallback delegate', 200) : '';
        if (delegate) { const native = operators.find(o => o.id === delegate && o.status === 'active'); requireThat(native, 'Choose a currently active native fallback delegate'); fences.push(native); }
        const config = { issuer, enabled: b.enabled, mappings: scimMappings(state, b.mappings), delegate, consentBy: a.id, consentVersion: a.version, consentAt: at };
        put(after, 'scimConfig', 'main', config); audit(after, a, 'scim-configure', 'main', { before: previous ?? null, after: config });
    } else if (['create-token', 'rotate', 'revoke'].includes(b.action)) {
        requireThat(state.has('scimConfig:main'), 'Configure SCIM before issuing a credential', 409);
        const previous = state.get('scimCredential:main')?.value;
        requireThat(b.action !== 'create-token' || !previous || previous.revokedAt, 'Rotate the existing SCIM credential', 409);
        requireThat(b.action === 'create-token' || previous, 'SCIM credential not found', 404);
        if (b.action === 'revoke') put(after, 'scimCredential', 'main', { ...previous, revokedAt: at });
        else { token = scimSecret(); put(after, 'scimCredential', 'main', { hash: await scimHash(token), generation: (previous?.generation ?? 0) + 1, creator: a.id, creatorVersion: a.version, createdAt: previous?.createdAt ?? at, rotatedAt: previous ? at : null, revokedAt: null }); }
        audit(after, a, 'scim-credential-' + b.action, 'main', { generation: after.get('scimCredential:main')!.value.generation });
    } else throw new Fault(404, 'Unknown SCIM settings action');
    try { await c.env.DB.batch([scimOwnerFence(c.env.DB, a, revision, since), ...fences.map(o => nativeFence(c.env.DB, o)), ...stateWrites(c.env.DB, state, after), c.env.DB.prepare('DELETE FROM p_guard')]); }
    catch (error) { if (/CHECK constraint/.test(String(error))) throw new Fault(409, 'SCIM settings or native authority changed; reload'); throw error; }
    c.header('Cache-Control', 'no-store');
    return c.json({ ...(token ? { token } : {}), credential: metadata(after.get('scimCredential:main')?.value), configured: true });
});
