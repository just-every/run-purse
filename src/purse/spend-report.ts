import { budgetApportion } from './budget-allocations';
import { date, requireThat, type Data } from './types';

// Largest-remainder apportionment preserves every cent, including freight/tax,
// on mixed-code orders. Original line order breaks equal remainder ties.
function distribute(amount: number, lines: Data[]) {
    const weights = lines.map(l => BigInt(l.totalMinor)), total = weights.reduce((a, b) => a + b, 0n);
    const denominator = total || BigInt(lines.length);
    const parts = weights.map((w, index) => {
        const numerator = BigInt(amount) * (total ? w : 1n);
        return { index, value: Number(numerator / denominator), remainder: numerator % denominator };
    });
    let left = amount - parts.reduce((n, p) => n + p.value, 0);
    for (const p of [...parts].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
        if (!left) break;
        p.value++; left--;
    }
    return parts.map(p => p.value);
}
export const reportDimensions = ['department', 'project', 'location', 'supplier', 'category'] as const;
export function spendReport(data: Data, filters: Data = {}) {
    const from = filters.from ? date(filters.from) : '', through = filters.through ? date(filters.through) : '';
    requireThat(!from || !through || from <= through, 'From must precede through');
    const groupBy = filters.groupBy || 'supplier';
    requireThat(reportDimensions.includes(groupBy), 'Choose a supported reporting dimension');
    const rows: Data[] = [];
    const requestById = new Map<string, Data>(data.request.map((r: Data) => [r.id, r]));
    const orderById = new Map<string, Data>(data.order.map((o: Data) => [o.id, o]));
    const source = (r: Data, l: Data) => ({ request: r.request ?? r.id, revision: r.revision, title: r.title || r.name, line: l.id, description: l.description,
        department: l.costCentre ?? r.costCentre, project: l.project, location: l.location ?? r.location, supplier: r.supplier,
        supplierName: r.supplierSnapshot?.name || data.supplier.find((s: Data) => s.id === r.supplier)?.name || r.supplier,
        category: l.category, currency: r.currency });
    // Ledger balances are current purchasing authority, not lifetime spend.
    const balances = new Map<string, Data>();
    for (const e of data.commitment) {
        const key = JSON.stringify([e.request, e.policy, e.currency]);
        const b = balances.get(key) || { request: e.request, policy: e.policy, currency: e.currency, amount: 0 };
        b.amount += e.amountMinor; balances.set(key, b);
    }
    for (const b of balances.values()) {
        if (b.amount <= 0) continue;
        const request = requestById.get(b.request);
        if (!request || request.imported) continue;
        const order = data.order.filter((o: Data) => o.request === b.request && (o.issuedAt || o.adoption) && ['issued', 'adopted', 'amendment-pending', 'closed'].includes(o.status)).sort((a: Data, b: Data) => b.revision - a.revision)[0];
        // Receipt/cancellation/closure events have already released ledger authority.
        const committed = order && order.currency === b.currency && order.policy === b.policy ? Math.min(b.amount, outstanding(order)) : 0;
        for (const [kind, amount, terms] of [['committed', committed, order], ['reserved', b.amount - committed, request]] as const) {
            if (!amount) continue;
            const revision = data.revision.find((r: Data) => r.request === request.id && r.revision === terms.revision) || request;
            const eligible = kind === 'committed' && !order.poDetails?.blanket ? terms.lines.filter((l: Data) => order.positions.find((p: Data) => p.line === l.id)?.outstanding > 0) : terms.lines;
            const weights = kind === 'committed' && !order.poDetails?.blanket ? eligible.map((l: Data) => ({ ...l, totalMinor: Number((BigInt(Math.max(0, order.positions.find((p: Data) => p.line === l.id)?.outstanding ?? 0)) * BigInt(l.unitMinor) + 500n) / 1000n) })) : eligible;
            const values = distribute(amount, weights);
            eligible.forEach((l: Data, i: number) => {
                if (values[i]) rows.push({ ...source(revision, l), kind, amountMinor: values[i], policy: b.policy, currency: b.currency,
                    date: terms.needDate, order: kind === 'committed' ? order.id : null, number: kind === 'committed' ? order.number : null });
            });
        }
    }
    for (const invoice of data.invoice) {
        const order = orderById.get(invoice.order), request = order && requestById.get(order.request);
        if (!order || !request || order.imported && !order.adoption) continue;
        const revision = data.revision.find((r: Data) => r.request === request.id && r.revision === order.revision) || request;
        for (const allocation of invoice.allocations) {
            const line = order.lines.find((l: Data) => l.id === allocation.line);
            if (line) rows.push({ ...source(revision, line), kind: 'actual', amountMinor: allocation.amountMinor - (invoice.depositAppliedMinor ? distribute(invoice.depositAppliedMinor, invoice.allocations.map((a: Data) => ({ totalMinor: a.amountMinor })))[invoice.allocations.indexOf(allocation)] : 0), date: (invoice.imported ? invoice.invoiceDate || invoice.at?.slice(0, 10) || order.adoptedAt?.slice(0, 10) : invoice.at.slice(0, 10)), sourceBasis: invoice.imported ? 'Imported invoice evidence; source approval is historical' : 'Recorded invoice evidence',
                currency: invoice.currency, policy: order.policy, order: order.id, number: order.number, invoice: invoice.id, reference: invoice.reference,
                exception: data.discrepancies.some((d: Data) => d.invoiceId === invoice.id && (d.priceMismatch || d.quantityMismatch || d.receiptShortfall || d.closedBalance)) });
        }
    }
    for (const deposit of data.deposit ?? []) {
        const order = orderById.get(deposit.order), request = order && requestById.get(order.request);
        if (!order?.adoption || !request) continue;
        const values = distribute(deposit.amountMinor, order.lines);
        order.lines.forEach((line: Data, index: number) => { if (values[index]) rows.push({ ...source(request, line), kind: 'actual', amountMinor: values[index], date: order.adoptedAt.slice(0, 10),
            currency: order.currency, policy: order.policy, order: order.id, number: order.number, deposit: deposit.id, reference: deposit.reference, sourceBasis: 'Imported prepaid deposit evidence; not a payment executed by Purse' }); });
    }
    for (const expense of data.travelExpense ?? []) {
        const request = requestById.get(expense.request); if (!request) continue;
        const revision = data.revision.find((record: Data) => record.request === request.id && record.revision === expense.revision) ?? request;
        rows.push({ ...source(revision, revision.lines[0]), kind: 'actual', amountMinor: expense.totalMinor,
            date: expense.at.slice(0, 10), currency: expense.currency, policy: expense.policy,
            travelExpense: expense.id, reference: expense.externalNumber, attachment: expense.attachment,
            sourceBasis: 'Approved Coaster trip expense report; original retained', order: null, number: null });
    }
    const allocated = rows.flatMap(row => {
        const terms = row.order ? orderById.get(row.order) : data.revision.find((revision: Data) => revision.request === row.request && revision.revision === row.revision) ?? requestById.get(row.request);
        const line = terms?.lines.find((line: Data) => line.id === row.line);
        if (!line?.allocations?.length) return [row];
        const amounts = budgetApportion(row.amountMinor, line.allocations.map((allocation: Data) => allocation.amountMinor));
        return line.allocations.map((allocation: Data, index: number) => {
            const budget = (data.periodBudgets ?? []).find((budget: Data) => budget.currency === row.currency && budget.department === allocation.costCentre && (!budget.project || budget.project === '*' || budget.project === allocation.project) && terms.needDate >= budget.from && terms.needDate <= budget.through);
            return { ...row, department: allocation.costCentre, project: allocation.project, location: allocation.location ?? row.location,
                glAccount: allocation.glAccount, allocation: index, amountMinor: amounts[index], policy: budget?.id ?? row.policy };
        }).filter((row: Data) => row.amountMinor);
    });
    rows.splice(0, rows.length, ...allocated);
    const selected = rows.filter(r => (!from || r.date >= from) && (!through || r.date <= through) && reportDimensions.every(d => !filters[d] || r[d] === filters[d]));
    const groups = new Map<string, Data>();
    for (const r of selected) {
        const key = JSON.stringify([r[groupBy], r.currency]);
        const group = groups.get(key) || { value: r[groupBy], label: groupBy === 'supplier' ? r.supplierName : r[groupBy], currency: r.currency, reservedMinor: 0, committedMinor: 0, actualMinor: 0, rows: [] };
        group[r.kind + 'Minor'] += r.amountMinor; group.rows.push(r); groups.set(key, group);
    }
    const totals = [...new Set(selected.map(r => r.currency))].sort().map(currency => ({ currency, ...Object.fromEntries(['reserved', 'committed', 'actual'].map(kind => [kind + 'Minor', selected.filter(r => r.currency === currency && r.kind === kind).reduce((n, r) => n + r.amountMinor, 0)])) }));
    const policyIds = new Set(selected.map(r => r.policy));
    const budgets = data.policy.filter((p: Data) => policyIds.has(p.id)).map((p: Data) => {
        const selectedRows = selected.filter(r => r.policy === p.id && r.currency === p.currency);
        const outstanding = data.commitment.filter((e: Data) => e.policy === p.id && e.currency === p.currency).reduce((n: number, e: Data) => n + e.amountMinor, 0);
        return { id: p.id, name: p.name, currency: p.currency, budgetMinor: p.budgetMinor, availableMinor: p.budgetMinor - outstanding - (data.travelExpense ?? []).filter((expense:Data)=>expense.policy===p.id).reduce((sum:number,expense:Data)=>sum+expense.totalMinor,0),
            ...Object.fromEntries(['reserved', 'committed', 'actual'].map(kind => [kind + 'Minor', selectedRows.filter(r => r.kind === kind).reduce((n, r) => n + r.amountMinor, 0)])), rows: selectedRows, scopeRows: rows.filter(r => r.policy === p.id && r.currency === p.currency) };
    });
    return { periodBudgets: data.periodBudgets ?? [], groupBy, groups: [...groups.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)) || a.currency.localeCompare(b.currency)), totals, budgets,
        choices: Object.fromEntries(reportDimensions.map(d => [d, [...new Map(rows.map(r => [r[d], { value: r[d], label: d === 'supplier' ? r.supplierName : r[d] }])).values()].sort((a, b) => String(a.label).localeCompare(String(b.label)))])), rows: selected };
}
function outstanding(order: Data) {
    if(order.blanketPosition) return Math.min(order.totalMinor, order.blanketPosition.remainingMinor);
    const base = order.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0);
    const value = order.lines.reduce((n: bigint, l: Data) => {
        const p = order.positions.find((p: Data) => p.line === l.id);
        return n + (BigInt(Math.max(0, p?.outstanding ?? 0)) * BigInt(l.unitMinor) + 500n) / 1000n;
    }, 0n);
    return base ? Number((BigInt(order.totalMinor) * value + BigInt(base) / 2n) / BigInt(base)) : (order.positions.some((p: Data) => p.outstanding > 0) ? order.totalMinor : 0);
}
