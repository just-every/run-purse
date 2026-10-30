import { createHash } from 'node:crypto';
import { erasedSourceFact } from '../../src/purse/erasure-journal.mjs';
import { containsProtectedInput } from '../../src/purse/protected-context-fields.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const kinds = new Set(['invoiceException', 'invoice', 'order', 'revision', 'receipt', 'orderClosure', 'invoiceReading', 'invoiceSource', 'attachment', 'agentPolicy']);
const sameRef = (a, b) => a.kind === b.kind && a.id === b.id && a.version === b.version;

/** Validate retained evidence without treating archived controls as native authority. */
export function validateInvoiceExceptionAgent(all, get, check) {
    for (const run of all('agentRun').filter(r => r.agent === 'AGENT-004')) {
        const invoice = get('invoice', run.invoice), order = get('order', run.order), exception = get('invoiceException', run.exception);
        check(run.workflow === 'invoice-exception' && run.version === 1 && run.mode === 'deterministic v1' && run.model === 'none' && run.provider === 'none'
            && run.algorithm === 'native-invoice-exception-v1' && !containsProtectedInput(run) && Number.isFinite(Date.parse(run.at)), 'exception_agent_execution');
        check(run.currency === invoice.currency && invoice.order === order.id && exception.invoice === invoice.id && run.request === order.request && run.revision === order.revision
            && run.openedAt === exception.openedAt, 'exception_agent_lineage');
        check(run.sourceValuesErased ? erasedSourceFact(all, 'agentRun', run.id, run)
            : run.inputDigest === digest(run.inputs) && run.outputDigest === digest({ explanations: run.explanations, proposals: run.proposals, holds: run.holds, outcomes: run.outcomes }), 'exception_agent_digest');
        check(Array.isArray(run.references) && run.references.length > 0 && run.references.every(r => kinds.has(r.kind) && typeof r.version === 'string'), 'exception_agent_references');
        for (const ref of run.references) get(ref.kind, ref.id);
        check(run.sourceVersion === digest(run.references), 'exception_agent_source_version');
        check(JSON.stringify(run.sources) === JSON.stringify(run.inputs.sources) && run.sources.every(source => run.references.some(ref => sameRef(ref, source))), 'exception_agent_sources');
        for (const source of run.sources) {
            check(kinds.has(source.kind) && source.kind !== 'agentPolicy' && source.value && !Object.hasOwn(source.value, 'base64')
                && !Object.hasOwn(source.value, 'remit') && !Object.hasOwn(source.value, 'sender'), 'exception_agent_safe_source');
        }
        check(run.explanations.length > 0 && run.explanations.length === invoice.allocations.length, 'exception_agent_explanations');
        for (const row of [...run.explanations, ...run.proposals]) {
            check(invoice.allocations.some(x => x.line === row.line) && Array.isArray(row.sources) && row.sources.length > 0
                && row.sources.every(r => run.sources.some(source => sameRef(source, r))), 'exception_agent_citations');
        }
        for (const row of run.explanations) check(Number.isSafeInteger(row.priceDifferenceMinor) && row.priceDifferenceMinor === row.invoiceMinor - row.expectedMinor
            && row.expectedMinor === Number((BigInt(row.invoiceQ) * BigInt(row.unitMinor) + 500n) / 1000n), 'exception_agent_calculation');
        check(run.proposals.every(p => ['receiver-review', 'corrected-invoice-or-credit-request'].includes(p.type) && !p.action && !p.input), 'exception_agent_drafts');
        check(run.messages.length === 0 && run.outcomes.length === 1 && run.outcomes[0].status === 'drafts-only' && run.outcomes[0].outbound === 'none'
            && ['receipt', 'invoiceApproval', 'matchingRule', 'budget', 'bankDetails'].every(field => run.outcomes[0][field] === 'unchanged'), 'exception_agent_nonbinding');
    }
}
