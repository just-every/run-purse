import { roleLabels, scopeSummary } from './access-ui';
import { type D } from './shared';

const grants = (rows: D[]) => rows.length ? rows.map((grant, index) => <p key={index}>{roleLabels[grant.role] ?? grant.role} · {scopeSummary(grant.scope)}</p>) : <p>No purchasing grants</p>;

/** Only the already scope-filtered recorded event supplies these facts. */
export function ScimAudit({ event }: { event: D }) {
    if (event.action === 'scim-approval-transfer') return <section aria-label="SCIM approval handoff">
        <h4>Approval handoff</h4><p>From: {event.from}</p><p>To: {event.to}</p>
        {event.held && <p>Needs reassignment · held without decision authority</p>}<p>Request revision: {event.requestRevision} · Transfer sequence: {event.sequence}</p>
        <p>SCIM provisioning changed the previous holder's approval authority. Recipient eligibility was checked against this exact request revision and current purchasing permissions at the handoff.</p>
    </section>;
    if (!['scim-user-create', 'scim-user-update', 'scim-user-deactivate'].includes(event.action)) return null;
    return <section aria-label="SCIM membership change"><h4>Provisioned membership</h4>
        <p>{event.after.displayName} · {event.after.userName}</p>
        <p>Status: {event.before ? event.before.active ? 'Active' : 'Inactive' : 'Not provisioned'} → {event.after.active ? 'Active' : 'Inactive'}</p>
        <p>Department: {event.before?.department || 'Unmapped'} → {event.after.department || 'Unmapped'}</p>
        <p>Manager identity: <span style={{ overflowWrap: 'anywhere' }}>{event.before?.manager || 'Not set'} → {event.after.manager || 'Not set'}</span></p>
        <h5>Previous grants</h5>{grants(event.grantsBefore)}<h5>Provisioned grants</h5>{grants(event.grantsAfter)}
        <p>Provider: <span style={{ overflowWrap: 'anywhere' }}>{event.issuer}</span></p>
    </section>;
}
