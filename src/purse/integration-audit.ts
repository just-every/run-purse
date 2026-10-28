import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../auth.server';
import { hashRfqToken, insertRfqRecord } from './rfq-links';
import { uid, type Data } from './types';

/** Record every refused bearer use, including attempts at native/agent/admin doors.
 * Unrecognized/rotated secrets stay anonymous; never retain the supplied bearer or its digest.
 */
export const integrationRefusals: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
    await next();
    const authorization = c.req.header('authorization'), management = ['/api/purse/integration-tokens','/api/purse/api-keys','/api/purse/webhooks'].some(path=>c.req.path.startsWith(path));
    const poRead = c.req.path.startsWith('/api/purse/integration/orders');
    const intake = c.req.path === '/api/purse/integration/requests';
    if (c.res.status < 400 || !(authorization?.startsWith('Bearer ') || management || intake || poRead)) return;
    const secret = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    let token = secret ? await c.env.DB.prepare('SELECT id,name,requester,requester_email FROM p_integration_tokens WHERE hash=?').bind(await hashRfqToken(secret)).first<Data>() : null;
    if(secret&&!token)token=await c.env.DB.prepare('SELECT id,name,principal AS requester,NULL AS requester_email FROM p_api_keys WHERE hash=?').bind(await hashRfqToken(secret)).first<Data>();
    const reasons: Record<number, string> = { 400: 'Invalid request', 401: 'Authentication refused', 403: 'Capability, requester or origin refused', 404: 'Door or record unavailable', 409: 'Body, state or authority conflict', 413: 'Request too large', 429: 'Read rate limit exceeded' };
    await insertRfqRecord(c.env.DB, 'audit', {
        id: uid(), actor: token ? `integration:${token.id}` : 'integration:unidentified',
        action: 'integration-use-refused', record: token?.id ?? 'unidentified',
        integration: token?.id ?? null, name: token?.name ?? null,
        requester: token?.requester ?? null, requesterEmail: token?.requester_email ?? null,
        door: management ? 'token-management' : intake ? 'create-purchase-request' : poRead ? 'read-purchase-order' : 'outside-token-scope',
        method: c.req.method, status: c.res.status, reason: reasons[c.res.status] ?? 'Request refused',
        at: new Date().toISOString(),
    }).run();
};
