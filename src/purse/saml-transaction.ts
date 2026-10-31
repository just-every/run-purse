import { samlError, type SamlProvider } from './saml-config';

export function opaqueToken() { return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'); }
export async function hashToken(secret: string, purpose: string, value: string) {
    const encoder = new TextEncoder(), key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
    return Buffer.from(await crypto.subtle.sign('HMAC', key, encoder.encode(purpose + '\0' + value))).toString('hex');
}
export interface SamlTransaction { relay_hash: string; request_id: string; provider_id: string; binding_hash: string; generation: number; fingerprint: string; expires_at: number; consumed_at: number | null }
export const escapeSaml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
export async function samlPin(db: D1Database, provider: SamlProvider) {
    const { label: _, ...metadata } = provider;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(metadata)));
    const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    const now = Date.now();
    await db.batch([
        db.prepare('INSERT INTO p_saml_pins(provider_id,fingerprint,linked_at) VALUES(?,?,?) ON CONFLICT DO NOTHING').bind(provider.id, fingerprint, now),
        db.prepare(`INSERT INTO oa_identity_providers(provider_id,preset,status,issuer,client_id,jwks_uri,authorization_endpoint,token_endpoint,algorithms,token_auth_method,response_iss,linked_at)
          SELECT ?,'saml','linked',?,?,?,?,?,'["RS256"]','saml',0,linked_at FROM p_saml_pins WHERE provider_id=? AND fingerprint=? ON CONFLICT DO NOTHING`)
            .bind(provider.id, provider.issuer, provider.entityId, 'urn:purse:saml:' + fingerprint, provider.ssoUrl, provider.callback, provider.id, fingerprint),
    ]);
    const row = await db.prepare(`SELECT p.fingerprint,p.linked_at FROM p_saml_pins p JOIN oa_identity_providers o ON o.provider_id=p.provider_id
      WHERE p.provider_id=? AND p.fingerprint=? AND o.status='linked' AND o.issuer=? AND o.client_id=? AND o.jwks_uri=? AND o.linked_at=p.linked_at`)
        .bind(provider.id, fingerprint, provider.issuer, provider.entityId, 'urn:purse:saml:' + fingerprint).first<{ fingerprint: string; linked_at: number }>();
    if (!row) samlError('saml_registration_changed', 409);
    return row;
}

/** Base's account adapter still performs association and session issuance.
 * Its entire write batch is fenced with the browser-bound correlation, current
 * immutable association, expiry and generation; consuming it is atomic with
 * the native account and session changes, including invitation acceptance. */
export function samlAdmissionDatabase(db: D1Database, transaction: SamlTransaction, bindingHash: string,
    identity: { operatorId: string; version: number; subject: string; issuer: string }, expiresAt: number) {
    let used = false;
    return new Proxy(db, {
        get(target, property) {
            if (property === 'batch') return async (statements: D1PreparedStatement[]) => {
                if (used) samlError('saml_replay', 403);
                used = true;
                const now = Date.now();
                const guard = db.prepare(`INSERT INTO p_guard SELECT CASE WHEN EXISTS(
                  SELECT 1 FROM p_saml_transactions t JOIN p_saml_pins p ON p.provider_id=t.provider_id
                  JOIN oa_auth_settings s ON s.singleton=1 AND s.idp_sign_in=1 AND s.generation=t.generation
                  JOIN oa_operators o ON o.id=? AND o.version=? AND o.status IN ('active','invited')
                  WHERE t.relay_hash=? AND t.request_id=? AND t.binding_hash=? AND t.fingerprint=p.fingerprint
                  AND t.fingerprint=? AND t.consumed_at IS NULL AND t.expires_at>? AND ?>?
                  AND (EXISTS(SELECT 1 FROM p_scim_links l WHERE l.operator_id=o.id AND l.issuer=? AND l.external_id=? AND l.revoked_at IS NULL)
                    OR EXISTS(SELECT 1 FROM oa_external_identities e WHERE e.operator_id=o.id AND e.issuer=? AND e.subject=?)
                    OR EXISTS(SELECT 1 FROM p_records r WHERE r.business='main' AND r.kind='scimUser' AND r.id=o.id
                      AND json_extract(r.value,'$.issuer')=? AND json_extract(r.value,'$.externalId')=?))) THEN 1 ELSE 0 END`)
                    .bind(identity.operatorId, identity.version, transaction.relay_hash, transaction.request_id, bindingHash, transaction.fingerprint, now, expiresAt, now,
                        identity.issuer, identity.subject, identity.issuer, identity.subject, identity.issuer, identity.subject);
                const results = await db.batch([guard, ...statements,
                    db.prepare('UPDATE p_saml_transactions SET consumed_at=? WHERE relay_hash=?').bind(now, transaction.relay_hash),
                    db.prepare('DELETE FROM p_guard'),
                ]);
                return results.slice(1, 1 + statements.length);
            };
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}
