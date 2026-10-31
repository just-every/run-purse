import { deflateRawSync } from 'node:zlib';
import { AuthError, securityHeaders, type OperatorAuth } from '../modules/operator-auth/index.mjs';
import type { Bindings } from '../auth.server';
import { samlProviders, samlError } from './saml-config';
import { verifySaml } from './saml-assertion';
import { escapeSaml as escape, hashToken, opaqueToken, samlPin, samlAdmissionDatabase, type SamlTransaction } from './saml-transaction';

async function fields(request: Request, allowed: string[], limit = 200000) {
    if (request.method !== 'POST') samlError('method_not_allowed', 405);
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') samlError('unsupported_media_type', 415);
    const reader = request.body?.getReader(); if (!reader) samlError();
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) samlError('input_too_large', 413); chunks.push(part.value); } }
    finally { await reader.cancel(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const form = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if ([...form.keys()].some(key => !allowed.includes(key) || form.getAll(key).length !== 1)) samlError();
    return form;
}
function sameOrigin(request: Request, env: Bindings) {
    if (request.headers.get('origin') !== env.AUTH_ORIGIN || request.headers.get('sec-fetch-site') === 'cross-site') samlError('invalid_origin', 403);
}
export async function samlResponse(request: Request, env: Bindings, createAuth: (env: Bindings) => OperatorAuth,
    render: (body: string) => Promise<Response>): Promise<Response | null> {
    const url = new URL(request.url), match = /^\/auth\/saml\/([^/]+)\/(start|callback|finish|metadata)$/.exec(url.pathname);
    if (!match) return null;
    try {
        if (url.origin !== env.AUTH_ORIGIN || request.headers.get('host') && request.headers.get('host') !== url.host) samlError('invalid_host', 403);
        const provider = samlProviders(env).find(provider => provider.id === match[1]);
        if (!provider) samlError('saml_provider_unavailable', 404);
        const cookieName = (url.protocol === 'https:' ? '__Host-' : '') + 'purse_saml_' + (url.port || '443') + '_' + provider.id;
        const cookie = (value: string, age = 300) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`;
        if (match[2] === 'metadata') {
            if (request.method !== 'GET') samlError('method_not_allowed', 405);
            return new Response(`<?xml version="1.0"?><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${escape(provider.entityId)}"><md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat><md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${escape(provider.callback)}" index="0" isDefault="true"/></md:SPSSODescriptor></md:EntityDescriptor>`, { headers: { ...securityHeaders(), 'content-type': 'application/samlmetadata+xml' } });
        }
        if (match[2] === 'start') {
            sameOrigin(request, env);
            const form = await fields(request, ['returnTo'], 4096);
            const settings = await env.DB.prepare('SELECT generation,idp_sign_in FROM oa_auth_settings WHERE singleton=1').first<{ generation: number; idp_sign_in: number }>();
            if (!settings?.idp_sign_in) samlError('provider_sign_in_disabled', 403);
            const pin = await samlPin(env.DB, provider), now = Date.now();
            const bucket = await hashToken(env.SESSION_SECRET, 'saml-rate', provider.id + ':' + (request.headers.get('CF-Connecting-IP') ?? 'unknown') + ':' + Math.floor(now / 300000));
            await env.DB.prepare('DELETE FROM p_saml_limits WHERE expires_at<=?').bind(now).run();
            const rate = await env.DB.prepare('INSERT INTO p_saml_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket, now + 300000).first<{ count: number }>();
            if (!rate || rate.count > 20) samlError('rate_limited', 429);
            await env.DB.prepare('DELETE FROM p_saml_transactions WHERE expires_at<=?').bind(now).run();
            const relay = opaqueToken(), binding = opaqueToken(), requestId = '_' + crypto.randomUUID();
            const relayHash = await hashToken(env.SESSION_SECRET, 'saml-relay', relay), bindingHash = await hashToken(env.SESSION_SECRET, 'saml-browser', binding);
            // The only supported destination is the native workspace. No return
            // target or identity supplied by the IdP can redirect the browser.
            if (form.get('returnTo') && form.get('returnTo') !== '/app') samlError();
            await env.DB.prepare('INSERT INTO p_saml_transactions(relay_hash,request_id,provider_id,binding_hash,generation,fingerprint,expires_at) VALUES(?,?,?,?,?,?,?)')
                .bind(relayHash, requestId, provider.id, bindingHash, settings.generation, pin.fingerprint, now + 300000).run();
            const xml = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${requestId}" Version="2.0" IssueInstant="${new Date(now).toISOString()}" Destination="${escape(provider.ssoUrl)}" AssertionConsumerServiceURL="${escape(provider.callback)}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"><saml:Issuer>${escape(provider.entityId)}</saml:Issuer><samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent" AllowCreate="false"/></samlp:AuthnRequest>`;
            const target = new URL(provider.ssoUrl); target.searchParams.set('SAMLRequest', Buffer.from(deflateRawSync(xml)).toString('base64')); target.searchParams.set('RelayState', relay);
            return new Response(null, { status: 303, headers: { ...securityHeaders(), location: target.href, 'set-cookie': cookie(binding) } });
        }
        const form = await fields(request, ['SAMLResponse', 'RelayState']);
        const encoded = form.get('SAMLResponse'), relay = form.get('RelayState');
        if (!encoded || !relay || !/^[A-Za-z0-9_-]{43}$/.test(relay)) samlError();
        if (match[2] === 'callback') {
            // The IdP POST cannot carry a Lax cookie. A same-origin confirmation
            // performs verification with that cookie; no session or write is
            // allowed on this cross-site transport hop.
            const response = await render(`<h1>Complete single sign-on</h1><p>Continue in this browser to verify the requested sign-in.</p><form method="post" action="/auth/saml/${provider.id}/finish"><input type="hidden" name="SAMLResponse" value="${escape(encoded)}"><input type="hidden" name="RelayState" value="${escape(relay)}"><button>Continue sign-in</button></form>`);
            // As on the existing owner settings form, preserve the native
            // Origin header while disclosing only the origin as a referrer.
            const headers = new Headers(response.headers); headers.set('referrer-policy', 'strict-origin');
            return new Response(response.body, { status: response.status, headers });
        }
        sameOrigin(request, env);
        const cookies = (request.headers.get('cookie') ?? '').split(';').map(c => c.trim()).filter(c => c.startsWith(cookieName + '='));
        if (cookies.length !== 1) samlError('saml_browser_mismatch');
        const binding = cookies[0].slice(cookieName.length + 1); if (!/^[A-Za-z0-9_-]{43}$/.test(binding)) samlError();
        const relayHash = await hashToken(env.SESSION_SECRET, 'saml-relay', relay), bindingHash = await hashToken(env.SESSION_SECRET, 'saml-browser', binding);
        const transaction = await env.DB.prepare('SELECT * FROM p_saml_transactions WHERE relay_hash=? AND provider_id=? AND binding_hash=? AND consumed_at IS NULL AND expires_at>?')
            .bind(relayHash, provider.id, bindingHash, Date.now()).first<SamlTransaction>();
        if (!transaction) samlError('saml_correlation_failed');
        const pin = await samlPin(env.DB, provider);
        if (pin.fingerprint !== transaction.fingerprint) samlError('saml_registration_changed', 409);
        const identity = verifySaml(encoded, provider, transaction.request_id);
        // Association is owner-confirmed or already bound, never an assertion
        // email or role. SCIM's existing admission wrapper also rechecks it.
        const person = await env.DB.prepare(`SELECT DISTINCT o.id,o.version,o.email FROM oa_operators o WHERE
          EXISTS(SELECT 1 FROM p_scim_links l WHERE l.operator_id=o.id AND l.issuer=? AND l.external_id=? AND l.revoked_at IS NULL)
          OR EXISTS(SELECT 1 FROM oa_external_identities e WHERE e.operator_id=o.id AND e.issuer=? AND e.subject=?)
          OR EXISTS(SELECT 1 FROM p_records r WHERE r.business='main' AND r.kind='scimUser' AND r.id=o.id
            AND json_extract(r.value,'$.issuer')=? AND json_extract(r.value,'$.externalId')=?)`)
            .bind(provider.issuer, identity.subject, provider.issuer, identity.subject, provider.issuer, identity.subject).all<{ id: string; version: number; email: string }>();
        if (person.results.length !== 1) samlError('saml_association_required', 403);
        const account = person.results[0];
        const db = samlAdmissionDatabase(env.DB, transaction, bindingHash, { operatorId: account.id, version: account.version, subject: identity.subject, issuer: provider.issuer }, identity.expiresAt);
        const completed = await createAuth({ ...env, DB: db }).admission.admit(request, {
            issuer: provider.issuer, subject: identity.subject, associatedEmail: account.email, provider: provider.id, providerGeneration: transaction.generation,
            providerPin: { id: provider.id, issuer: provider.issuer, clientId: provider.entityId, linkedAt: pin.linked_at },
        }, { returnTo: '/app' });
        const headers = new Headers({ ...securityHeaders(), location: completed.returnTo });
        headers.append('set-cookie', completed.cookie); headers.append('set-cookie', cookie('', 0));
        return new Response(null, { status: 303, headers });
    } catch (error) {
        return Response.json({ error: error instanceof AuthError ? error.code : 'saml_admission_refused' }, { status: error instanceof AuthError ? error.status : 403, headers: securityHeaders() });
    }
}
