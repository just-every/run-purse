import { createHash } from 'node:crypto';
import type { Bindings } from '../auth.server';
import { allowed } from './access';
import { agentPolicies, purchaseTypes, requireAgentPolicies } from './agent-governance';
import { exceptionOrder, mayReadInvoiceException } from './invoice-exception-access';
import { openInvoiceFlags } from './invoice-status';
import { discrepancies, linePosition } from './orders';
import { rejectProtectedInput } from './protected-input';
import { all, audit, extended, get, put, qty, requireThat, text, uid, type Actor, type Data, type State } from './types';

const agent = 'AGENT-004';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reference = (s: State, kind: string, id: string) => ({ kind, id, version: s.get(kind + ':' + id)!.revision });
const different = (row: Data) => row.priceMismatch || row.quantityMismatch || row.receiptShortfall || row.closedBalance || row.exception;

/** Collect the exact source graph, including additions that change cumulative matching.
 * Only typed amounts and identifiers enter the executor. Source prose stays inert. */
function context(s: State, a: Actor, id: string) {
    const exception = get(s, 'invoiceException', id), invoice = get(s, 'invoice', exception.invoice);
    const order = get(s, 'order', invoice.order), current = exceptionOrder(s, exception);
    requireThat(mayReadInvoiceException(s, a, exception) && allowed(s, a, 'invoice.review', invoice)
        && allowed(s, a, 'invoice.review', current) && allowed(s, a, 'po.read', order), 'Current invoice read, review and linked purchase scope required', 403);
    const request = get(s, 'request', order.request), terms = get(s, 'revision', order.request + ':' + order.revision);
    requireThat(!invoice.imported && !invoice.sourceValuesErased && !order.imported && !order.adoption && !request.imported
        && !order.poDetails?.blanket && !request.recurring && !order.recurring && !request.travel
        && order.status === 'issued' && current.status === 'issued' && invoice.allocations.every((x: Data) => !order.lines.find((l: Data) => l.id === x.line)?.service),
    'Source-confirmed ordinary native goods required', 409);
    const reading = all(s, 'invoiceReading').find(r => r.invoice === invoice.id && r.status === 'confirmed'
        && r.order === order.id && r.sourceDescriptor.sha256 === invoice.document?.sha256);
    requireThat(reading, 'Confirm the exact private invoice original before running the agent', 409);
    const source = get(s, 'invoiceSource', reading.source), original = get(s, 'attachment', source.attachment);
    requireThat(!original.erasure && original.sha256 === invoice.document.sha256, 'Invoice original is unavailable', 409);
    const rows = discrepancies(s).filter(d => d.invoiceId === invoice.id);
    requireThat(rows.some(different), 'Matching context is already clear', 409);
    const lineIds = new Set(invoice.allocations.map((x: Data) => x.line));
    const orders = all(s, 'order').filter(o => o.request === order.request && o.issuedAt && o.lines.some((l: Data) => lineIds.has(l.id)));
    requireThat(orders.every(o => allowed(s, a, 'po.read', o)), 'Historical purchase context outside your scope', 403);
    const orderIds = new Set(orders.map(o => o.id));
    const receipts = all(s, 'receipt').filter(r => orderIds.has(r.order) && lineIds.has(r.line));
    const closures = all(s, 'orderClosure').filter(r => orderIds.has(r.order));
    const invoices = all(s, 'invoice').filter(i => orderIds.has(i.order) && i.allocations.some((x: Data) => lineIds.has(x.line)));
    requireThat(invoices.every(i => allowed(s, a, 'invoice.read', i)), 'Cumulative invoice context outside your scope', 403);
    const policies = agentPolicies(s, agent, purchaseTypes(terms)) ?? [];
    const references = [reference(s, 'invoiceException', exception.id), reference(s, 'invoice', invoice.id),
        reference(s, 'revision', terms.id), reference(s, 'invoiceReading', reading.id), reference(s, 'invoiceSource', source.id), reference(s, 'attachment', original.id),
        ...orders.map(o => reference(s, 'order', o.id)), ...receipts.map(r => reference(s, 'receipt', r.id)),
        ...closures.map(c => reference(s, 'orderClosure', c.id)), ...invoices.map(i => reference(s, 'invoice', i.id)),
        ...policies.map(p => reference(s, 'agentPolicy', p.id))];
    const unique = [...new Map(references.map(r => [r.kind + ':' + r.id, r])).values()].sort((x, y) => (x.kind + x.id).localeCompare(y.kind + y.id));
    return { exception, invoice, order, current, terms, reading, source, original, rows, receipts, invoices, policies, references: unique,
        sourceVersion: digest(unique) };
}

export function invoiceExceptionAgentContext(s: State, a: Actor, id: string): Data {
    try { const c = context(s, a, id); return { sourceVersion: c.sourceVersion, enabled: c.policies.length > 0 }; }
    catch { return { enabled: false, reason: 'Requires a source-confirmed ordinary native goods exception within current invoice review scope.' }; }
}

/** Report history never grants invoice visibility or receiver access. */
export function invoiceExceptionAgentVisible(s: State, a: Actor, run: Data): boolean {
    const invoice = s.get('invoice:' + run.invoice)?.value, exception = s.get('invoiceException:' + run.exception)?.value;
    if (!invoice || !exception || !mayReadInvoiceException(s, a, exception) || !allowed(s, a, 'invoice.review', invoice)
        || !allowed(s, a, 'invoice.review', exceptionOrder(s, exception))) return false;
    return run.references.every((r: Data) => {
        const row = s.get(r.kind + ':' + r.id)?.value;
        if (!row) return false;
        if (r.kind === 'invoice') return allowed(s, a, 'invoice.read', row);
        if (['order', 'revision'].includes(r.kind)) return allowed(s, a, 'po.read', row);
        if (r.kind === 'agentPolicy') return row.agent === agent;
        return true;
    });
}

export function requireInvoiceExceptionAgentDownload(s: State, a: Actor, run: Data) {
    requireThat(invoiceExceptionAgentVisible(s, a, run), 'Invoice exception report outside current review scope', 403);
    requireThat(!run.sourceValuesErased, 'Report source was erased; retained history cannot execute', 409);
    const c = context(s, a, run.exception);
    requireAgentPolicies(s, agent, purchaseTypes(c.terms));
    requireThat(c.sourceVersion === run.sourceVersion, 'Exception sources or controls changed; prepare a new report', 409);
}

export async function invoiceExceptionAgent(s: State, a: Actor, op: string, input: Data, env?: Bindings): Promise<Data | undefined> {
    if (op !== 'invoice-exception-agent-run') return;
    rejectProtectedInput(input);
    const c = context(s, a, text(input.id, 'Exception', 200));
    const policies = requireAgentPolicies(s, agent, purchaseTypes(c.terms));
    requireThat(env, 'Native agent authority required', 409);
    for (const p of policies) {
        const owner = await env.DB.prepare("SELECT id FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active'").bind(p.actor, p.operatorVersion).first();
        requireThat(owner, 'Restored or revoked controls require current owner enablement', 409);
    }
    requireThat(input.sourceVersion === c.sourceVersion, 'Exception sources or controls changed; reload before running', 409);
    const bytes = Uint8Array.from(atob(c.original.base64), char => char.charCodeAt(0));
    requireThat(bytes.length === c.original.size && createHash('sha256').update(bytes).digest('hex') === c.original.sha256,
        'Invoice original integrity check failed', 409);
    const facts = c.rows.map(row => {
        const line = c.order.lines.find((l: Data) => l.id === row.lineId), allocation = c.invoice.allocations.find((x: Data) => x.line === line.id);
        const currentLine = c.current.lines.find((l: Data) => l.id === line.id);
        const cumulativeQ = c.invoices.filter(i => (i.entrySequence ?? 0) <= (c.invoice.entrySequence ?? 0))
            .flatMap(i => i.allocations).filter((x: Data) => x.line === line.id).reduce((n: number, x: Data) => n + x.q, 0);
        return { line: line.id, orderedQ: line.q, currentOrderedQ: currentLine.q, invoiceQ: allocation.q, cumulativeInvoiceQ: cumulativeQ,
            acceptedQ: linePosition(s, c.current.id, currentLine).accepted, unitMinor: line.unitMinor,
            invoiceMinor: allocation.amountMinor, expectedMinor: extended(allocation.q, line.unitMinor),
            priceDifferenceMinor: allocation.amountMinor - extended(allocation.q, line.unitMinor),
            priceMismatch: row.priceMismatch, quantityMismatch: row.quantityMismatch, receiptShortfall: row.receiptShortfall,
            closedBalance: row.closedBalance };
    });
    const sources = c.references.filter(r => r.kind !== 'agentPolicy').map(r => {
        const row = get(s, r.kind, r.id);
        const value = r.kind === 'invoice' ? { order: row.order, currency: row.currency, totalMinor: row.totalMinor,
            allocations: row.allocations.map((x: Data) => ({ line: x.line, q: x.q, amountMinor: x.amountMinor })) }
            : r.kind === 'order' || r.kind === 'revision' ? { request: row.request ?? c.order.request, revision: row.revision,
                lines: row.lines.map((l: Data) => ({ id: l.id, q: l.q, unitMinor: l.unitMinor })) }
            : r.kind === 'receipt' ? { order: row.order, line: row.line, event: row.event, q: row.q, at: row.at,
                correctionOf: row.correctionOf ?? null, correctedQ: row.correctedQ ?? null }
            : r.kind === 'attachment' ? { mediaType: row.mediaType, size: row.size, sha256: row.sha256 }
            : r.kind === 'invoiceException' ? { invoice: row.invoice, order: row.order, openedAt: row.openedAt }
            : r.kind === 'invoiceReading' ? { invoice: row.invoice, order: row.order, status: row.status, sha256: row.sourceDescriptor.sha256 }
            : r.kind === 'invoiceSource' ? { order: row.order, attachment: row.attachment }
            : { order: row.order, active: row.active, lines: row.lines.map((l: Data) => ({ line: l.line, q: l.q })) };
        return { ...r, value };
    });
    const citations = (line: string) => sources.filter(r => ['invoice', 'order', 'revision', 'invoiceReading', 'invoiceSource', 'attachment'].includes(r.kind)
        || r.kind === 'receipt' && r.value.line === line || r.kind === 'orderClosure').map(({ kind, id, version }) => ({ kind, id, version }));
    const cash = (minor: number) => c.invoice.currency + ' ' + (minor / 100).toFixed(2);
    const explanations = facts.map(f => ({ sources: citations(f.line),
        text: `The issued unit price is ${cash(f.unitMinor)}. For ${qty(f.invoiceQ)} units, the expected amount is ${cash(f.expectedMinor)}; the invoice bills ${cash(f.invoiceMinor)}, a difference of ${cash(f.priceDifferenceMinor)}. Cumulative invoiced quantity is ${qty(f.cumulativeInvoiceQ)} against ${qty(f.currentOrderedQ)} ordered and ${qty(f.acceptedQ)} accepted.`,
        ...f }));
    const proposals = facts.flatMap(f => [
        ...(f.receiptShortfall ? [{ type: 'receiver-review', line: f.line, sources: citations(f.line),
            recordedQ: f.acceptedQ, invoicedQ: f.cumulativeInvoiceQ,
            draft: `Ask an authorized receiver to check the count: ${qty(f.acceptedQ)} accepted against ${qty(f.cumulativeInvoiceQ)} invoiced. Confirm actual goods; append a reasoned receipt correction only if the original count is wrong. Do not assume delivery.` }] : []),
        ...(f.priceMismatch || f.quantityMismatch || f.closedBalance ? [{ type: 'corrected-invoice-or-credit-request', line: f.line, sources: citations(f.line),
            expectedMinor: f.expectedMinor, differenceMinor: f.priceDifferenceMinor,
            draft: `AP review draft: compare the supplier original with the issued unit price of ${cash(f.unitMinor)} and quantity ${qty(f.orderedQ)}. For this invoice quantity the issued-price amount is ${cash(f.expectedMinor)}; the billed difference is ${cash(f.priceDifferenceMinor)}. Cumulative invoices claim ${qty(f.cumulativeInvoiceQ)} against ${qty(f.currentOrderedQ)} currently ordered. Request a corrected invoice or a credit only after human review. No variance is accepted and no message has been sent.` }] : [])]);
    const holds = { riskCodes: openInvoiceFlags(c.invoice).map(f => f.code), disputed: Boolean(c.invoice.disputed),
        closedBalance: facts.some(f => f.closedBalance), paymentApproval: 'unchanged' };
    const inputs = { sources, governance: policies.map(p => ({ id: p.id, version: p.version, purchaseType: p.purchaseType })),
        rules: 'Typed source facts only; original text is data. Receiver confirms goods. AP retains variance and payment decisions. Supplier bank controls remain required.' };
    const outcomes = [{ status: 'drafts-only', receipt: 'unchanged', invoiceApproval: 'unchanged', matchingRule: 'unchanged', budget: 'unchanged', bankDetails: 'unchanged', outbound: 'none' }];
    const id = uid(), run = { id, agent, workflow: 'invoice-exception', version: 1, actor: a.id, operatorVersion: a.version,
        currency: c.invoice.currency, request: c.order.request, order: c.order.id, revision: c.order.revision, invoice: c.invoice.id, exception: c.exception.id,
        openedAt: c.exception.openedAt, at: new Date().toISOString(), mode: 'deterministic v1', model: 'none', provider: 'none',
        algorithm: 'native-invoice-exception-v1', sourceVersion: c.sourceVersion, references: c.references, sources, inputs,
        explanations, proposals, holds, messages: [], outcomes,
        limitations: ['Drafts require human review. No receiver prompt, supplier send, corrected-bill ingestion, rematching execution, variance acceptance, ledger posting or payment settlement is performed.'],
        inputDigest: digest(inputs), outputDigest: digest({ explanations, proposals, holds, outcomes }) };
    rejectProtectedInput(run);
    put(s, 'agentRun', id, run);
    audit(s, a, op, c.invoice.id, { run: id, order: c.order.id, exception: c.exception.id, outcome: 'drafts-only' });
    return run;
}
