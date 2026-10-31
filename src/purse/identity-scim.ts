import { AuthError, type OperatorAuth } from '../modules/operator-auth/index.mjs';

/** OIDC and SAML use the SCIM-created account's immutable provider identity. A second
 * subject carrying the same email must never establish an alias or a session.
 * The public admission seam still delegates protocol, pin, generation and
 * account-version settlement to Base's unchanged atomic adapter.
 */
export function scimIdentityAdmission(auth: OperatorAuth, db: D1Database): OperatorAuth {
    const admit = auth.admission.admit.bind(auth.admission);
    const accounts = auth.admission.accounts;
    const bindAndIssue = accounts.bindAndIssueSession?.bind(accounts);
    let expected: {id: string; version: number} | undefined;
    if (bindAndIssue) accounts.bindAndIssueSession = async input => {
        const person = input.person as typeof input.person & {version: number};
        if (expected && (person.id !== expected.id || person.version !== expected.version)) throw new AuthError('scim_link_changed', 403);
        return bindAndIssue(input);
    };
    auth.admission.admit = async (request, principal, input) => {
        const consent = await db.prepare('SELECT l.*,o.version AS current_version FROM p_scim_links l JOIN oa_operators o ON o.id=l.operator_id WHERE (l.issuer=? AND l.external_id=?) OR l.email=?').bind(principal.issuer, principal.subject, principal.associatedEmail ?? principal.email ?? '').all<Record<string, any>>();
        if (consent.results.length) {
            const link = consent.results.find(row => row.issuer === principal.issuer && row.external_id === principal.subject);
            if (!link || link.revoked_at || consent.results.some(row => row.operator_id !== link.operator_id)) throw new AuthError('scim_identity_mismatch', 403);
            expected = {id: link.operator_id, version: link.current_version};
            principal = {...principal, associatedEmail: link.email};
        }
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
