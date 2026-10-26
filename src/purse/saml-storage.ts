import { AuthError } from '../modules/operator-auth/index.mjs';
import type { SamlProvider } from './saml-config';

export async function samlHash(value: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Reuse Base's installation-only provider pins and session fences without changing Base. */
export async function samlPin(db: D1Database, provider: SamlProvider, callback: string) {
    const id = 'saml-' + provider.id;
    const fingerprint = await samlHash(JSON.stringify({ ...provider, callback }));
    await db.prepare(`INSERT INTO oa_identity_providers(provider_id,preset,status,issuer,client_id,jwks_uri,authorization_endpoint,token_endpoint,algorithms,token_auth_method,response_iss,interface_version,linked_at)
        VALUES(?,'saml','linked',?,?,?,?,?,'["RS256"]','saml',0,?,?) ON CONFLICT(provider_id) DO NOTHING`)
        .bind(id, provider.issuer, provider.entityId, callback, provider.entryPoint, callback, fingerprint, Date.now()).run();
    const pin = await db.prepare('SELECT status,issuer,client_id,interface_version,linked_at FROM oa_identity_providers WHERE provider_id=?').bind(id)
        .first<{ status: string; issuer: string; client_id: string; interface_version: string; linked_at: number }>();
    if (!pin || pin.status !== 'linked' || pin.interface_version !== fingerprint) throw new AuthError('saml_registration_changed', 409);
    return { id, issuer: pin.issuer, clientId: pin.client_id, linkedAt: pin.linked_at, fingerprint };
}
export type SamlTransaction = { requestId: string; instant: string; generation: number; provider: string; expires: number };
/** A browser-bound transaction is deleted atomically before protocol validation. */
export async function samlTransaction(db: D1Database, relay: string, browser: string, fingerprint: string, value?: SamlTransaction) {
    const state = 'saml:' + await samlHash(relay), binding = await samlHash(browser);
    if (value) {
        await db.prepare('DELETE FROM oa_oidc_transactions WHERE expires_at<=?').bind(Date.now()).run();
        await db.prepare('INSERT INTO oa_oidc_transactions(state_hash,binding_hash,config_hash,payload,expires_at) VALUES(?,?,?,?,?)')
            .bind(state, binding, fingerprint, JSON.stringify(value), value.expires).run();
        return value;
    }
    const row = await db.prepare('DELETE FROM oa_oidc_transactions WHERE state_hash=? AND binding_hash=? AND config_hash=? AND expires_at>? RETURNING payload')
        .bind(state, binding, fingerprint, Date.now()).first<{ payload: string }>();
    if (!row) throw new AuthError('saml_invalid_correlation', 400);
    return JSON.parse(row.payload) as SamlTransaction;
}
