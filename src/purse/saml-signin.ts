import { AuthError, type IdentityProviders, type OperatorAuth, type ProviderLink } from '../modules/operator-auth/index.mjs';
import { samlPath, samlProviders, type SamlBindings } from './saml-config';
import { samlResponse } from './saml';

/** Add SAML forms through the existing sign-in page's provider presentation seam. */
export function samlIdentityProviders(auth: OperatorAuth, env: SamlBindings & { DB: D1Database; AUTH_ORIGIN: string; AUTH_LOCAL?: string }): OperatorAuth {
    const configured = samlProviders(env);
    if (!configured.length) return auth;
    const original = auth.providers, samlIds = configured.map(provider => 'saml-' + provider.id);
    const protocol = async (request: Request, id: string, action: string) => {
        const provider = configured.find(provider => 'saml-' + provider.id === id);
        if (!provider || new URL(request.url).pathname !== samlPath(provider, action)) throw new AuthError('saml_not_found', 404);
        return (await samlResponse(request, env, auth))!;
    };
    const providers: IdentityProviders = {
        ids: [...(original?.ids ?? []), ...samlIds],
        callbackPaths: { ...original?.callbackPaths, ...Object.fromEntries(configured.map(provider => [samlPath(provider, 'callback'), 'saml-' + provider.id])) },
        begin: (request, id, input) => samlIds.includes(id) ? protocol(request, id, 'start') : original ? original.begin(request, id, input) : Promise.reject(new AuthError('saml_not_found', 404)),
        callback: (request, id) => samlIds.includes(id) ? protocol(request, id, 'callback') : original ? original.callback(request, id) : Promise.reject(new AuthError('saml_not_found', 404)),
        async list() {
            const existing = original ? await original.list() : [];
            if (!await auth.admission.accounts.identityEnabled?.()) return existing;
            const pins = (await env.DB.prepare("SELECT provider_id,status FROM oa_identity_providers WHERE preset='saml'").all<{provider_id: string; status: string}>()).results;
            return [...existing, ...configured.filter(provider => !pins.some(pin => pin.provider_id === 'saml-' + provider.id && pin.status !== 'linked')).map(provider => ({
                id: 'saml-' + provider.id, label: provider.label, preset: 'okta' as const, startPath: samlPath(provider, 'start'), visible: true,
                linked: pins.some(pin => pin.provider_id === 'saml-' + provider.id), pendingRelink: false, authorizationOrigins: [],
            }))];
        },
        async links() {
            const rows = (await env.DB.prepare(`SELECT provider_id AS id,preset,status,issuer,client_id AS clientId,jwks_uri AS jwks,authorization_endpoint AS authorization,
                token_endpoint AS token,algorithms,token_auth_method AS tokenAuthMethod,response_iss AS responseIssuer,interface_version AS interfaceVersion,linked_at AS linkedAt,
                pending_issuer AS pendingIssuer,pending_client_id AS pendingClientId,pending_preset AS pendingPreset,pending_at AS pendingAt FROM oa_identity_providers WHERE preset='saml'`).all<Record<string, unknown>>()).results;
            const links = [...(original ? await original.links() : []), ...rows.map(row => ({ ...row, algorithms: JSON.parse(row.algorithms as string), responseIssuer: row.responseIssuer === 1 } as ProviderLink))];
            return [...new Map(links.map(link => [link.id, link])).values()];
        },
        async relink(id) { if (samlIds.includes(id) || !original) throw new AuthError('provider_management_unavailable', 403); return original.relink(id); },
        async unlink(id) { if (samlIds.includes(id) || !original) throw new AuthError('provider_management_unavailable', 403); return original.unlink(id); },
    };
    return { ...auth, providers };
}
