import { openInvoiceFlags } from './invoice-status';
import { extended, type Data } from './types';

/** Source-backed line-price savings; no freight, tax, payment or model estimates. */
export function savingsReport(data: Data) {
    const quotes = new Map<string, Data>(data.quote.map((q: Data) => [q.id, q]));
    const revisions = new Map<string, Data>(data.revision.map((r: Data) => [r.request + ':' + r.revision, r]));
    const rows: Data[] = [], realizedRows: Data[] = [];
    const approved = new Set(data.decision.filter((d: Data) => d.decision === 'approved').map((d: Data) => d.request + ':' + d.revision));
    // A newer approved award replaces the earlier negotiated figure, never duplicates it.
    const latest = new Map<string, Data>();
    for (const award of data.quoteAward) if (approved.has(award.request + ':' + award.revision) && (!latest.has(award.request) || latest.get(award.request)!.revision < award.revision)) latest.set(award.request, award);
    for (const award of latest.values()) {
        const first = quotes.get(award.firstQuote)!, winner = quotes.get(award.awardedQuote)!;
        const revision = revisions.get(award.request + ':' + award.revision)!;
        for (const mapping of award.lines) {
            const line = revision.lines.find((l: Data) => l.id === mapping.requestLine), baseline = first.lines.find((l: Data) => l.id === mapping.firstLine), won = winner.lines.find((l: Data) => l.id === mapping.awardedLine);
            rows.push({ award: award.id, request: award.request, revision: award.revision, firstQuote: first.id, awardedQuote: winner.id, line: line.id,
                title: revision.title, description: line.description, currency: award.currency, quantity: line.quantity,
                firstMinor: baseline.totalMinor, awardedMinor: won.totalMinor, savingsMinor: baseline.totalMinor - won.totalMinor, reason: award.reason });
        }
    }
    // Realized savings are attributed to the award of each issued revision, including history.
    const orderById = new Map<string, Data>(data.order.map((o: Data) => [o.id, o]));
    const paidPlanning = new Set(data.payable.filter((p: Data) => p.approvedAt).map((p: Data) => p.invoice));
    const byRevision = new Map<string, Data>(data.quoteAward.map((a: Data) => [a.request + ':' + a.revision, a]));
    const used = new Map<string, number>();
    for (const invoice of [...data.invoice].sort((a: Data, b: Data) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
        const order = orderById.get(invoice.order);
        if (!order?.issuedAt || order.imported || !paidPlanning.has(invoice.id) || openInvoiceFlags(invoice).length) continue;
        const award = byRevision.get(order.request + ':' + order.revision);
        if (!award || !approved.has(award.request + ':' + award.revision)) continue;
        const first = quotes.get(award.firstQuote)!;
        for (const allocation of invoice.allocations) {
            const line = order.lines.find((l: Data) => l.id === allocation.line), mapping = award.lines.find((l: Data) => l.requestLine === allocation.line);
            if (!line || !mapping) continue;
            const baseline = first.lines.find((l: Data) => l.id === mapping.firstLine);
            // Current accepted quantity is shared across amendments; returns reduce the cap.
            const family = data.order.filter((o: Data) => o.request === order.request).sort((a: Data, b: Data) => b.revision - a.revision);
            const current = family.find((o: Data) => o.issuedAt), position = current?.positions.find((p: Data) => p.line === line.id);
            const key = order.request + ':' + line.id, prior = used.get(key) ?? 0;
            const q = Math.max(0, Math.min(allocation.q, (position?.accepted ?? 0) - prior));
            used.set(key, prior + q);
            if (!q) continue;
            // Allocate a partially eligible invoice's cents once, half-up.
            const billedMinor = Number((BigInt(allocation.amountMinor) * BigInt(q) + BigInt(allocation.q) / 2n) / BigInt(allocation.q));
            const firstMinor = extended(q, baseline.unitMinor);
            realizedRows.push({ award: award.id, firstQuote: first.id, awardedQuote: award.awardedQuote, request: order.request, order: order.id,
                number: order.number, invoice: invoice.id, reference: invoice.reference, line: line.id, description: line.description, currency: invoice.currency,
                quantity: q / 1000, firstMinor, billedMinor, savingsMinor: firstMinor - billedMinor });
        }
    }
    const currencies = [...new Set([...rows, ...realizedRows].map(r => r.currency))].sort();
    return { rows, realizedRows, totals: currencies.map(currency => ({ currency,
        negotiatedMinor: rows.filter(r => r.currency === currency).reduce((n, r) => n + r.savingsMinor, 0),
        realizedMinor: realizedRows.filter(r => r.currency === currency).reduce((n, r) => n + r.savingsMinor, 0) })) };
}
