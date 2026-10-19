import { moneyInput } from './money';
import { extended, minor, quantity, requireThat, type Data } from './types';

/** Reconcile document line extensions and explicit charges before creating evidence. */
export function readingAmounts(reading: Data) {
    const amount = (field: Data, label: string) => moneyInput({ amount: field?.value }, 'amount', 'minor', label);
    const lines = reading.lines.map((line: Data) => {
        const q = quantity(line.quantity?.value), unitMinor = amount(line.unitAmount, 'Invoice unit price');
        const amountMinor = amount(line.amount, 'Invoice line total');
        requireThat(extended(q, unitMinor) === amountMinor, 'Invoice line total must equal quantity × unit price rounded half up');
        return { id: line.id, quantity: line.quantity.value, q, unitMinor, amountMinor };
    });
    const subtotalMinor = amount(reading.subtotalAmount, 'Invoice subtotal');
    const freightMinor = amount(reading.freightAmount, 'Invoice freight (explicit zero allowed)');
    const taxMinor = amount(reading.taxAmount, 'Invoice tax (explicit zero allowed)');
    const totalMinor = amount(reading.totalAmount, 'Invoice total');
    requireThat(lines.reduce((n: number, line: Data) => n + line.amountMinor, 0) === subtotalMinor, 'Invoice lines must reconcile to the document subtotal');
    requireThat(minor(subtotalMinor + freightMinor + taxMinor, 'Invoice total') === totalMinor, 'Invoice subtotal, freight and tax must reconcile to the document total');
    return { lines, subtotalMinor, freightMinor, taxMinor, totalMinor };
}

/** Apportion document charges once; the first mapped line receives remainder cents. */
export function allocateInvoiceCharges(lines: Data[], chargesMinor: number): Data[] {
    minor(chargesMinor, 'Invoice charges');
    const base = lines.reduce((n, line) => n + line.amountMinor, 0);
    requireThat(base > 0 || chargesMinor === 0, 'Positive invoice subtotal required to allocate charges');
    const parts = lines.map(line => base ? Number(BigInt(chargesMinor) * BigInt(line.amountMinor) / BigInt(base)) : 0);
    if (parts.length) parts[0] += chargesMinor - parts.reduce((n, part) => n + part, 0);
    return lines.map((line, index) => ({ ...line, amountMinor: minor(line.amountMinor + parts[index], 'Charged invoice line') }));
}
