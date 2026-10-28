import { allowed, requirePermission } from './access';
import { operationalOrder, orderAdoption } from './adoption-position';
import { budgetApportion } from './budget-allocations';
import { openInvoiceFlags } from './invoice-status';
import { closureAt } from './order-closure';
import { discrepancies } from './orders';
import { receiptDay } from './receipt-routing';
import { all, date, extended, type Actor, type Data, type State } from './types';

export const accrualDimensions = ['entity', 'department', 'location', 'supplier', 'glAccount', 'class', 'project'] as const;
const sum = (rows: Data[], key: string) => rows.reduce((n, row) => n + row[key], 0);
/** A cash forecast, imported label or restored bearer never creates a bill approval. */
function approvedBill(invoice: Data) {
    const approval = invoice.paymentApproval;
    return !invoice.imported && invoice.supplierSubmission && invoice.sourceConfirmation === 'confirmed'
        && !invoice.exception && !invoice.disputed
        && !['draft', 'pending', 'pending-approval', 'exception', 'disputed'].includes(invoice.status)
        && !openInvoiceFlags(invoice).length && approval?.match === 'three-way'
        && approval.invoice === invoice.id && approval.order === invoice.order
        && approval.amountMinor === invoice.totalMinor && approval.currency === invoice.currency
        && approval.documentSha256 === invoice.document?.sha256 && approval.reading === invoice.confirmedReading;
}

export function accrualReport(s: State, a: Actor, filters: Data = {}) {
    requirePermission(s, a, 'report.read');
    const cutoff = date(filters.cutoff, 'Period end'), day = (at: string) => receiptDay(s, Date.parse(at));
    const orders = all(s, 'order'), invoices = all(s, 'invoice'), receipts = all(s, 'receipt');
    const exceptions = new Set(discrepancies(s).filter(row => row.quantityMismatch || row.priceMismatch || row.receiptShortfall || row.closedBalance || row.exception).map(row => row.invoiceId));
    const warnings = new Set<string>(), rows: Data[] = [], deposits: Data[] = [];
    const permitted = orders.filter(order => allowed(s, a, 'report.read', order) && allowed(s, a, 'po.read', order));
    if (permitted.some(order => order.imported && !operationalOrder(s,order))) warnings.add('Unadopted imported orders are omitted; historical dates and approvals are not qualified.');
    const latest = new Map<string, Data>();
    for (const order of permitted.filter(order => operationalOrder(s, order))) {
        const key = order.request + ':' + order.currency;
        if (!latest.has(key) || latest.get(key)!.revision < order.revision) latest.set(key, order);
    }
    for (const order of latest.values()) {
        const family = orders.filter(source => source.request === order.request && source.currency === order.currency);
        const ids = new Set(family.map(source => source.id)), bills = invoices.filter(invoice => ids.has(invoice.order));
        // A partial bill graph would overstate an accrual or disclose hidden facts through a total.
        if (family.some(source => !allowed(s, a, 'po.read', source) || !allowed(s, a, 'report.read', source))
            || !allowed(s, a, 'invoice.read', order) || bills.some(invoice => !allowed(s, a, 'invoice.read', invoice))) {
            warnings.add('Some purchase sources are outside your current scope and are omitted.'); continue;
        }
        const adoption = orderAdoption(s, order);
        if (order.imported || adoption) warnings.add(order.number + ': adopted historical receipt dates and bill approvals are not fully qualified; historical balances are omitted.');
        const revision = s.get('revision:' + order.request + ':' + order.revision)?.value ?? order;
        const identity = { order: order.id, number: order.number, supplier: order.supplier, supplierName: order.supplierSnapshot?.name ?? s.get('supplier:' + order.supplier)?.value.name ?? order.supplier, currency: order.currency };
        for (const deposit of all(s, 'deposit').filter(deposit => ids.has(deposit.order))) {
            if (!adoption || day(adoption.at) > cutoff) continue;
            const applied = bills.filter(invoice => !invoice.imported && invoice.invoiceDate && invoice.invoiceDate <= cutoff).reduce((n, invoice) => n + (invoice.depositAppliedMinor ?? 0), 0);
            // Imported deposits remain source evidence, separate from accrual and from native payments.
            deposits.push({ ...identity, department: order.costCentre ?? '', location: order.location ?? '', entity: order.entity ?? '', glAccount: revision.glAccount ?? '', deposit: deposit.id, reference: deposit.reference, amountMinor: deposit.amountMinor, appliedMinor: deposit.appliedMinor ?? 0,
                unappliedMinor: Math.max(0, deposit.amountMinor - (deposit.appliedMinor ?? 0)), basis: 'Imported prepaid evidence; historical application dates unavailable' });
            if (applied) warnings.add(order.number + ': later deposit applications require full PO-011 qualification; imported balance shown separately.');
        }
        for (const line of order.lines) {
            const sources: Data[] = [];
            for (const receipt of receipts.filter(receipt => ids.has(receipt.order) && receipt.line === line.id && ['receive', 'return'].includes(receipt.event))) {
                const sourceOrder = orders.find(source => source.id === receipt.order)!, sourceLine = sourceOrder.lines.find((source: Data) => source.id === line.id);
                if (receipt.imported) continue;
                const effectiveDate = receipt.effectiveDate ?? day(receipt.at), recordedDate = receipt.recordedDate ?? day(receipt.at);
                if (!receipt.effectiveDate) warnings.add(order.number + ': an older receipt has no effective received date; its recorded date is used.');
                if (effectiveDate > cutoff) continue;
                sources.push({ receipt: receipt.id, order: receipt.order, event: receipt.event, effectiveDate, recordedAt: receipt.at, recordedDate,
                    lateEntered: recordedDate > cutoff, q: receipt.event === 'return' ? -receipt.q : receipt.q,
                    valueMinor: (receipt.event === 'return' ? -1 : 1) * (receipt.valueMinor ?? extended(receipt.q, sourceLine.unitMinor)),
                    unitMinor: sourceLine.unitMinor, basis: receipt.effectiveDate ? 'Effective received date' : 'Recorded date fallback' });
            }
            sources.sort((a,b) => a.recordedAt.localeCompare(b.recordedAt) || a.receipt.localeCompare(b.receipt));
            const receivedQ = Math.max(0, sum(sources, 'q')), receivedMinor = Math.max(0, sum(sources, 'valueMinor'));
            const closed = family.reduce((n, source) => n + closureAt(s, source.id, line.id, cutoff, day), 0);
            const cancelled = receipts.filter(receipt => ids.has(receipt.order) && receipt.line === line.id && receipt.event === 'cancel' && day(receipt.at) <= cutoff);
            // Match receiving authority: goods include cancellations; services close the remaining value rounded down to receiving quantity.
            const outstanding = line.service
                ? Number(BigInt(Math.max(0, line.totalMinor - receivedMinor)) * BigInt(line.q) / BigInt(line.totalMinor))
                : Math.max(0, line.q - receivedQ - sum(cancelled, 'q'));
            if (closed && closed >= outstanding) continue;
            const approved: Data[] = [], excluded: Data[] = [];
            for (const invoice of bills.filter(invoice => invoice.allocations.some((allocation: Data) => allocation.line === line.id))) {
                const allocation = invoice.allocations.find((allocation: Data) => allocation.line === line.id);
                const qualifies = approvedBill(invoice) && !exceptions.has(invoice.id) && invoice.invoiceDate && invoice.invoiceDate <= cutoff;
                if (!invoice.invoiceDate) warnings.add(order.number + ': invoice dates are missing; undated bills do not reduce this report.');
                const proof = { invoice: invoice.id, order: invoice.order, reference: invoice.reference, invoiceDate: invoice.invoiceDate ?? null,
                    q: allocation.q, amountMinor: allocation.amountMinor, approvalAt: invoice.paymentApproval?.at ?? null };
                if (qualifies) approved.push(proof);
                else excluded.push({ ...proof, reason: invoice.invoiceDate > cutoff ? 'Invoice date after cutoff' : 'No eligible genuine bill approval or unresolved hold' });
            }
            const billedQ = sum(approved, 'q'), billedMinor = sum(approved, 'amountMinor'), accrualMinor = Math.max(0, receivedMinor - billedMinor);
            if (!sources.length) continue;
            const codes = line.allocations?.length ? line.allocations : [{}], weights = codes.map((code: Data) => code.amountMinor ?? line.totalMinor ?? 1);
            const portions = Object.fromEntries(Object.entries({ receivedQ, receivedMinor, billedQ, billedMinor, accrualMinor }).map(([key, amount]) => [key, budgetApportion(amount, weights)]));
            codes.forEach((code: Data, allocation: number) => rows.push({ ...identity, request: order.request, line: line.id, description: line.description, allocation,
                department: code.costCentre ?? line.costCentre ?? order.costCentre ?? '', location: code.location ?? line.location ?? order.location ?? '',
                project: code.project ?? line.project ?? '', glAccount: code.glAccount ?? line.glAccount ?? revision.glAccount ?? '',
                class: code.class ?? line.class ?? revision.class ?? '', entity: code.entity ?? order.entity ?? '', customFields: code.customFields ?? line.customFields ?? {}, headerFields: order.customFields ?? {},
                unitMinor: line.unitMinor, mode: line.service?.mode ?? 'quantity', ...Object.fromEntries(Object.entries(portions).map(([key, values]) => [key, values[allocation]])),
                lateEntered: sources.some(source => source.lateEntered), receipts: sources, bills: approved, excludedBills: excluded,
                effectiveDates: sources.map(source => source.effectiveDate).join('; '), recordedDates: sources.map(source => source.recordedAt).join('; ') }));
        }
    }
    const matches = (row: Data) => accrualDimensions.every(key => !filters[key] || row[key] === filters[key]);
    const selected = rows.filter(matches), groups = new Map<string, Data>();
    for (const row of selected) {
        const coding = Object.fromEntries(accrualDimensions.map(key => [key, row[key]]));
        delete coding.supplier;
        const key = JSON.stringify([row.currency, coding, row.customFields, row.headerFields]);
        const group = groups.get(key) ?? { ...coding, customFields: row.customFields, headerFields: row.headerFields, currency: row.currency, accrualMinor: 0, rows: [] };
        group.accrualMinor += row.accrualMinor; group.rows.push(row); groups.set(key, group);
    }
    return { cutoff, timezone: all(s, 'business')[0]?.timezone || 'America/New_York', rows: selected, groups: [...groups.values()],
        totals: [...new Set(selected.map(row => row.currency))].sort().map(currency => ({ currency, accrualMinor: sum(selected.filter(row => row.currency === currency), 'accrualMinor') })),
        deposits: deposits.filter(matches), warnings: [...warnings],
        limitations: 'Native received-not-billed evidence only. Card-paid exclusions, complete historical adoption, all coding distributions, additional entities and connected-ledger posting and reversal are not qualified. Xero file import has not been qualified against a live account.',
        choices: Object.fromEntries(accrualDimensions.map(key => [key, [...new Set(rows.map(row => row[key]).filter(Boolean))].sort()])) };
}
