import { SAML, ValidateInResponseTo } from '@node-saml/node-saml';
import { AuthError, securityHeaders, type OperatorAuth } from '../modules/operator-auth/index.mjs';
import { samlPath, samlProviders, type SamlBindings, type SamlProvider } from './saml-config';
import { samlHash, samlPin, samlTransaction, type SamlTransaction } from './saml-storage';
import { validateSamlDestination } from './saml-validation';

const generationOf = async (db: D1Database) => (await db.prepare('SELECT generation FROM oa_auth_settings WHERE singleton=1').first<{generation: number}>())?.generation;
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
const requireThat = (value: unknown, code: string, status = 400) => { if (!value) throw new AuthError(code, status); };
const cookieName = (provider: SamlProvider, local: boolean) => (local ? 'purse_saml_' : '__Host-purse_saml_') + provider.id;
function cookie(provider: SamlProvider, local: boolean, value: string, age: number) {
    return cookieName(provider, local) + '=' + value + '; Path=/; HttpOnly; Max-Age=' + age + '; Secure; SameSite=None';
}
async function fields(request: Request) {
    requireThat(request.headers.get('content-type')?.split(';')[0] === 'application/x-www-form-urlencoded', 'saml_invalid_input', 415);
    const reader = request.body?.getReader(); requireThat(reader, 'saml_invalid_input');
    let size = 0; const chunks: Uint8Array[] = [];
    try {
        while (true) {
            const next = await reader!.read(); if (next.done) break;
            size += next.value.length; requireThat(size <= 180000, 'saml_input_too_large', 413); chunks.push(next.value);
        }
    } finally { await reader!.cancel(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const form = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    requireThat([...form.keys()].every(key => ['SAMLResponse', 'RelayState'].includes(key)) && form.getAll('SAMLResponse').length === 1 && form.getAll('RelayState').length === 1, 'saml_invalid_input');
    return Object.fromEntries(form);
}
function protocol(provider: SamlProvider, callback: string, transaction?: SamlTransaction) {
    let requestId = transaction?.requestId, instant = transaction?.instant;
    const saml = new SAML({ issuer: provider.entityId, audience: provider.entityId, callbackUrl: callback, entryPoint: provider.entryPoint,
        idpIssuer: provider.issuer, idpCert: provider.idpCert, signatureAlgorithm: 'sha256', digestAlgorithm: 'sha256',
        wantAssertionsSigned: true, wantAuthnResponseSigned: true, validateInResponseTo: ValidateInResponseTo.always,
        requestIdExpirationPeriodMs: 300000, maxAssertionAgeMs: 300000, acceptedClockSkewMs: 0,
        identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent', disableRequestedAuthnContext: true,
        cacheProvider: {
            async saveAsync(key, value) { requestId = key; instant = value; return { value, createdAt: Date.now() }; },
            async getAsync(key) { return key === requestId ? instant ?? null : null; },
            async removeAsync(key) { const result = key === requestId ? instant ?? null : null; instant = undefined; return result; },
        } });
    return { saml, recorded() { requireThat(requestId && instant, 'saml_transaction_unavailable', 503); return { requestId: requestId!, instant: instant! }; } };
}
/** SP-initiated SAML uses Base's native admission, pin and generation-fenced sessions. */
export async function samlResponse(request: Request, env: SamlBindings & { DB: D1Database; AUTH_ORIGIN: string; AUTH_LOCAL?: string }, auth: OperatorAuth): Promise<Response | null> {
    const url = new URL(request.url), match = /^\/auth\/saml\/([a-z][a-z0-9-]{0,25})\/(start|callback|metadata)$/.exec(url.pathname);
    if (!match) return null;
    let clear: string | undefined;
    try {
        requireThat(url.origin === env.AUTH_ORIGIN && (!request.headers.get('host') || request.headers.get('host') === url.host), 'invalid_host', 403);
        const provider = samlProviders(env).find(provider => provider.id === match[1]); requireThat(provider, 'saml_not_found', 404);
        const p = provider!, local = env.AUTH_LOCAL === 'true', callback = env.AUTH_ORIGIN + samlPath(p, 'callback');
        requireThat(request.method === (match[2] === 'metadata' ? 'GET' : 'POST'), 'saml_method_not_allowed', 405);
        if (match[2] === 'metadata') return new Response(protocol(p, callback).saml.generateServiceProviderMetadata(null, null), { headers: { ...securityHeaders(), 'content-type': 'application/samlmetadata+xml' } });
        requireThat(await auth.admission.accounts.identityEnabled?.(), 'saml_sign_in_disabled', 403);
        const pin = await samlPin(env.DB, p, callback);
        if (match[2] === 'start') {
            requireThat(request.headers.get('origin') === env.AUTH_ORIGIN && request.headers.get('sec-fetch-site') !== 'cross-site', 'invalid_origin', 403);
            const now = Date.now(), bucket = 'saml:' + p.id + ':' + Math.floor(now / 300000) + ':' + await samlHash(request.headers.get('CF-Connecting-IP') ?? 'unknown');
            await env.DB.prepare('DELETE FROM oa_oidc_limits WHERE expires_at<=?').bind(now).run();
            const rate = await env.DB.prepare('INSERT INTO oa_oidc_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket, now + 300000).first<{count: number}>();
            requireThat(rate && rate.count <= 20, 'saml_rate_limited', 429);
            const relay = random(), browser = random(), generation = await generationOf(env.DB);
            requireThat(Number.isSafeInteger(generation), 'saml_policy_unavailable', 503);
            const adapter = protocol(p, callback), location = await adapter.saml.getAuthorizeUrlAsync(relay, undefined, {});
            await samlTransaction(env.DB, relay, browser, pin.fingerprint, { ...adapter.recorded(), generation: generation!, provider: pin.id, expires: now + 300000 });
            return new Response(null, { status: 303, headers: { ...securityHeaders(), location, 'set-cookie': cookie(p, local, browser, 300) } });
        }
        const body = await fields(request), relay = body.RelayState;
        requireThat(/^[a-f0-9]{64}$/.test(relay), 'saml_invalid_correlation');
        const cookies = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(cookieName(p, local) + '='));
        requireThat(cookies.length === 1, 'saml_invalid_correlation');
        const browser = cookies[0].slice(cookieName(p, local).length + 1); requireThat(/^[a-f0-9]{64}$/.test(browser), 'saml_invalid_correlation');
        const transaction = await samlTransaction(env.DB, relay, browser, pin.fingerprint);
        clear = cookie(p, local, '', 0);
        requireThat(transaction.provider === pin.id && transaction.generation === await generationOf(env.DB), 'saml_sign_in_disabled', 403);
        const { profile, loggedOut } = await protocol(p, callback, transaction).saml.validatePostResponseAsync(body);
        requireThat(profile && !loggedOut, 'saml_invalid_response');
        validateSamlDestination(profile!, callback, transaction.requestId, p.issuer);
        const associatedEmail = p.subjectEmails[profile!.nameID];
        const result = await auth.admission.admit(request, { issuer: p.issuer, subject: profile!.nameID, provider: pin.id,
            providerGeneration: transaction.generation, providerPin: pin, ...(associatedEmail ? { associatedEmail } : {}) }, { returnTo: '/app' });
        const headers = new Headers({ ...securityHeaders(), location: result.returnTo }); headers.append('set-cookie', clear); headers.append('set-cookie', result.cookie);
        return new Response(null, { status: 303, headers });
    } catch (error) {
        return Response.json({ error: error instanceof AuthError ? error.code : 'saml_invalid_response' }, { status: error instanceof AuthError ? error.status : 400, headers: { ...securityHeaders(), ...(clear ? { 'set-cookie': clear } : {}) } });
    }
}
