import { operatorAuth, type Bindings } from '../auth.server';
import { insertRfqRecord } from './rfq-links';
import { Fault, requireThat, uid, type Actor } from './types';

export const privateText = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 2000;
export async function protectedProof(env: Bindings, a: Actor, since: number) {
    const row = await env.DB.prepare('SELECT 1 AS ok FROM oa_step_up_challenges WHERE session_id=? AND operator_id=? AND operator_version=? AND consumed_at>=? AND consumed_at<=? LIMIT 1').bind(a.session, a.id, a.version, since, Date.now()).first();
    requireThat(row, 'Native reauthentication required within ten minutes', 403);
}
export async function protectedBody(request: Request) {
    const raw = await request.text();
    requireThat(Buffer.byteLength(raw, 'utf8') <= 12000, 'Protected input too large', 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new Fault(400, 'Protected input invalid'); }
    requireThat(body && typeof body === 'object' && !Array.isArray(body), 'Protected input invalid');
    return body;
}
/** Refusals cannot use the refused session or revision as authority to save.
 * Append only a server-created audit row; never retain a body, path, cookie,
 * reason, evidence reference, bearer, key id or submitted supplier identifier.
 */
export async function protectedRefusal(env: Bindings, request: Request, operation: string, error: unknown, a?: Actor): Promise<never> {
    const fault = error instanceof Fault ? error : new Fault(400, 'Protected input invalid');
    // Attribution only: use a same-origin GET so an origin refusal cannot
    // refuse the audit lookup too. This never grants the attempted operation.
    const session = a ? undefined : await operatorAuth(env).getSession(new Request(env.AUTH_ORIGIN, { headers: { host: new URL(env.AUTH_ORIGIN).host, cookie: request.headers.get('cookie') ?? '' } }));
    const reasons: Record<number, string> = { 400: 'Invalid protected input', 401: 'Native session unavailable', 403: 'Owner, origin or reauthentication refused', 404: 'Protected operation or record unavailable', 409: 'State or authority changed', 413: 'Protected input too large', 503: 'Protected key unavailable' };
    await insertRfqRecord(env.DB, 'audit', {
        id: uid(), actor: a?.id ?? session?.operator.id ?? 'unidentified',
        action: 'protected-refused', record: 'supplier-protected',
        operation: ['read', 'store', 'reveal', 'key-status', 'rotate', 'recover', 'legacy-reentry', 'evidence-migrate', 'archive-export', 'archive-restore'].includes(operation) ? operation : 'unavailable',
        status: fault.status, reason: reasons[fault.status] ?? 'Protected operation refused', at: new Date().toISOString(),
    }).run();
    throw fault;
}
