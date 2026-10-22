import { all, type Data, type State } from './types';

/** Imported origin remains permanent. Adoption supplies operational custody, never a native decision. */
export function orderAdoption(s: State, order: Data): Data | undefined {
    return all(s, 'orderAdoption').find(adoption => adoption.order === order.id || adoption.request === order.request);
}
export function operationalOrder(s: State, order: Data): boolean {
    return Boolean(order.imported ? orderAdoption(s, order) : order.issuedAt);
}
export function currentOperationalOrder(s: State, order: Data): boolean {
    return operationalOrder(s, order) && !order.amendedBy && ['issued', 'adopted', 'amendment-pending', 'closed', 'cancelled'].includes(order.status);
}
export function adoptionDeposits(s: State, order: Data) {
    const adoption = orderAdoption(s, order);
    if (!adoption) return { amountMinor: 0, appliedMinor: 0, unappliedMinor: 0, sources: [] as Data[] };
    if (order.currency !== adoption.sourceOrder.currency || order.supplier !== adoption.sourceOrder.supplier) return { amountMinor: 0, appliedMinor: 0, unappliedMinor: 0, sources: [] as Data[] };
    const sources = all(s, 'deposit').filter(deposit => adoption.deposits.includes(deposit.id));
    const amountMinor = sources.reduce((sum, deposit) => sum + deposit.amountMinor, 0);
    const carriedApplied = sources.reduce((sum, deposit) => sum + deposit.appliedMinor, 0);
    const orderIds = new Set(all(s, 'order').filter(candidate => candidate.request === adoption.request).map(candidate => candidate.id));
    const appliedMinor = carriedApplied + all(s, 'invoice').filter(invoice => !invoice.imported && orderIds.has(invoice.order)).reduce((sum, invoice) => sum + (invoice.depositAppliedMinor ?? 0), 0);
    return { amountMinor, appliedMinor, unappliedMinor: Math.max(0, amountMinor - appliedMinor), sources };
}
