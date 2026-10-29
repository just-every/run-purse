import { allocateInvoiceCharges, readingAmounts } from './invoice-amounts';
import { apportionSupplied } from './po-supplier-groups';
import type { Bindings } from '../auth.server';
import { all, audit, get, put, requireThat, text, type Actor, type Data, type State } from './types';
import { allowed, requirePermission } from './access';
import { linePosition, discrepancies } from './orders';
import { depositTermKey } from './deposit-terms';
import { confirmedDepositSource, depositApprovalEligible, liveDepositRule, nativeDepositInvoice } from './deposit-position';
import { termDates } from './payment-terms';

export function depositCommands(s: State, a: Actor, op: string, b: Data) {
    if (op === 'deposit-evaluate') {
        const invoice = get(s,'invoice',b.invoice), order = get(s,'order',invoice.order);
        requirePermission(s,a,'payable.approve',invoice);
        requireThat(nativeDepositInvoice(invoice) && !invoice.paymentApproval && b.termKey===depositTermKey(order) && b.ruleVersion===s.get('depositRule:'+order.id)?.value.version
            && b.documentSha256===invoice.document?.sha256 && confirmedDepositSource(s,invoice) && liveDepositRule(s,order), 'Current exact source and consent required',409);
        requireThat(!invoice.disputed && !invoice.exception && !invoice.flags.some((flag:Data)=>!invoice.riskReviews.some((review:Data)=>review.flag===flag.id))
            && !discrepancies(s).some(row=>row.invoiceId===invoice.id&&(row.priceMismatch||row.quantityMismatch||row.receiptShortfall||row.closedBalance||row.exception)),
            'Resolve source, receipt and risk holds before evaluation',409);
        return invoice;
    }
    if (op !== 'deposit-rule') return;
    requireThat(a.owner, 'Current native owner must consent to deposit approval', 403);
    const order = get(s, 'order', b.order), prior = s.get('depositRule:' + order.id)?.value;
    requireThat(order.status === 'issued' && !order.amendedBy && order.poDetails?.deposit && !order.imported && !order.adoption,
        'Current ordinary issued PO with frozen deposit terms required', 409);
    requireThat(b.revision === order.revision && b.version === (prior?.version ?? 0) && b.termKey === depositTermKey(order), 'Deposit terms or rule changed; reload', 409);
    requireThat(b.consent === true && typeof b.enabled === 'boolean', 'Explicit exact-term owner consent required');
    const entry = { order: order.id, revision: order.revision, version: (prior?.version ?? 0) + 1, termKey: depositTermKey(order),
        enabled: b.enabled, actor: a.id, operatorVersion: a.version, at: new Date().toISOString(), reason: text(b.reason, 'Deposit approval consent reason') };
    put(s, 'depositRule', order.id, { ...entry, history: [...(prior?.history ?? []), entry] });
    put(s, 'nativeDepositAuthority', order.id, entry);
    audit(s, a, op, order.id, entry);
    return entry;
}

/** Capturing an AP-classified original creates no approval, receiving or settlement. */
export function prepareNativeDeposit(s: State, order: Data, candidate: Data, input: Data, confirmation?: { reading: string }) {
    const kind = input.invoiceKind;
    if (!kind && !order.poDetails?.deposit) return;
    requireThat(confirmation && (kind === 'deposit' || kind === 'deposit-final'),
        'Classify deposit or final bill while confirming its private source reading', 409);
    requireThat(order.status === 'issued' && order.poDetails?.deposit && !order.imported && !order.adoption && !order.supplierGroup && !order.recurring,
        'Current ordinary native goods deposit PO required', 409);
    const reading = get(s, 'invoiceReading', confirmation.reading), term = order.poDetails.deposit;
    requireThat(reading.order === order.id && reading.status === 'review', 'Current source-bound reading required', 409);
    Object.assign(candidate, { depositKind: kind, depositTerm: structuredClone(term), depositTermKey: depositTermKey(order) });
    if (kind === 'deposit') {
        const amounts=apportionSupplied(candidate.totalMinor,order.lines.map((line:Data)=>line.totalMinor));
        candidate.allocations = order.lines.map((line:Data,index:number) => ({line:line.id, q:0, quantity:'0', amountMinor:amounts[index], orderedMinor:amounts[index],receivedQ:0,...(order.intakeForm?{customFields:structuredClone(line.customFields),sourceOrderRevision:order.revision}:{})}));
        return;
    }
    const sourceAmounts=readingAmounts(reading), expected=allocateInvoiceCharges(order.lines.map((line:Data)=>({line:line.id,amountMinor:line.totalMinor})),order.freightMinor+order.taxMinor+(order.otherChargesMinor??0));
    requireThat(candidate.totalMinor === order.totalMinor && candidate.allocations.length === order.lines.length
        && sourceAmounts.freightMinor===order.freightMinor+(order.otherChargesMinor??0) && sourceAmounts.taxMinor===order.taxMinor
        && candidate.allocations.every((line: Data) => { const original = order.lines.find((item: Data) => item.id === line.line); return original && original.q === line.q && line.amountMinor === expected.find(item=>item.line===line.line)?.amountMinor; }),
        'Final bill must match the complete gross goods value, charges and quantities exactly', 409);
    candidate.allocations=candidate.allocations.map((line:Data)=>({...line,orderedMinor:expected.find(item=>item.line===line.line)!.amountMinor}));
    const deposits = all(s, 'invoice').filter(invoice => invoice.order === order.id && invoice.depositKind === 'deposit' && depositApprovalEligible(s, invoice));
    requireThat(deposits.length === 1 && deposits[0].totalMinor === term.amountMinor, 'One currently eligible approved deposit obligation required', 409);
    requireThat(!all(s, 'depositApplication').some(row => row.depositInvoice === deposits[0].id)
        || all(s, 'invoice').some(invoice => invoice.order === order.id && invoice.reference === candidate.reference && invoice.nativeDepositInvoice === deposits[0].id),
    'Deposit obligation has already been applied', 409);
    Object.assign(candidate, { grossMinor: candidate.totalMinor, depositAppliedMinor: term.amountMinor,
        nativeDepositInvoice: deposits[0].id, totalMinor: candidate.totalMinor - term.amountMinor });
}

export async function approveNativeDeposits(env: Bindings, s: State, a: Actor) {
    for (const invoice of all(s, 'invoice')) {
        if (!nativeDepositInvoice(invoice) || invoice.paymentApproval || !allowed(s, a, 'payable.approve', invoice)
            || !confirmedDepositSource(s, invoice) || invoice.disputed || invoice.exception || invoice.flags.some((flag: Data) => !(invoice.riskReviews ?? []).some((review: Data) => review.flag === flag.id))) continue;
        const order = get(s, 'order', invoice.order), rule = liveDepositRule(s, order);
        if (!rule || invoice.depositTermKey !== depositTermKey(order)) continue;
        // The installation table is not archived. The SQL write fence rechecks this proof atomically.
        if (!await env.DB.prepare("SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active'").bind(rule.actor, rule.operatorVersion).first()) continue;
        const prior = all(s, 'invoice').filter(other => other.order === order.id && other.id !== invoice.id && other.paymentApproval);
        if (invoice.depositKind === 'deposit') {
            if (invoice.totalMinor !== order.poDetails.deposit.amountMinor || prior.some(other => other.depositKind === 'deposit')) continue;
        } else {
            const deposit = get(s, 'invoice', invoice.nativeDepositInvoice);
            if (!depositApprovalEligible(s, deposit) || all(s, 'depositApplication').some(row => row.depositInvoice === deposit.id)
                || order.lines.some((line: Data) => linePosition(s, order.id, line).accepted !== line.q)
                || discrepancies(s).some(row => row.invoiceId === invoice.id && (row.priceMismatch || row.quantityMismatch || row.receiptShortfall || row.closedBalance || row.exception))) continue;
        }
        const term = order.poDetails.deposit, due = invoice.depositKind === 'deposit' ? (term.trigger === 'date' ? term.dueDate : order.issuedAt.slice(0, 10)) : invoice.invoiceDate;
        const sourceTerms = get(s,'invoiceReading',invoice.confirmedReading).terms?.value;
        if(invoice.depositKind==='deposit-final' && !['Net 15','Net 30','Net 60','2/10 Net 30','Due on receipt'].includes(sourceTerms)) continue;
        const at = new Date().toISOString(), entry = { invoice: invoice.id, order: order.id, revision: order.revision, ruleVersion: rule.version,
            termKey: depositTermKey(order), owner: rule.actor, operatorVersion: rule.operatorVersion, documentSha256: invoice.document.sha256,
            reading: invoice.confirmedReading, amountMinor: invoice.totalMinor, currency: invoice.currency, actor: a.id, at,
            match: invoice.depositKind === 'deposit' ? 'deposit-two-way' : 'deposit-final-three-way' };
        if(invoice.depositKind==='deposit-final') {
            put(s,'depositApplication',invoice.id,{order:order.id,invoice:invoice.id,depositInvoice:invoice.nativeDepositInvoice,amountMinor:invoice.depositAppliedMinor,currency:invoice.currency,termKey:depositTermKey(order),actor:a.id,at});
            audit(s,a,'deposit-application',invoice.id,{order:order.id,invoice:invoice.id,depositInvoice:invoice.nativeDepositInvoice,amountMinor:invoice.depositAppliedMinor});
        }
        put(s, 'invoice', invoice.id, { ...invoice, paymentApproval: entry });
        const history = { ...termDates(due, invoice.depositKind === 'deposit' ? 'Due on receipt' : sourceTerms), reason: 'Exact source-confirmed native deposit approval', actor: a.id, at, version: 1 };
        put(s, 'payable', invoice.id, { invoice: invoice.id, ...history, history: [history], version: 2, approvedAt: at, approvedBy: a.id, approvalReason: history.reason, approvedMinor: invoice.totalMinor });
        audit(s, a, 'deposit-invoice-approved', invoice.id, entry);
    }
}
