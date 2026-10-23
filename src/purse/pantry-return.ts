import type { Bindings } from '../auth.server';
import { pantryCall, type PantryCredential } from './pantry-client';
import { Fault, type Data } from './types';

const invalid = () => new Fault(502, 'Pantry returned malformed or unsupported bill payment evidence');
function record(value: unknown): Data {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    return value as Data;
}
function text(value: unknown, max = 500): string {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid();
    return value;
}
function minor(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalid();
    return value;
}
function add(left: number, right: number): number { return minor(left + right); }
function day(value: unknown): string {
    const result = text(value, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw invalid();
    const parsed = new Date(result + 'T00:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) throw invalid();
    return result;
}
function list(value: unknown, max: number): Data[] {
    if (!Array.isArray(value) || value.length > max) throw invalid();
    return value.map(record);
}

export async function readPantryReturn(env: Bindings, credential: Data, billId: string) {
    text(billId, 200);
    const connection = credential as PantryCredential;
    const bill = record(await pantryCall(env, connection, '/bills/' + encodeURIComponent(billId)));
    if (bill.id !== billId || !['posted', 'draft', 'void'].includes(bill.status)) throw invalid();
    const totalMinor = minor(bill.total_cents), openMinor = minor(bill.open_cents);
    if (openMinor > totalMinor) throw invalid();
    const vendorId = text(bill.vendor_id, 200), reference = text(bill.reference, 80);
    const invoiceDate = day(bill.bill_date), dueDate = day(bill.due_date);
    if (dueDate < invoiceDate) throw invalid();
    const lines = list(bill.lines, 100).map(line => ({ description: text(line.description),
        accountId: text(line.account_id, 200), amountMinor: minor(line.amount_cents) }));
    const payments: { id: string; journalId: string; date: string; amountMinor: number; allocations: { id: string; amountMinor: number }[] }[] = [];
    const cursors = new Set<string>(), paymentIds = new Set<string>(), allocationIds = new Set<string>();
    let cursor: string | null = null, paidMinor = 0, complete = false;
    for (let page = 0; page < 100; page++) {
        const query = new URLSearchParams({ billId, limit: '100' });
        if (cursor !== null) query.set('cursor', cursor);
        const response = record(await pantryCall(env, connection, '/payments?' + query.toString()));
        for (const payment of list(response.payments, 100)) {
            const id = text(payment.id, 200);
            if (paymentIds.has(id)) throw invalid();
            paymentIds.add(id);
            // A reversal is historical evidence, never an active payment amount.
            if (payment.reversal_id) continue;
            const journalId = text(payment.journal_id, 200), date = day(payment.payment_date);
            const amountMinor = minor(payment.amount_cents);
            if (payment.direction !== 'paid' || payment.contact_id !== vendorId) throw invalid();
            let allocated = 0, targetAmount = 0;
            const allocations: { id: string; amountMinor: number }[] = [];
            for (const allocation of list(payment.allocations, 10_000)) {
                if (allocation.voided_on || allocation.voided_by) continue;
                const amount = minor(allocation.amount_cents);
                allocated = add(allocated, amount);
                if (allocation.target_kind !== 'bill' || allocation.target_id !== billId) continue;
                const allocationId = text(allocation.id, 200);
                if (allocationIds.has(allocationId)) throw invalid();
                allocationIds.add(allocationId);
                allocations.push({ id: allocationId, amountMinor: amount });
                targetAmount = add(targetAmount, amount);
            }
            if (allocated > amountMinor) throw invalid();
            if (allocations.length) {
                paidMinor = add(paidMinor, targetAmount);
                payments.push({ id, journalId, date, amountMinor, allocations });
            }
        }
        if (response.nextCursor === null) { complete = true; break; }
        cursor = text(response.nextCursor, 200);
        if (cursors.has(cursor)) throw invalid();
        cursors.add(cursor);
    }
    if (!complete || paidMinor > totalMinor || (bill.status !== 'void' && paidMinor > totalMinor - openMinor)) throw invalid();
    const paymentStatus = bill.status === 'void' ? 'void' : openMinor === 0 && paidMinor < totalMinor ? 'settled-without-payment' :
        totalMinor > 0 && openMinor === 0 && paidMinor === totalMinor ? 'paid' : paidMinor > 0 ? 'partially-paid' :
        openMinor === 0 ? 'settled-without-payment' : 'unpaid';
    return { externalId: billId, vendorId, reference, invoiceDate, dueDate, totalMinor, openMinor, paidMinor,
        paymentStatus, reconciliationStatus: 'unknown' as const, payments, status: bill.status, lines };
}
