import { coveringPolicies } from './policy-match';
import { all, requireThat, type Data, type State } from './types';

/** Half-up shares; the first allocation receives the remainder cent. */
export function budgetApportion(amount: number, weights: number[]) {
    if (!weights.length) return [];
    const total = weights.reduce((sum, value) => sum + value, 0);
    if (!total) return weights.map((_, index) => index ? 0 : amount);
    const values = weights.map(weight => Number((BigInt(amount) * BigInt(weight) * 2n + BigInt(total)) / (2n * BigInt(total))));
    values[0] += amount - values.reduce((sum, value) => sum + value, 0);
    requireThat(values.every(value => value >= 0), 'Allocation rounding cannot produce a negative share');
    return values;
}

/** Authority remains one request; each dated allocation consumes its own budget. */
export function requestBudgetShares(s: State, request: Data, amount: number): Data[] {
    const primary = s.get('policy:' + request.policy)?.value;
    if (!primary?.budgetPeriod) return [{ policy: request.policy, amountMinor: amount }];
    const lineAmounts = budgetApportion(amount, request.lines.map((line: Data) => line.totalMinor));
    const result = new Map<string, number>();
    request.lines.forEach((line: Data, index: number) => {
        const codes = line.allocations?.length ? line.allocations : [{ costCentre: line.costCentre ?? request.costCentre, project: line.project, amountMinor: line.totalMinor }];
        const parts = budgetApportion(lineAmounts[index], codes.map((code: Data) => code.amountMinor));
        codes.forEach((code: Data, at: number) => {
            const scoped = { ...request, costCentre: code.costCentre, location: code.location ?? line.location ?? request.location,
                totalMinor: parts[at], lines: [{ ...line, project: code.project, allocations: [] }] };
            const candidates = coveringPolicies(all(s, 'policy').map(policy=>({...policy,active:true,limitMinor:Number.MAX_SAFE_INTEGER})), scoped).filter(policy => policy.budgetPeriod);
            const policy = candidates.find(policy => policy.id === primary.id) ?? candidates[0];
            requireThat(policy, 'No dated budget covers an allocation', 409);
            result.set(policy.id, (result.get(policy.id) ?? 0) + parts[at]);
        });
    });
    return [...result].map(([policy, amountMinor]) => ({ policy, amountMinor }));
}
export function budgetPortion(s: State, request: Data, amount: number, policy: string) {
    return requestBudgetShares(s, request, amount).find(share => share.policy === policy)?.amountMinor ?? 0;
}
export function eventBudgetPortion(event: Data, policy: string) {
    return event.budgetAllocations ? event.budgetAllocations.find((share: Data) => share.policy === policy)?.amountMinor ?? 0
        : event.policy === policy ? event.amountMinor : 0;
}
