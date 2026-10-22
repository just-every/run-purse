import { currentScimAssignment } from './scim-approvals';
import { nativeActor, nativeFence } from './scim-storage';
import { all, allowed, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

/** Consent changes native version so a concurrent provider admission cannot settle. */
export async function manageScimLink(db: D1Database, before: State, after: State, a: Actor, b: Data, operators: Data[]): Promise<D1PreparedStatement[]> {
    const native = operators.find(o => o.id === b.operator);
    requireThat(native && native.role !== 'owner' && native.status === 'active', 'Choose an active native member', 409);
    const config = before.get('scimConfig:main')?.value;
    requireThat(config, 'Configure the issuer before linking members', 409);
    const previous = await db.prepare('SELECT * FROM p_scim_links WHERE operator_id=?').bind(native.id).first<Data>();
    const at = new Date().toISOString(), writes = [nativeFence(db, native)];
    if (b.action === 'link-member') {
        requireThat(b.consent === true, 'Explicit owner consent to this exact issuer and external ID is required');
        const externalId = text(b.externalId, 'External identity', 255);
        requireThat(!previous || previous.revoked_at, 'Unlink the current identity before changing it', 409);
        const conflicting = await db.prepare('SELECT 1 FROM oa_external_identities WHERE operator_id=? OR (issuer=? AND subject=?)').bind(native.id, config.issuer, externalId).first();
        requireThat(!conflicting, 'Unlink existing provider identity before creating this link', 409);
        requireThat(!all(before, 'scimUser').some(u => u.id === native.id || u.issuer === config.issuer && u.externalId === externalId), 'Provisioned identity must retain its issuer and external ID', 409);
        writes.push(db.prepare('INSERT INTO p_scim_links(operator_id,issuer,external_id,email,operator_version,approved_at,revoked_at) VALUES(?,?,?,?,?,?,NULL) ON CONFLICT(operator_id) DO UPDATE SET issuer=excluded.issuer,external_id=excluded.external_id,email=excluded.email,operator_version=excluded.operator_version,approved_at=excluded.approved_at,revoked_at=NULL').bind(native.id, config.issuer, externalId, native.email, native.version + 1, at));
        audit(after, a, 'scim-member-link', native.id, { issuer: config.issuer, externalId, memberEmail: native.email, state: 'pending-sign-in' });
    } else {
        requireThat(previous && !previous.revoked_at, 'Active member link not found', 404);
        writes.push(db.prepare('UPDATE p_scim_links SET revoked_at=? WHERE operator_id=?').bind(at, native.id));
        writes.push(db.prepare('DELETE FROM oa_external_identities WHERE operator_id=? AND issuer=? AND subject=?').bind(native.id, previous.issuer, previous.external_id));
        audit(after, a, 'scim-member-unlink', native.id, { issuer: previous.issuer, externalId: previous.external_id, memberEmail: native.email });
    }
    writes.push(db.prepare('UPDATE oa_operators SET version=version+1 WHERE id=?').bind(native.id), db.prepare('UPDATE oa_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE operator_id=?').bind(Date.now(), native.id), db.prepare('UPDATE oa_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE operator_id=? OR issuer_id=?').bind(Date.now(), native.id, native.id));
    return writes;
}

export function reassignScimApproval(state: State, a: Actor, b: Data, operators: Data[]): Data {
    const request = get(state, 'request', b.request), prior = currentScimAssignment(state, request);
    requireThat(request.status === 'pending' && prior?.held, 'This request is not awaiting reassignment', 409);
    const recipient = operators.find(o => o.id === b.operator);
    requireThat(recipient && recipient.status === 'active' && recipient.id !== request.requester && recipient.email !== request.requesterEmail && allowed(state, nativeActor(recipient), 'request.approve', request), 'Choose a current scoped non-self approver', 409);
    const id = uid(), transfer = { ...(prior.chainStep?{chainStep:prior.chainStep}:{}), request: request.id, requestRevision: request.revision, policy: request.policy, policyVersion: prior.policyVersion, from: prior.to, to: recipient.email, operator: recipient.id, operatorVersion: recipient.version, sequence: prior.sequence + 1, source: prior.source, at: new Date().toISOString(), reassignedBy: a.id };
    put(state, 'scimApprovalTransfer', id, transfer);
    audit(state, a, 'scim-approval-transfer', request.id, { transfer: id, ...transfer });
    return recipient;
}
