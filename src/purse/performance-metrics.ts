import type { Data } from './types';

const revisionKey = (request: string, revision: number) => JSON.stringify([request, revision]);
const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
const elapsed = (from?: string, through?: string) => {
    const value = Date.parse(through ?? '') - Date.parse(from ?? '');
    return Number.isFinite(value) && value >= 0 ? value : null;
};

function durationMetric(basis: string, rows: Data[]) {
    const measured = rows.filter(row => row.elapsedMs !== null);
    const numeratorMs = measured.reduce((sum, row) => sum + row.elapsedMs, 0);
    return { basis, numeratorMs, denominator: measured.length, averageMs: rate(numeratorMs, measured.length),
        unknown: rows.length - measured.length, rows };
}

function spendMetric(basis: string, rows: Data[], field: string) {
    const currencies = new Map<string, Data>();
    for (const row of rows) {
        const group = currencies.get(row.currency) ?? { currency: row.currency, numeratorMinor: 0, denominatorMinor: 0, unknownMinor: 0, rows: [] };
        group.denominatorMinor += row.amountMinor;
        if (row[field] === true) group.numeratorMinor += row.amountMinor;
        if (row[field] === null) group.unknownMinor += row.amountMinor;
        group.rows.push(row);
        currencies.set(row.currency, group);
    }
    return { basis, totals: [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map(group => ({ ...group,
        rate: group.unknownMinor ? null : rate(group.numeratorMinor, group.denominatorMinor) })), rows };
}

/** Accept only visible(state, actor).data: this module never reads unscoped state. */
export function performanceMetrics(data: Data) {
    const requests: Data[] = data.request.filter((r: Data) => !r.imported);
    const requestById = new Map<string, Data>(requests.map(r => [r.id, r]));
    const orders: Data[] = data.order.filter((o: Data) => !o.imported && requestById.has(o.request));
    const orderById = new Map<string, Data>(orders.map(o => [o.id, o]));
    const firstOrder = new Map<string, Data>();
    const lines = new Map<string, Data>();
    for (const order of orders) {
        for (const line of order.lines) lines.set(JSON.stringify([order.id, line.id]), line);
        if (!order.issuedAt) continue;
        const previous = firstOrder.get(order.request);
        if (!previous || Date.parse(order.issuedAt) < Date.parse(previous.issuedAt)) firstOrder.set(order.request, order);
    }
    const revisions = new Map<string, Data>(data.revision.filter((r: Data) => !r.imported)
        .map((r: Data) => [revisionKey(r.request, r.revision), r]));
    const created = new Map<string, Data>(), submitted = new Map<string, Data>(), approved = new Map<string, Data>();
    for (const event of data.audit) {
        if (event.imported || !requestById.has(event.record) || !['request', 'submit'].includes(event.action)) continue;
        if (event.action === 'request' && event.revision !== 1) continue;
        const collection = event.action === 'request' ? created : submitted;
        const key = event.action === 'request' ? event.record : revisionKey(event.record, event.revision);
        const previous = collection.get(key);
        if (!previous || Date.parse(event.at) < Date.parse(previous.at)) collection.set(key, event);
    }
    for (const decision of data.decision) {
        if (decision.imported || decision.decision !== 'approved' || !requestById.has(decision.request)) continue;
        const key = revisionKey(decision.request, decision.revision), previous = approved.get(key);
        if (!previous || Date.parse(decision.at) < Date.parse(previous.at)) approved.set(key, decision);
    }
    const requestRows = requests.map(request => {
        const creation = created.get(request.id), order = firstOrder.get(request.id);
        return { requestId: request.id, title: request.title, creationAuditId: creation?.id ?? null,
            createdAt: creation?.at ?? null, creationAudit: creation ?? null,
            orderId: order?.id ?? null, orderNumber: order?.number ?? null, issuedAt: order?.issuedAt ?? null,
            elapsedMs: elapsed(creation?.at, order?.issuedAt) };
    });
    const approvalRows = [...submitted.entries()].map(([key, submission]) => {
        const decision = approved.get(key), request = requestById.get(submission.record)!;
        return { requestId: request.id, title: revisions.get(key)?.title ?? request.title, revision: submission.revision,
            submitAuditId: submission.id, submittedAt: submission.at, submissionAudit: submission,
            decisionId: decision?.id ?? null, approvedAt: decision?.at ?? null, decision: decision ?? null,
            elapsedMs: elapsed(submission.at, decision?.at) };
    });

    // Both collections already carry the caller's visibility restrictions.
    const promises = new Map<string, Data>([...data.orderChaseEvidence, ...data.supplierOrderEvidence]
        .map((e: Data) => [e.order, e]));
    const deliveryRows: Data[] = [];
    for (const receipt of data.receipt) {
        const order = orderById.get(receipt.order);
        if (receipt.imported || receipt.event !== 'receive' || !order?.issuedAt) continue;
        const promise = promises.get(order.id), line = lines.get(JSON.stringify([order.id, receipt.line]));
        deliveryRows.push({ ...receipt, receiptId: receipt.id, requestId: order.request,
            title: requestById.get(order.request)!.title, orderId: order.id, orderNumber: order.number,
            lineId: receipt.line, description: line?.description, evidenceId: promise?.id ?? null,
            evidenceVersion: promise?.version ?? null, promisedDate: promise?.promisedDate ?? null, promiseEvidence: promise ?? null,
            onTime: promise?.promisedDate ? receipt.at.slice(0, 10) <= promise.promisedDate : null });
    }
    const onTime = deliveryRows.filter(r => r.onTime === true).length;
    const measuredDelivery = deliveryRows.filter(r => r.onTime !== null).length;

    const discrepancies = new Map<string, Data[]>();
    for (const discrepancy of data.discrepancies) {
        const rows = discrepancies.get(discrepancy.invoiceId) ?? [];
        rows.push(discrepancy); discrepancies.set(discrepancy.invoiceId, rows);
    }
    const invoiceRows: Data[] = [];
    for (const invoice of data.invoice) {
        const order = orderById.get(invoice.order);
        if (invoice.imported || !order?.issuedAt) continue;
        const matches = discrepancies.get(invoice.id) ?? [], decision = approved.get(revisionKey(order.request, order.revision));
        invoiceRows.push({ ...invoice, invoiceId: invoice.id, orderId: order.id, orderNumber: order.number,
            requestId: order.request, title: requestById.get(order.request)!.title, revision: order.revision,
            supplierId: order.supplier, supplierName: order.supplierSnapshot?.name ?? order.supplier,
            amountMinor: invoice.totalMinor, underPo: true,
            contractRef: order.supplierSnapshot?.contractRef ?? null,
            offContract: order.supplierSnapshot ? !order.supplierSnapshot.contractRef : null,
            approvalDecisionId: decision?.id ?? null, approvalDecision: decision ?? null,
            unapproved: !decision || elapsed(decision.at, order.issuedAt) === null,
            exception: invoice.status === 'exception' || Boolean(invoice.exception) || matches.some(d =>
                d.exception || d.priceMismatch || d.quantityMismatch || d.receiptShortfall || d.closedBalance),
            discrepancies: matches });
    }
    const exceptionCount = invoiceRows.filter(r => r.exception).length;
    return {
        requestToPo: durationMetric('Native request creation audit to the first issued PO; amendments do not restart the request clock. Missing timestamps are excluded.', requestRows),
        approvalCycle: durationMetric('First native submit audit for each request revision to its approved decision, including rework on that revision. Unapproved revisions are excluded.', approvalRows),
        onTimeDelivery: { basis: 'Accepted receipt events against the current recorded supplier promise, using the UTC receipt date; unknown promises excluded.',
            numerator: onTime, denominator: measuredDelivery, rate: rate(onTime, measuredDelivery),
            late: measuredDelivery - onTime, unknownPromise: deliveryRows.length - measuredDelivery, rows: deliveryRows },
        invoiceExceptionRate: { basis: 'Distinct native invoice evidence with a recorded exception or price, quantity, receipt or closed-balance discrepancy; each invoice counts once.',
            numerator: exceptionCount, denominator: invoiceRows.length, rate: rate(exceptionCount, invoiceRows.length), rows: invoiceRows },
        poCoverage: spendMetric('Native invoice evidence linked to issued POs, by invoice currency. This is evidence coverage, not paid or approved spend.', invoiceRows, 'underPo'),
        offContract: spendMetric('Native invoice evidence whose immutable PO supplier snapshot has no contract reference. A missing snapshot is unknown; this does not verify contract compliance.', invoiceRows, 'offContract'),
        unapprovedSpend: spendMetric('Native invoice evidence without an approved decision for its PO request revision before issuance. This measures purchase approval evidence, not bill approval.', invoiceRows, 'unapproved'),
        limitations: ['Synced ledger bills and non-PO bills are not available; PO coverage, off-contract and unapproved figures cover native invoice evidence only.',
            'Invoice evidence does not establish bill approval or payment. Savings are reported separately.'],
    };
}
