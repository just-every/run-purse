import { openInvoiceFlags } from './invoice-status';
import { extended, type Data } from './types';

/** Both award doors feed one quantity, invoice and amendment calculation. */
function normalizedAwards(data: Data): Data[] {
    const quotes = new Map<string, Data>(data.quote.map((q: Data) => [q.id, q]));
    const revisions = new Map<string, Data>(data.revision.map((r: Data) => [r.request + ':' + r.revision, r]));
    return [...data.quoteAward, ...(data.agreementAward ?? [])].map((award: Data) => {
        const revision = revisions.get(award.request + ':' + award.revision)!;
        const first = award.firstQuote ? quotes.get(award.firstQuote)! : null, winner = award.awardedQuote ? quotes.get(award.awardedQuote)! : null;
        const source = first ? { firstQuote: first.id, awardedQuote: winner!.id } : {
            agreement: award.agreement, agreementVersion: award.agreementVersion, reading: award.reading,
            firstOfferSource: award.firstOfferSource, awardSource: award.awardSource,
        };
        return { ...award, source, title: revision.title, lines: award.lines.map((mapping: Data) => {
            const line = revision.lines.find((l: Data) => l.id === mapping.requestLine)!;
            const baseline = first?.lines.find((l: Data) => l.id === mapping.firstLine), won = winner?.lines.find((l: Data) => l.id === mapping.awardedLine);
            return { ...line, agreementLine: mapping.agreementLine, firstUnitMinor: baseline?.unitMinor ?? mapping.firstUnitMinor,
                firstMinor: baseline?.totalMinor ?? extended(line.q, mapping.firstUnitMinor), awardedMinor: won?.totalMinor ?? extended(line.q, mapping.awardedUnitMinor) };
        }) };
    });
}
/** Source-backed line-price savings; no freight, tax, payment or model estimates. */
export function savingsReport(data: Data) {
    const awards = normalizedAwards(data), rows: Data[] = [], realizedRows: Data[] = [];
    const approved = new Set(data.decision.filter((d: Data) => d.decision === 'approved').map((d: Data) => d.request + ':' + d.revision));
    // A newer approved award replaces the earlier figure across both award doors.
    const latest = new Map<string, Data>();
    for (const award of awards) if (approved.has(award.request + ':' + award.revision) && (!latest.has(award.request) || latest.get(award.request)!.revision < award.revision)) latest.set(award.request, award);
    for (const award of latest.values()) for (const line of award.lines) {
        rows.push({ ...award.source, award: award.id, request: award.request, revision: award.revision, line: line.id, agreementLine: line.agreementLine,
            title: award.title, description: line.description, currency: award.currency, quantity: line.quantity,
            firstMinor: line.firstMinor, awardedMinor: line.awardedMinor, savingsMinor: line.firstMinor - line.awardedMinor, reason: award.reason });
    }
    // Realized savings retain each issued revision's own exact source, including history.
    const orderById = new Map<string, Data>(data.order.map((o: Data) => [o.id, o]));
    const paidPlanning = new Set(data.payable.filter((p: Data) => p.approvedAt).map((p: Data) => p.invoice));
    const byRevision = new Map<string, Data>(awards.map(a => [a.request + ':' + a.revision, a]));
    const used = new Map<string, number>();
    for (const invoice of [...data.invoice].sort((a: Data, b: Data) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
        const order = orderById.get(invoice.order);
        if (!order?.issuedAt || order.imported || !paidPlanning.has(invoice.id) || invoice.exception || invoice.disputed || openInvoiceFlags(invoice).length) continue;
        const award = byRevision.get(order.request + ':' + order.revision);
        if (!award || !approved.has(award.request + ':' + award.revision)) continue;
        for (const allocation of invoice.allocations) {
            const line = order.lines.find((l: Data) => l.id === allocation.line), baseline = award.lines.find((l: Data) => l.id === allocation.line);
            if (!line || !baseline) continue;
            // Current accepted quantity is shared across amendments; returns reduce the cap.
            const family = data.order.filter((o: Data) => o.request === order.request).sort((a: Data, b: Data) => b.revision - a.revision);
            const current = family.find((o: Data) => o.issuedAt), position = current?.positions.find((p: Data) => p.line === line.id);
            const key = order.request + ':' + line.id, prior = used.get(key) ?? 0;
            if (line.service) {
                const billedMinor = Math.max(0, Math.min(allocation.amountMinor, (position?.acceptedMinor ?? 0) - prior));
                used.set(key, prior + billedMinor);
                if (!billedMinor || !baseline.awardedMinor) continue;
                const firstMinor = Number((BigInt(billedMinor) * BigInt(baseline.firstMinor) + BigInt(baseline.awardedMinor) / 2n) / BigInt(baseline.awardedMinor));
                realizedRows.push({ ...award.source, award: award.id, request: order.request, revision: order.revision, order: order.id,
                    number: order.number, invoice: invoice.id, reference: invoice.reference, line: line.id, agreementLine: baseline.agreementLine,
                    description: line.description, currency: invoice.currency, quantity: line.q / 1000 * billedMinor / line.totalMinor,
                    receivedValueMinor: position?.acceptedMinor, firstMinor, billedMinor, savingsMinor: firstMinor - billedMinor });
                continue;
            }
            const q = Math.max(0, Math.min(allocation.q, (position?.accepted ?? 0) - prior));
            used.set(key, prior + q);
            if (!q) continue;
            // Allocate a partially eligible invoice's cents once, half-up.
            const billedMinor = Number((BigInt(allocation.amountMinor) * BigInt(q) + BigInt(allocation.q) / 2n) / BigInt(allocation.q));
            const firstMinor = extended(q, baseline.firstUnitMinor);
            realizedRows.push({ ...award.source, award: award.id, request: order.request, revision: order.revision, order: order.id,
                number: order.number, invoice: invoice.id, reference: invoice.reference, line: line.id, agreementLine: baseline.agreementLine, description: line.description, currency: invoice.currency,
                quantity: q / 1000, firstMinor, billedMinor, savingsMinor: firstMinor - billedMinor });
        }
    }
    for(const row of realizedRows){const order=orderById.get(row.order);row.outcomeConfirmations=(data.valueConfirmation??[]).filter((c:Data)=>c.request===row.request&&c.revision===order?.revision).map((c:Data)=>({id:c.id,run:c.run,runVersion:c.runVersion,request:c.request,revision:c.revision,fingerprint:c.fingerprint,usefulness:c.usefulness,notes:c.notes,at:c.at,actor:c.actor,assessment:c.inputs.assessment,provenance:'Requester-confirmed value report; usefulness notes are unscored; no additional monetary savings'}));}
    const currencies = [...new Set([...rows, ...realizedRows].map(r => r.currency))].sort();
    return { rows, realizedRows, totals: currencies.map(currency => ({ currency,
        negotiatedMinor: rows.filter(r => r.currency === currency).reduce((n, r) => n + r.savingsMinor, 0),
        realizedMinor: realizedRows.filter(r => r.currency === currency).reduce((n, r) => n + r.savingsMinor, 0) })) };
}
