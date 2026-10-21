import { Hono } from 'hono';
import type { Bindings } from '../auth.server';
import { insertRfqRecord } from './rfq-links';
import { enterpriseSchema, listSchema, patchedUser, scimBody, ScimFault, userDocument, userInput, userSchema } from './scim-input';
import { authenticateScim, scimReadFence } from './scim-storage';
import { findScimUser, provisionScimUser } from './scim-users';
import { all, Fault, requireThat, uid, type Data } from './types';
export { scimSettingsApi } from './scim-settings';
export { currentScimAssignment, scimAssignmentAllows, scimApprovalHolder } from './scim-approvals';
export { scimPrivateKinds } from './scim-storage';

export const scimApi = new Hono<{ Bindings: Bindings }>();
scimApi.use('/scim/v2/*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); if (c.res.status !== 204) c.header('Content-Type', 'application/scim+json'); });
scimApi.onError(async (error, c) => {
    const status = error instanceof Fault ? error.status : 500;
    // Never retain a bearer, body, resource identifier, query or provider error.
    await insertRfqRecord(c.env.DB, 'audit', { id: uid(), actor: 'scim-service', action: 'scim-refused', record: 'scim', status, at: new Date().toISOString() }).run();
    if (status === 401) c.header('WWW-Authenticate', 'Bearer');
    return c.json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: String(status), detail: error instanceof Fault ? error.message : 'SCIM operation failed', ...(error instanceof ScimFault && error.scimType ? { scimType: error.scimType } : {}) }, status as 400);
});
function list(resources: Data[], totalResults = resources.length, startIndex = 1) { return { schemas: [listSchema], totalResults, startIndex, itemsPerPage: resources.length, Resources: resources }; }
function integer(value: string | undefined, fallback: number, minimum: number, maximum: number) { if (value === undefined) return fallback; requireThat(/^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= minimum && Number(value) <= maximum, 'Invalid SCIM pagination'); return Number(value); }
function filtered(users: Data[], expression?: string) {
    if (!expression) return users;
    const match = /^(userName|externalId|id|active)\s+eq\s+("(?:[^"\\]|\\.)*"|true|false)$/i.exec(expression);
    if (!match) throw new ScimFault(400, 'Supported filters are userName, externalId, id or active with eq', 'invalidFilter');
    let value: unknown; try { value = JSON.parse(match[2]); } catch { throw new ScimFault(400, 'Invalid filter value', 'invalidFilter'); }
    const key = ['userName', 'externalId', 'id', 'active'].find(k => k.toLowerCase() === match[1].toLowerCase())!;
    if (key === 'active' ? typeof value !== 'boolean' : typeof value !== 'string') throw new ScimFault(400, 'Filter value has the wrong type', 'invalidFilter');
    return users.filter(user => key === 'userName' ? user[key].toLowerCase() === (value as string).toLowerCase() : user[key] === value);
}
scimApi.get('/scim/v2/Users', async c => {
    const auth = await authenticateScim(c.req.raw, c.env), users = filtered(all(auth.state, 'scimUser').filter(u => u.issuer === auth.config.issuer).sort((a, b) => a.id.localeCompare(b.id)), c.req.query('filter'));
    const start = integer(c.req.query('startIndex'), 1, 1, Number.MAX_SAFE_INTEGER), count = integer(c.req.query('count'), 100, 0, 200);
    const resources = users.slice(start - 1, start - 1 + count).map(u => userDocument(u, c.env.AUTH_ORIGIN)); await scimReadFence(c.env.DB, auth);
    return c.json(list(resources, users.length, start));
});
scimApi.get('/scim/v2/Users/:id', async c => {
    const auth = await authenticateScim(c.req.raw, c.env), user = findScimUser(auth, c.req.param('id'));
    await scimReadFence(c.env.DB, auth); c.header('ETag', 'W/"' + user.version + '"'); return c.json(userDocument(user, c.env.AUTH_ORIGIN));
});
scimApi.post('/scim/v2/Users', async c => {
    const auth = await authenticateScim(c.req.raw, c.env), user = await provisionScimUser(c.env.DB, auth, userInput(await scimBody(c.req.raw)));
    c.header('Location', c.env.AUTH_ORIGIN + '/scim/v2/Users/' + user.id); c.header('ETag', 'W/"' + user.version + '"'); return c.json(userDocument(user, c.env.AUTH_ORIGIN), 201);
});
scimApi.on(['PATCH', 'PUT', 'DELETE'], '/scim/v2/Users/:id', async c => {
    const auth = await authenticateScim(c.req.raw, c.env), previous = findScimUser(auth, c.req.param('id')), match = c.req.header('if-match');
    if (match && match !== '*' && match !== 'W/"' + previous.version + '"') throw new ScimFault(412, 'User version changed', 'invalidVers');
    const input = c.req.method === 'DELETE' ? { ...previous, active: false } : c.req.method === 'PATCH' ? patchedUser(previous, await scimBody(c.req.raw), c.env.AUTH_ORIGIN) : userInput(await scimBody(c.req.raw), previous);
    const user = await provisionScimUser(c.env.DB, auth, input, previous);
    if (c.req.method === 'DELETE') return c.body(null, 204);
    c.header('ETag', 'W/"' + user.version + '"'); return c.json(userDocument(user, c.env.AUTH_ORIGIN));
});
scimApi.get('/scim/v2/ServiceProviderConfig', async c => {
    const auth = await authenticateScim(c.req.raw, c.env); await scimReadFence(c.env.DB, auth);
    return c.json({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'], patch: { supported: true }, bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 }, filter: { supported: true, maxResults: 200 }, changePassword: { supported: false }, sort: { supported: false }, etag: { supported: true }, authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Owner-issued SCIM bearer', description: 'SCIM-only bearer issued by a current native owner', primary: true }] });
});
scimApi.get('/scim/v2/ResourceTypes', async c => {
    const auth = await authenticateScim(c.req.raw, c.env); await scimReadFence(c.env.DB, auth);
    return c.json(list([{ schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'User', name: 'User', endpoint: '/Users', schema: userSchema, schemaExtensions: [{ schema: enterpriseSchema, required: false }] }]));
});
