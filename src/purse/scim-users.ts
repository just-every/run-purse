import { transferScimApprovals } from './scim-approvals';
import { ScimFault } from './scim-input';
import { mappedScimMember } from './scim-mapping';
import { nativeFence, nativeOperators, scimReadFence, settleScim, type ScimAuthority } from './scim-storage';
import { all, audit, put, requireThat, uid, type Actor, type Data } from './types';

/** No native owner or preexisting email identity can be taken over by SCIM. */
export async function provisionScimUser(db: D1Database, auth: ScimAuthority, input: Data, previous?: Data): Promise<Data> {
    const operators = await nativeOperators(db);
    const link = await db.prepare('SELECT l.*,EXISTS(SELECT 1 FROM oa_external_identities i WHERE i.operator_id=l.operator_id AND i.issuer=l.issuer AND i.subject=l.external_id) AS activated FROM p_scim_links l WHERE l.issuer=? AND l.external_id=?').bind(auth.config.issuer, input.externalId).first<Data>();
    if (link) requireThat(!link.revoked_at && link.activated && link.email === input.userName, 'Owner-confirmed member link requires its matching provider sign-in', 409);
    const native = operators.find(o => o.id === (previous?.id ?? link?.operator_id));
    requireThat((!previous || native) && (!native || native.role !== 'owner'), 'SCIM cannot change native owners', 403);
    if (!previous) {
        if (all(auth.state, 'scimUser').some(u => u.issuer === auth.config.issuer && u.externalId === input.externalId)) throw new ScimFault(409, 'externalId already exists for this issuer', 'uniqueness');
        if (operators.some(o => o.email.toLowerCase() === input.userName && o.id !== native?.id)) throw new ScimFault(409, 'Native email already exists; SCIM never merges identities by email', 'uniqueness');
        requireThat(native && link || !auth.state.has('member:' + input.userName), 'Purchasing membership already exists; explicit native reconciliation is required', 409);
    }
    const id = previous?.id ?? native?.id ?? uid(), at = new Date().toISOString();
    const user: Data = { ...input, id, issuer: auth.config.issuer, createdAt: previous?.createdAt ?? at, updatedAt: at, version: (previous?.version ?? 0) + 1 };
    if (user.manager) requireThat(user.manager !== id && all(auth.state, 'scimUser').some(u => u.id === user.manager && u.issuer === user.issuer), 'manager.value must reference another provisioned User');
    // Refuse cycles even if a provider attempts to update the top of a chain.
    const seen = new Set([id]); let manager = user.manager;
    while (manager) { requireThat(!seen.has(manager), 'Manager relationship cannot contain a cycle'); seen.add(manager); manager = auth.state.get('scimUser:' + manager)?.value.manager; }
    const after = structuredClone(auth.state), member = mappedScimMember(after, auth.config, user), oldMember = auth.state.get('member:' + user.userName)?.value;
    const unchanged = previous && native!.status === (user.active ? 'active' : 'inactive') && native!.display_name === user.displayName && Object.entries(input).every(([key, value]) => JSON.stringify(previous[key]) === JSON.stringify(value)) && JSON.stringify({ ...oldMember, id: undefined }) === JSON.stringify(member);
    if (!unchanged) { put(after, 'scimUser', id, user); put(after, 'member', user.userName, member); }
    const service: Actor = { id: 'scim-service', email: '', version: auth.credential.generation, owner: false, dev: false, session: '' };
    const recipients = transferScimApprovals(auth.state, after, user, operators, auth.config, service);
    if (unchanged && recipients.length === 0) { await scimReadFence(db, auth); return previous; }
    if (unchanged) { put(after, 'scimUser', id, user); put(after, 'member', user.userName, member); }
    audit(after, service, previous ? user.active ? 'scim-user-update' : 'scim-user-deactivate' : 'scim-user-create', id, { issuer: user.issuer, externalId: user.externalId, before: previous ?? null, after: user, grantsBefore: oldMember?.grants ?? [], grantsAfter: member.grants, credentialGeneration: auth.credential.generation, consentBy: auth.config.consentBy, ...(link ? { linkedMember: true } : {}) });
    const nativeWrites: D1PreparedStatement[] = [];
    if (!native) nativeWrites.push(db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES(?,?,?,'member',?,1,?)").bind(id, user.userName, user.displayName, user.active ? 'active' : 'inactive', Date.now()));
    else nativeWrites.push(nativeFence(db, native!), db.prepare('UPDATE oa_operators SET display_name=?,status=? WHERE id=?').bind(user.displayName, user.active ? 'active' : 'inactive', id));
    if (!user.active) {
        nativeWrites.push(db.prepare('UPDATE oa_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE operator_id=?').bind(Date.now(), id), db.prepare('UPDATE oa_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE operator_id=? OR issuer_id=?').bind(Date.now(), id, id), db.prepare('UPDATE oa_step_up_challenges SET expires_at=0 WHERE operator_id=?').bind(id));
    }
    await settleScim(db, auth, after, nativeWrites, recipients); return user;
}
export function findScimUser(auth: ScimAuthority, id: string): Data {
    const user = auth.state.get('scimUser:' + id)?.value; requireThat(user && user.issuer === auth.config.issuer, 'SCIM User not found', 404); return user;
}
