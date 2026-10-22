import { periodBudgetPosition } from './budget-position';
import { unrestrictedPermission } from './access-records';
import { coveringPolicies } from './policy-match';
import { all, allowed, type Actor, type Data, type State } from './types';

/** Budget grants reveal complete figures, never details of a private purchase. */
export function visibleBudgetPositions(s: State, a: Actor, data: Data) {
    const requests = new Set(data.request.map((request: Data) => request.id));
    const orders = new Set(data.order.map((order: Data) => order.id));
    const invoices = new Set(data.invoice.map((invoice: Data) => invoice.id));
    return all(s, 'policy').filter(policy => policy.budgetPeriod && (unrestrictedPermission(s, a, 'request.read')
        || allowed(s, a, 'access.manage', policy)
        || data.request.some((request: Data) => request.policy === policy.id || coveringPolicies([policy], request).length
            || request.budgetReview?.ids.includes(policy.id))))
        .map(policy => {
            const position = periodBudgetPosition(s, policy), visible: Data[] = [];
            const hidden: Data = { hidden: true, title: 'Other purchases you cannot see', reservedMinor: 0, committedMinor: 0, actualMinor: 0, invoiceIds: [], depositIds: [] };
            for (const source of position.sources) {
                if (!requests.has(source.request) || source.order && !orders.has(source.order)) {
                    for (const field of ['reservedMinor', 'committedMinor', 'actualMinor']) hidden[field] += source[field];
                } else visible.push({ ...source,
                    invoiceIds: source.invoiceIds.filter((id: string) => invoices.has(id)),
                    depositIds: allowed(s, a, 'invoice.read', s.get('request:' + source.request)!.value) ? source.depositIds : [] });
            }
            if (hidden.reservedMinor || hidden.committedMinor || hidden.actualMinor) visible.push(hidden);
            return { ...position, sources: visible, complete: true };
        });
}
