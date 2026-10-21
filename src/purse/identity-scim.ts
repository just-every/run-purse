import { AuthError, type OperatorAuth } from '../modules/operator-auth/index.mjs';

/** SCIM-created native accounts use the provider's immutable identity. A second
 * subject carrying the same email must never establish an alias or a session.
 * The public admission seam still delegates protocol, pin, generation and
 * account-version settlement to Base's unchanged atomic adapter.
 */
export function scimIdentityAdmission(auth: OperatorAuth, db: D1Database): OperatorAuth {
    const admit = auth.admission.admit.bind(auth.admission);
    auth.admission.admit = async (request, principal, input) => {
        const binding = await db.prepare('SELECT operator_id FROM oa_external_identities WHERE issuer=? AND subject=?')
            .bind(principal.issuer, principal.subject).first<{operator_id: string}>();
        const email = principal.associatedEmail ?? principal.email;
        const source = binding
            ? await db.prepare("SELECT value FROM p_records WHERE business='main' AND kind='scimUser' AND id=?").bind(binding.operator_id).first<{value: string}>()
            : typeof email === 'string'
                ? await db.prepare("SELECT value FROM p_records WHERE business='main' AND kind='scimUser' AND json_extract(value,'$.userName')=?")
                    .bind(email.trim().toLowerCase()).first<{value: string}>()
                : null;
        if (source) {
            const user = JSON.parse(source.value);
            if (user.issuer !== principal.issuer || user.externalId !== principal.subject)
                throw new AuthError('scim_identity_mismatch', 403);
        }
        return admit(request, principal, input);
    };
    return auth;
}
