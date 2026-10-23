import { createHash } from 'node:crypto';
import { discrepancies } from './orders';
import { openInvoiceFlags } from './invoice-status';
import { all, get, requireThat, text, type Data, type State } from './types';

export const pantryFingerprint = (value: Data) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function pantryPlan(state: State, input: Data, connection: Data) {
    const invoice = get(state, 'invoice', input.invoice), order = get(state, 'order', invoice.order);
    const supplier = get(state, 'supplier', order.supplier), payable = get(state, 'payable', invoice.id);
    requireThat(invoice.currency === connection.currency, 'Invoice currency must match the owner-confirmed Pantry book currency', 409);
    requireThat(payable.approvedAt && payable.version === input.payableVersion && payable.approvedMinor === invoice.totalMinor, 'Current cash-planning approval and version required', 409);
    requireThat(!invoice.imported && !invoice.depositAppliedMinor, 'Imported and deposit bills need their own ledger identity and prepaid reconciliation before sync', 409);
    requireThat(!invoice.exception && !openInvoiceFlags(invoice).length && !discrepancies(state).filter(d => d.invoiceId === invoice.id).some(d => d.priceMismatch || d.quantityMismatch || d.receiptShortfall || d.closedBalance || d.exception), 'Resolve invoice discrepancies and risk holds before Pantry posting', 409);
    const accountId = text(input.accountId, 'Pantry expense account', 200), vendorId = input.vendorId ? text(input.vendorId, 'Pantry vendor', 200) : null;
    const lines = invoice.allocations.map((allocation: Data) => ({description: order.lines.find((line: Data) => line.id === allocation.line)!.description,accountId,amount:(allocation.amountMinor / 100).toFixed(2)}));
    requireThat(lines.length && lines.reduce((n: number, line: Data) => n + Math.round(Number(line.amount) * 100), 0) === invoice.totalMinor, 'Bill lines must reconcile to its approved amount', 409);
    const payload = {reference:invoice.reference,billDate:payable.invoiceDate,dueDate:payable.dueDate,post:true,lines};
    const source = {invoice:invoice.id,order:order.id,supplier:supplier.id,supplierName:supplier.name,currency:invoice.currency,payableVersion:payable.version,term:payable.term,discountDate:payable.discountDate,discountPercent:payable.discountPercent,origin:connection.origin,vendorId,accountId,payload};
    const existing = all(state,'pantrySync').find(sync => sync.invoice === invoice.id);
    const fingerprint = pantryFingerprint(source);
    requireThat(!existing || existing.fingerprint === fingerprint, 'Source or mapping differs from the retained Pantry attempt; reconcile the existing bill instead of posting another', 409);
    return {...source,fingerprint};
}
export function matchesPantryBill(bill: Data, payload: Data, vendorId: string) {
    return bill.vendor_id === vendorId && bill.reference === payload.reference && bill.bill_date === payload.billDate && bill.due_date === payload.dueDate && bill.status === 'posted'
        && bill.total_cents === payload.lines.reduce((n: number, line: Data) => n + Math.round(Number(line.amount)*100),0)
        && JSON.stringify((bill.lines ?? []).map((line: Data) => [line.description,line.account_id,line.amount_cents])) === JSON.stringify(payload.lines.map((line: Data) => [line.description,line.accountId,Math.round(Number(line.amount)*100)]));
}
