import { AuthError } from '../modules/operator-auth/index.mjs';

export interface SamlBindings { SAML_PROVIDERS?: string }
export interface SamlProvider { id: string; issuer: string; entryPoint: string; entityId: string; idpCert: string; label: string; subjectEmails: Record<string, string> }
const fields = new Set(['id', 'issuer', 'entryPoint', 'entityId', 'idpCert', 'label', 'subjectEmails']);
function invalid(): never { throw new AuthError('saml_invalid_configuration', 503); }
/** Deployment metadata pins the issuer, signing certificate and explicit member associations. */
export function samlProviders(env: SamlBindings): SamlProvider[] {
    if (!env.SAML_PROVIDERS?.trim()) return [];
    if (env.SAML_PROVIDERS.length > 65536) invalid();
    let values: unknown;
    try { values = JSON.parse(env.SAML_PROVIDERS); } catch { invalid(); }
    if (!Array.isArray(values) || values.length > 8) invalid();
    const ids = new Set<string>();
    return values.map(value => {
        if (!value || typeof value !== 'object' || Object.keys(value).some(key => !fields.has(key))
            || typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,25}$/.test(value.id) || ids.has(value.id)
            || typeof value.issuer !== 'string' || !value.issuer || value.issuer.length > 512
            || typeof value.entityId !== 'string' || !value.entityId || value.entityId.length > 512
            || typeof value.label !== 'string' || !value.label || value.label.length > 100
            || typeof value.idpCert !== 'string' || value.idpCert.length > 16384 || !value.idpCert.startsWith('-----BEGIN CERTIFICATE-----')
            || !value.subjectEmails || typeof value.subjectEmails !== 'object' || Array.isArray(value.subjectEmails)) invalid();
        let entry: URL;
        try { entry = new URL(value.entryPoint); } catch { invalid(); }
        if (entry.protocol !== 'https:' || entry.username || entry.password || entry.hash || entry.search) invalid();
        for (const [subject, email] of Object.entries(value.subjectEmails))
            if (!subject || subject.length > 255 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(email)) invalid();
        ids.add(value.id);
        return value as SamlProvider;
    });
}
export const samlPath = (provider: SamlProvider, action: string) => '/auth/saml/' + provider.id + '/' + action;
