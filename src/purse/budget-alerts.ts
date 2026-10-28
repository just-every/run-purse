import { sha256, canonicalJson } from '../modules/import-kit/src/d1/index';
import { periodBudgetPosition } from './budget-position';
import { all, allowed, audit, put, type Actor, type Data, type State } from './types';

export function assignedBudgetVisible(s: State, a: Actor, policy: Data) {
    const assignment = s.get('budgetAssignment:' + policy.id)?.value;
    return assignment?.ownerEmail === a.email && s.get('member:' + a.email)?.value.active === true && allowed(s,a,'report.read',policy);
}
/** Native notifications are keyed to a dated budget and threshold. A repeated
 * evaluation or an unchanged import cannot deliver a second crossing. */
export function evaluateBudgetAlerts(s: State, a: Actor) {
    for (const assignment of all(s,'budgetAssignment')) {
        const policy = s.get('policy:' + assignment.policy)?.value;
        if (!policy?.active || !policy.budgetPeriod || !s.get('member:' + assignment.ownerEmail)?.value.active) continue;
        const position = periodBudgetPosition(s,policy), usedMinor = position.reservedMinor + position.committedMinor + position.actualMinor;
        if (policy.budgetMinor <= 0) continue;
        for (const percent of assignment.thresholds) {
            if (BigInt(usedMinor) * 100n < BigInt(policy.budgetMinor) * BigInt(percent)) continue;
            const id = sha256(canonicalJson({policy:policy.id,period:policy.budgetPeriod,percent}));
            if (s.has('budgetAlert:' + id)) continue;
            put(s,'budgetAlert',id,{policy:policy.id,ownerEmail:assignment.ownerEmail,percent,usedMinor,amountMinor:policy.budgetMinor,currency:policy.currency,at:new Date().toISOString()});
            audit(s,a,'budget-threshold',policy.id,{alert:id,percent,usedMinor,amountMinor:policy.budgetMinor,currency:policy.currency});
        }
    }
}
export function visibleBudgetAlerts(s: State, a: Actor) {
    return all(s,'budgetAlert').filter(alert => {
        const policy = s.get('policy:' + alert.policy)?.value;
        return policy && (a.owner || alert.ownerEmail === a.email && assignedBudgetVisible(s,a,policy));
    }).map(alert => ({...alert,name:s.get('policy:' + alert.policy)!.value.name}));
}
