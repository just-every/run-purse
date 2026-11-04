import { createHash } from 'node:crypto';
import { actorStep } from './approval-chain';
import { stepAuthority } from './approval-chain-authority';
import { notificationView } from './notifications';
import { notificationId } from './notification-preferences';
import { authorizedApproval } from './requests';
import { all, requireThat, type Actor, type Data, type State } from './types';

/** A locator for a native confirmation screen, never a bearer purchasing grant. */
export function approvalEmailBinding(s: State, a: Actor, n: Data): Data | undefined {
    if (n.type !== 'approval-needed' || n.recipient !== a.id || n.erasure) return;
    const r = s.get('request:' + n.record)?.value;
    if (!r || r.imported || r.adoption || r.integration || r.emailIntake || r.amends || r.erasure || r.purchaseType === 'travel'
        || r.poDetails?.blanket || r.poDetails?.recurring || r.budgetDisposition
        || all(s, 'order').some(order => order.request === r.id)
        || r.approvalRoute?.some((step: Data) => step.emails || step.parallelGroup)) return;
    const view = notificationView(s, a, n);
    if (!view.canRead || !view.actionable) return;
    const step = actorStep(s, a, r);
    let proof: Data;
    try {
        proof = step ? stepAuthority(s, a, r, step)! : authorizedApproval(s, a, r);
    } catch { return; }
    const member = all(s, 'member').find(m => m.email?.toLowerCase() === a.email.toLowerCase());
    const policy = s.get('policy:' + r.policy);
    const assignment = proof.scimTransfer ?? proof.assignment?.id;
    const delegation = proof.delegation ?? proof.delegated?.id;
    // Row versions fence changed-then-restored assignments, scopes and policies as well.
    const fingerprint = createHash('sha256').update(JSON.stringify([
        n.id, n.sourceKind, n.source, n.recipient, a.version, n.sourceRevision, n.approvalAttempt, n.step,
        s.get('request:' + r.id)?.revision, policy?.revision,
        member && s.get('member:' + member.id)?.revision,
        step?.id ?? 'primary', assignment && s.get('scimApprovalTransfer:' + assignment)?.revision,
        delegation && s.get('delegation:' + delegation)?.revision,
        all(s,'delegation').filter(d => d.policy === r.policy && d.from === (step?.email ?? policy?.value.approver))
            .map(d => [d.id,s.get('delegation:' + d.id)?.revision]).sort()
    ])).digest('hex');
    return { fingerprint, recipientVersion: a.version };
}

export function approvalEmailSource(s: State, a: Actor, id: string, source: string) {
    const n = s.get('notification:' + id)?.value;
    const delivery = s.get('notificationDelivery:' + notificationId(['delivery', id]))?.value;
    requireThat(n && n.recipient === a.id && delivery?.recipient === a.id && !delivery.erasure
        && delivery.channel === 'email' && ['accepted', 'uncertain'].includes(delivery.status)
        && delivery.approvalEmail?.fingerprint === source
        && delivery.approvalEmail.recipientVersion === a.version, 'Email approval unavailable for this signed-in recipient', 403);
    const binding = approvalEmailBinding(s, a, n);
    requireThat(binding?.fingerprint === source, 'Email approval source or authority changed; open your current request', 409);
    const request = s.get('request:' + n.record)!.value;
    return { n, request };
}

export function approvalEmailView(s: State, a: Actor, id: string, source: string) {
    const { n, request } = approvalEmailSource(s, a, id, source);
    return { title: request.title, revision: request.revision, totalMinor: request.totalMinor, currency: request.currency,
        step: n.step, url: '/app?request=' + encodeURIComponent(request.id) };
}

export function approvalEmailDecision(s: State, a: Actor, id: string, source: string, input: Data) {
    const { n, request } = approvalEmailSource(s, a, id, source);
    requireThat(input.confirm === true, 'Explicit confirmation required');
    // Only the three existing native decision verbs enter the ordinary command.
    requireThat(['approved', 'rejected', 'returned'].includes(input.decision), 'Choose approve, reject or return');
    return { id: request.id, revision: n.sourceRevision, approvalAttempt: n.approvalAttempt,
        chainStep: n.step, decision: input.decision, reason: input.reason };
}
