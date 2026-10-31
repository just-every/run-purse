import { AuthError, securityHeaders, type OperatorAuth } from '../modules/operator-auth/index.mjs';
import { identityProviderSummaries, type IdentityBindings } from './identity-config';
import { samlProviders, samlFingerprint } from './saml-config';

export const identitySettingsPath = '/auth/purse/identity';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const form = (action: string, label: string) => `<form method="post" action="${identitySettingsPath}"><input type="hidden" name="action" value="${action}"><button>${label}</button></form>`;
async function actionInput(request: Request, origin: string) {
    if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new AuthError('invalid_origin', 403);
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') throw new AuthError('unsupported_media_type', 415);
    const reader = request.body?.getReader();
    if (!reader) throw new AuthError('invalid_input');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
        while (true) {
            const next = await reader.read(); if (next.done) break;
            size += next.value.length;
            if (size > 4096) throw new AuthError('input_too_large', 413);
            chunks.push(next.value);
        }
    } finally { await reader.cancel(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const fields = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if ([...fields.keys()].some(key => key !== 'action') || fields.getAll('action').length !== 1) throw new AuthError('invalid_input');
    return fields.get('action');
}

/** Native owner controls use Base's current-session, generation-fenced admission setting. */
export async function identitySettingsResponse(request: Request, env: IdentityBindings & { AUTH_ORIGIN: string }, auth: OperatorAuth,
    render: (body: string) => Promise<Response>) {
    try {
        const providers = [...identityProviderSummaries(env, env.AUTH_ORIGIN), ...samlProviders(env).map(provider => ({
            id: provider.id, preset: 'SAML 2.0', label: provider.label, issuer: provider.issuer, clientId: provider.entityId,
            callback: provider.callback, credential: 'Pinned certificate ' + samlFingerprint(provider), associations: 0,
        }))];
        const settings = await auth.identitySettings(request);
        if (request.method === 'POST') {
            const action = await actionInput(request, env.AUTH_ORIGIN);
            if (action !== 'enable' && action !== 'disable') throw new AuthError('invalid_input');
            if (action === 'enable' && !providers.length) throw new AuthError('provider_configuration_required', 409);
            await auth.setIdentitySettings(request, { idpSignIn: action === 'enable' });
            return new Response(null, { status: 303, headers: { ...securityHeaders(), location: identitySettingsPath } });
        }
        if (!['GET', 'HEAD'].includes(request.method)) throw new AuthError('method_not_allowed', 405);
        const links = await auth.listProviders(request);
        const entries = providers.map(provider => {
            const pin = links.find(link => link.id === provider.id);
            return `<section><h2>${escape(provider.label)}</h2><p>${escape(provider.preset)} · ${escape(pin?.status ?? 'Not linked yet')}</p>`
                + `<dl><dt>Issuer</dt><dd>${escape(provider.issuer)}</dd><dt>Client ID</dt><dd>${escape(provider.clientId)}</dd>`
                + `<dt>Callback URL</dt><dd>${escape(provider.callback)}</dd><dt>Credential</dt><dd>${provider.credential}</dd></dl>`
                + `<p>${provider.preset === 'SAML 2.0' ? 'Requires an owner-confirmed or provisioned immutable subject association.' : provider.associations + ' explicit subject associations.'} ${pin?.pendingAt ? 'A changed registration cannot replace this pinned provider. Provider re-linking is unavailable.' : 'The first verified connection pins the issuer and endpoints.'}</p></section>`;
        }).join('');
        const body = '<h1>Single sign-on</h1><p>Only invited or active native accounts can sign in. Provider claims do not assign purchasing roles or native owner authority.</p>'
            + `<p>Provider sign-in is ${settings.idpSignIn ? 'enabled' : 'disabled'}. Disabling it ends existing provider sessions; native owner email sign-in remains available.</p>`
            + (providers.length ? form(settings.idpSignIn ? 'disable' : 'enable', settings.idpSignIn ? 'Disable provider sign-in' : 'Enable provider sign-in') : '<p>No provider is configured. Add the private deployment bindings below before enabling sign-in.</p>')
            + entries
            + '<h2>Configure the installation</h2><p>Register this installation as an OIDC web client with Auth, Google Workspace, Microsoft Entra ID or Okta. Copy its callback URL shown above into the provider. JumpCloud may use the Okta subject-association preset with its exact issuer.</p>'
            + '<p>Supply OIDC_PROVIDERS as a JSON array of public metadata: id, preset, clientId, label and issuer (Auth or Okta) or tenant (Microsoft). Optional tokenAuthMethod selects private_key_jwt, client_secret_basic or client_secret_post where the provider supports it. Auth requires private_key_jwt. Microsoft and Okta require explicit subjectEmails associations from the provider subject to an existing native account email.</p>'
            + '<p>Supply OIDC_CREDENTIALS privately as a JSON object keyed by provider id. Each entry contains either clientSecret or privateKey, never both. A privateKey is the private ES256 or RS256 JWK with kid; register only its public half with the provider. Keep credentials out of OIDC_PROVIDERS.</p>'
            + '<p>Supply an independent random OIDC_TRANSACTION_SECRET of at least 32 characters. Use private setup answers with rer setup, or the deployment secret environment; never put credentials in command arguments, purchasing records or archives. This page never reads credentials back.</p>'
            + '<h2>SAML 2.0</h2><p>Supply SAML_PROVIDERS as an array with id (beginning saml-), label, exact issuer, ssoUrl, PEM certificate and optional entityId. Register the metadata URL at /auth/saml/&lt;id&gt;/metadata with your IdP. HTTPS is required outside local development. The certificate, issuer, endpoint and entity ID pin on first use; changing the registration requires a future replacement capability. Disable sign-in before deployment changes.</p>'
            + '<p>This service-provider-initiated flow sends an unsigned redirect request and requires a signed RSA-SHA256 assertion with a persistent NameID, exact audience, recipient and request correlation. Encrypted assertions and unsolicited sign-in are unavailable. After the IdP returns, Continue sign-in confirms the requesting browser. Configure SCIM with the same issuer and external ID, or use the owner-confirmed member link. Assertion email and roles grant no authority. These installation bindings and browser correlations never enter portable archives.</p>'
            + '<p>Provider re-linking and unlinking are unavailable in this edition. Keep the issuer and client registration stable; disable provider sign-in before deployment changes. These controls configure sign-in only; they do not collect seat usage or provision purchasing grants.</p>'
            + '<p><a href="/auth/settings/identity">Native sign-in admission settings</a> · <a href="/app">Back to app</a></p>';
        const response = await render(body);
        const headers = new Headers(response.headers); headers.set('referrer-policy', 'strict-origin');
        return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
    } catch (error) {
        return Response.json({ error: error instanceof AuthError ? error.code : 'identity_unavailable' }, {
            status: error instanceof AuthError ? error.status : 503, headers: securityHeaders(),
        });
    }
}
