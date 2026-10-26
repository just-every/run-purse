import type { OperatorAuth } from '../modules/operator-auth/index.mjs';
import { samlPath, samlProviders, type SamlBindings } from './saml-config';

/** Add SAML forms through the existing sign-in page's provider presentation seam. */
export function samlIdentityProviders(auth: OperatorAuth, env: SamlBindings & { DB: D1Database }): OperatorAuth {
    const configured = samlProviders(env);
    if (!configured.length || !auth.providers) return auth;
    const providers = auth.providers;
    return { ...auth, providers: { ...providers, async list() {
        const existing = await providers.list();
        if (!await auth.admission.accounts.identityEnabled?.()) return existing;
        const pins = (await env.DB.prepare("SELECT provider_id,status FROM oa_identity_providers WHERE preset='saml'").all<{provider_id: string; status: string}>()).results;
        return [...existing, ...configured.filter(provider => !pins.some(pin => pin.provider_id === 'saml-' + provider.id && pin.status !== 'linked')).map(provider => ({
            id: 'saml-' + provider.id, label: provider.label, preset: 'okta' as const, startPath: samlPath(provider, 'start'), visible: true,
            linked: pins.some(pin => pin.provider_id === 'saml-' + provider.id), pendingRelink: false, authorizationOrigins: [],
        }))];
    } } };
}
