import { AuthError, type OperatorAuth } from '../modules/operator-auth/index.mjs';
import { currentIdentitySession } from './identity-authority';

/** Use the same native admission switch and audit for SAML-only installations.
 * Base's OIDC readiness check knows only its own protocol registrations. */
export function samlControls(auth: OperatorAuth, db: D1Database, origin: string): OperatorAuth {
    return { ...auth, async setIdentitySettings(request, { idpSignIn }) {
        if (request.method !== 'POST' || new URL(request.url).origin !== origin || request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new AuthError('invalid_origin', 403);
        if (typeof idpSignIn !== 'boolean') throw new AuthError('invalid_input', 400);
        const session = await auth.getSession(request), owner = await auth.admission.accounts.owner();
        if (!session) throw new AuthError('unauthenticated', 401);
        if (!owner || session.operator.id !== owner.id) throw new AuthError('owner_required', 403);
        const now = Date.now(), audit = crypto.randomUUID();
        try {
            await db.batch([
                db.prepare(`INSERT INTO p_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM oa_sessions se JOIN oa_operators o ON o.id=se.operator_id
                  WHERE se.id=? AND o.id=? AND o.version=? AND se.operator_version=o.version AND o.status='active' AND o.role='owner'
                  AND se.revoked_at IS NULL AND se.expires_at>? AND ${currentIdentitySession}
                  AND o.id=(SELECT candidate.id FROM oa_operators candidate LEFT JOIN oa_bootstrap b ON b.claim_id=candidate.id
                    WHERE candidate.role='owner' AND candidate.status='active' ORDER BY b.claim_id IS NULL,candidate.created_at,candidate.id LIMIT 1)) THEN 1 ELSE 0 END`)
                    .bind(session.id, owner.id, session.operator.version, now),
                db.prepare(`INSERT INTO oa_auth_settings(singleton,idp_sign_in,generation,first_setup) VALUES(1,?,1,0)
                  ON CONFLICT(singleton) DO UPDATE SET idp_sign_in=excluded.idp_sign_in,generation=oa_auth_settings.generation+1,first_setup=0
                  WHERE oa_auth_settings.idp_sign_in!=excluded.idp_sign_in`).bind(Number(idpSignIn)),
                db.prepare("INSERT INTO oa_auth_audit(id,actor_id,action,value,created_at) SELECT ?,?,'idpSignIn',?,? WHERE changes()=1").bind(audit, owner.id, String(idpSignIn), now),
                db.prepare("UPDATE oa_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE kind='oidc' AND EXISTS(SELECT 1 FROM oa_auth_audit WHERE id=? AND value='false')").bind(now, audit),
                db.prepare('DELETE FROM p_guard'),
            ]);
        } catch { throw new AuthError('authority_changed', 409); }
        return { idpSignIn };
    } };
}
