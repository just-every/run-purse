import { all, get, requireThat, type Data, type State } from './types';
import { policies } from './requests';
/** Issuance is a fresh check against current business policy and capability. */
export function currentDecision(s: State, r: Data) { const policy = policies(s, r).find(p => p.id === r.policy); requireThat(policy, 'Approval policy changed', 409); const decision = all(s, 'decision').find(d => d.request === r.id && d.revision === r.revision && d.decision === 'approved'); requireThat(decision, 'Approval decision missing', 409); requireThat(decision.policyVersion === s.get('policy:' + policy.id)?.revision, 'Approval policy changed; renew authority', 409); if (!decision.owner) {
    requireThat(all(s, 'member').some(m => m.email === decision.email && m.active && m.roles.includes('approver')), 'Approver capability revoked', 409);
} if (decision.delegation) {
    const d = get(s, 'delegation', decision.delegation);
    requireThat(d.active && d.from === policy.approver && d.delegate === decision.email && Date.parse(d.expires) > Date.now(), 'Delegation expired or revoked; renew authority', 409);
}
else
    requireThat(decision.email === policy.approver, 'Designated approver changed; renew authority', 409); return decision; }
