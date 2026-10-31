import { X509Certificate } from 'node:crypto';
import { AuthError } from '../modules/operator-auth/index.mjs';

export interface SamlBindings { SAML_PROVIDERS?: string; AUTH_ORIGIN: string; AUTH_LOCAL?: string }
export interface SamlProvider { id: string; issuer: string; ssoUrl: string; entityId: string; certificate: string; label: string; callback: string }
export function samlError(code = 'saml_invalid_response', status = 400): never { throw new AuthError(code, status); }
export function samlProviders(env: SamlBindings): SamlProvider[] {
    if (!env.SAML_PROVIDERS?.trim()) return [];
    try {
        if (env.SAML_PROVIDERS.length > 65536) throw Error();
        const entries = JSON.parse(env.SAML_PROVIDERS), ids = new Set<string>();
        if (!Array.isArray(entries) || entries.length > 8) throw Error();
        const endpoint = (value: unknown) => {
            if (typeof value !== 'string') throw Error();
            const url = new URL(value);
            if (url.username || url.password || url.hash || url.search || url.href !== value
                || url.protocol !== 'https:' && !(env.AUTH_LOCAL === 'true' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw Error();
            return value;
        };
        return entries.map(entry => {
            if (!entry || typeof entry !== 'object' || Object.keys(entry).some(key => !['id', 'issuer', 'ssoUrl', 'entityId', 'certificate', 'label'].includes(key))
                || typeof entry.id !== 'string' || !/^saml-[a-z][a-z0-9-]{0,25}$/.test(entry.id) || ids.has(entry.id)
                || typeof entry.issuer !== 'string' || !entry.issuer || entry.issuer.length > 512 || /[\s<>]/.test(entry.issuer)
                || typeof entry.certificate !== 'string' || entry.certificate.length > 12000
                || !entry.certificate.startsWith('-----BEGIN CERTIFICATE-----')
                || typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 80) throw Error();
            ids.add(entry.id);
            const cert = new X509Certificate(entry.certificate);
            if (cert.publicKey.asymmetricKeyType !== 'rsa' || (cert.publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw Error();
            const callback = env.AUTH_ORIGIN + '/auth/saml/' + entry.id + '/callback';
            const entityId = entry.entityId ?? env.AUTH_ORIGIN + '/auth/saml/' + entry.id + '/metadata';
            if (typeof entityId !== 'string' || !entityId || entityId.length > 512 || /[\s<>]/.test(entityId)) throw Error();
            return { id: entry.id, issuer: entry.issuer, ssoUrl: endpoint(entry.ssoUrl), entityId, certificate: cert.toString(), label: entry.label, callback };
        });
    } catch { return samlError('saml_invalid_configuration', 503); }
}
export function samlFingerprint(provider: SamlProvider) {
    return new X509Certificate(provider.certificate).fingerprint256;
}
