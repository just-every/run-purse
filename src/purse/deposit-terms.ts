import { createHash } from 'node:crypto';
import { all, date, minor, requireThat, type Data, type State } from './types';
import { moneyInput } from './money';

export function depositTerm(input: unknown, purchase: Data): Data | null {
    if (input == null) return null;
    const value = input as Data;
    requireThat(typeof value === 'object' && !Array.isArray(value), 'Use one structured deposit term');
    requireThat(!purchase.imported && !purchase.adoption && !purchase.recurring && !purchase.agreement && !purchase.supplierGroup
        && !purchase.poDetails?.blanket && purchase.purchaseType !== 'travel'
        && purchase.lines.every((line: Data) => !line.service && (!line.supplier || line.supplier === purchase.supplier)),
    'Structured deposits support one ordinary native goods PO and supplier', 409);
    requireThat(['amount', 'percentage'].includes(value.basis), 'Choose amount or percentage');
    let percentageBps: number | null = null;
    if (value.basis === 'percentage') {
        const percentage = value.percentage ?? (Number.isInteger(value.percentageBps) ? String(value.percentageBps / 100) : '');
        requireThat(typeof percentage === 'string' && /^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(percentage), 'Use an exact percentage with up to two decimal places');
        const [whole, fraction = ''] = percentage.split('.');
        percentageBps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
        requireThat(percentageBps > 0 && percentageBps <= 10000, 'Deposit percentage must be greater than zero and at most 100');
    }
    const amountMinor = percentageBps === null ? moneyInput(value, 'amount', 'amountMinor', 'Deposit amount')
        : minor(Number((BigInt(purchase.totalMinor) * BigInt(percentageBps) + 5000n) / 10000n));
    requireThat(amountMinor > 0 && amountMinor <= purchase.totalMinor, 'Deposit must be positive and cannot exceed the PO total');
    requireThat(value.trigger === 'issue' || value.trigger === 'date', 'Deposit is due on issue or an explicit date');
    return { basis: value.basis, percentageBps, amountMinor, trigger: value.trigger, dueDate: value.trigger === 'date' ? date(value.dueDate, 'Deposit due date') : null,
        supplier: purchase.supplier, currency: purchase.currency, totalMinor: purchase.totalMinor, prepaidAccount: null, posting: 'unmapped' };
}
export const depositTermKey = (order: Data) => createHash('sha256').update(JSON.stringify([order.request, order.revision, order.supplier, order.currency, order.totalMinor, order.poDetails?.deposit])).digest('hex');
export function requireDepositAmendment(s: State, old: Data, next: Data) {
    const previous = old.poDetails?.deposit, current = next.poDetails?.deposit;
    if (!previous && !current) return;
    const orders = all(s, 'order').filter(order => order.request === old.id && order.issuedAt), ids = new Set(orders.map(order => order.id));
    if (orders.length) {
        requireThat(!all(s, 'receipt').some(row => ids.has(row.order)) && !all(s, 'invoice').some(row => ids.has(row.order)),
            'Deposit PO amendments are unavailable once receiving or invoice evidence exists', 409);
    }
}
export function depositTermText(term: Data, currency: string) {
    return (term.basis === 'percentage' ? (term.percentageBps / 100).toFixed(2) + '% · ' : '') + currency + ' ' + (term.amountMinor / 100).toFixed(2)
        + (term.trigger === 'issue' ? ' due on issue' : ' due ' + term.dueDate) + ' · Prepaid account unmapped; ledger posting unavailable';
}
