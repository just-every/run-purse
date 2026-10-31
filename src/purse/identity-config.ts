import { AuthError, type AuthConfig, type IdentityProviderConfig } from '../modules/operator-auth/index.mjs';

/** Deployment bindings only. Credentials never enter purchasing records or a public projection. */
export interface IdentityBindings {
    SAML_PROVIDERS?: string;
    OIDC_PROVIDERS?: string;
    OIDC_CREDENTIALS?: string;
    OIDC_TRANSACTION_SECRET?: string;
}
const publicFields = new Set(['id', 'preset', 'issuer', 'tenant', 'clientId', 'label', 'tokenAuthMethod', 'subjectEmails', 'additionalAudiences', 'endpointOrigins', 'minimumVersion']);
const presets = new Set(['auth', 'google', 'microsoft', 'okta']);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function configurationError(): never { throw new AuthError('oidc_invalid_configuration', 503); }
function parse(value: string) {
    if (value.length > 65536) configurationError();
    try { return JSON.parse(value) as unknown; } catch { return configurationError(); }
}

/** Compose Base's unchanged OIDC adapter from public metadata and a separate secret binding. */
export function identityProviderConfiguration(env: IdentityBindings): Pick<AuthConfig, 'providers' | 'OIDC_TRANSACTION_SECRET'> {
    if (!env.OIDC_PROVIDERS?.trim()) return { providers: [] };
    const metadata = parse(env.OIDC_PROVIDERS);
    if (!Array.isArray(metadata) || metadata.length > 8) configurationError();
    if (!metadata.length) return { providers: [] };
    const credentials = env.OIDC_CREDENTIALS ? parse(env.OIDC_CREDENTIALS) : null;
    if (!object(credentials)) configurationError();
    const ids = new Set<string>();
    const providers = metadata.map(value => {
        if (!object(value) || Object.keys(value).some(key => !publicFields.has(key))
            || typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(value.id)
            || value.id.startsWith('saml-')
            || ids.has(value.id) || typeof value.preset !== 'string' || !presets.has(value.preset)) configurationError();
        ids.add(value.id);
        const secret = credentials[value.id];
        if (!object(secret) || Object.keys(secret).some(key => !['clientSecret', 'privateKey'].includes(key))
            || Number(Object.hasOwn(secret, 'clientSecret')) + Number(Object.hasOwn(secret, 'privateKey')) !== 1) configurationError();
        return { ...value, ...secret } as unknown as IdentityProviderConfig;
    });
    return { providers, OIDC_TRANSACTION_SECRET: env.OIDC_TRANSACTION_SECRET };
}

/** Explicit public fields only; never stringify a configured provider or credential object. */
export function identityProviderSummaries(env: IdentityBindings, origin: string) {
    return (identityProviderConfiguration(env).providers ?? []).map(provider => ({
        id: provider.id, preset: provider.preset, label: provider.label ?? provider.preset,
        issuer: provider.preset === 'google' ? 'https://accounts.google.com'
            : provider.preset === 'microsoft' ? `https://login.microsoftonline.com/${provider.tenant}/v2.0` : provider.issuer,
        clientId: provider.clientId, callback: origin + '/auth/oidc/' + provider.id + '/callback',
        credential: provider.privateKey ? 'Private signing key configured' : 'Client secret configured',
        associations: Object.keys(provider.subjectEmails ?? {}).length,
    }));
}
