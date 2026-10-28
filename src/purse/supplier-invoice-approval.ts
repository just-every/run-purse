import type { Bindings } from '../auth.server';
import { currentDecision } from './approval';
import { currentOrderSender } from './order-response';
import { requireSupplierInvoiceOrder } from './supplier-invoice';
import { openInvoiceFlags } from './invoice-status';
import { discrepancies } from './orders';
import { termDates } from './payment-terms';
import { all, audit, date, get, put, requirePermission, requireThat, text, type Actor, type Data, type State } from './types';

/** A native approval is not a provider payment. Every use rechecks its holds. */
export function supplierPaymentEligible(s: State, invoice: Data) {
    const source = s.get('supplierInvoiceSubmission:' + invoice.supplierSubmission)?.value;
    const original = source && s.get('invoiceSource:' + source.source)?.value;
    const attachment = original && s.get('attachment:' + original.attachment)?.value;
    return Boolean(source && invoice.sourceConfirmation === 'confirmed' && !invoice.erasure && !invoice.sourceValuesErased
        && attachment?.base64 && !attachment.erasure && attachment.sha256 === invoice.document?.sha256
        && !openInvoiceFlags(invoice).length && !invoice.exception
        && !discrepancies(s).filter(row => row.invoiceId === invoice.id).some(row => row.priceMismatch || row.quantityMismatch || row.receiptShortfall || row.closedBalance || row.exception));
}

async function currentRule(s: State, env: Bindings, invoice: Data) {
    const source = get(s, 'supplierInvoiceSubmission', invoice.supplierSubmission), event = get(s, 'orderSend', source.send);
    requireSupplierInvoiceOrder(s, event);
    const consent = event.invoiceConsent;
    requireThat(consent.automaticApproval === true && source.invoiceConsentVersion === consent.version,
        'Renewed owner consent for this exact invoice submission rule is required', 409);
    requireThat(await currentOrderSender(env, s, event), 'Supplier link issuer or approval authority changed', 409);
    requireThat(await env.DB.prepare("SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role='owner'").bind(consent.actor, consent.operatorVersion).first(), 'Invoice rule owner changed; renew consent', 409);
    requireThat(await env.DB.prepare('SELECT 1 FROM p_order_send_links WHERE send=? AND revoked_at IS NULL AND expires_at>?').bind(event.id, Date.now()).first(), 'Invoice link is unavailable; no new approval or schedule', 409);
    const decision = currentDecision(s, get(s, 'request', event.request));
    return { event, consent, proofs: [{ actor: consent.actor, version: consent.operatorVersion, owner: true }, { actor: event.actor, version: event.operatorVersion }, ...(decision.chainProofs ?? [{ actor: decision.actor, version: decision.operatorVersion }])] };
}

async function approve(s: State, a: Actor, env: Bindings, invoice: Data) {
    const rule = await currentRule(s, env, invoice);
    requireThat(supplierPaymentEligible(s, invoice), 'Confirm the private original and resolve all invoice risk and three-way discrepancies before payment approval', 409);
    const old = s.get('payable:' + invoice.id)?.value;
    if (old?.supplierApproval) return old;
    requireThat(!old?.approvedAt, 'Existing cash-planning approval requires separate review', 409);
    const at = new Date().toISOString(), order = get(s, 'order', invoice.order);
    const terms = old ?? { invoice: invoice.id, ...termDates(invoice.invoiceDate, rule.consent.paymentTerm), version: 1,
        reason: 'Exact PO supplier invoice standing rule', actor: rule.consent.actor, at };
    const approval = { send: rule.event.id, consentVersion: rule.consent.version, orderRevision: order.revision,
        source: invoice.supplierSource, reading: invoice.confirmedReading, documentSha256: invoice.document.sha256,
        approvedMinor: invoice.totalMinor, riskVersion: invoice.riskVersion,
        receipts: all(s, 'receipt').filter(receipt => receipt.order === order.id).map(receipt => receipt.id),
        actor: rule.consent.actor, operatorVersion: rule.consent.operatorVersion, authorityProofs: rule.proofs, at };
    put(s, 'payable', invoice.id, { ...terms, history: old?.history ?? [terms], version: terms.version + 1,
        approvedAt: at, approvedBy: rule.consent.actor, approvalReason: 'Owner-consented exact three-way supplier invoice rule', approvedMinor: invoice.totalMinor, supplierApproval: approval });
    audit(s, a, 'supplier-invoice-approved', invoice.id, { ...approval, triggeredBy: a.id });
    return get(s, 'payable', invoice.id);
}

export async function supplierInvoicePayment(s: State, a: Actor, op: string, b: Data, env?: Bindings) {
    if (!['approve-supplier-invoice', 'schedule-supplier-invoice'].includes(op)) return;
    requirePermission(s, a, 'payable.approve');
    const invoice = get(s, 'invoice', b.invoice); requirePermission(s, a, 'payable.approve', invoice);
    requireThat(env && invoice.supplierSubmission, 'Native supplier invoice required', 409);
    const payable = await approve(s, a, env, invoice);
    if (op === 'approve-supplier-invoice') return payable;
    requireThat(a.owner, 'Current native owner required to schedule a supplier invoice', 403);
    requireThat(b.consent === true && b.version === payable.version && b.documentSha256 === invoice.document.sha256,
        'Consent to the exact approved invoice and current version is required', 409);
    const scheduledDate = date(b.scheduledDate, 'Scheduled payment date'), reason = text(b.reason, 'Schedule reason');
    const existing = invoice.supplierPaymentSchedule;
    if (existing) { requireThat(existing.scheduledDate === scheduledDate && existing.reason === reason, 'A payment schedule already exists; review it instead of replacing it', 409); return existing; }
    const schedule = { invoice: invoice.id, payableVersion: payable.version, documentSha256: invoice.document.sha256, scheduledDate, reason, actor: a.id, operatorVersion: a.version, at: new Date().toISOString(), execution: 'native-instruction-only' };
    put(s, 'invoice', invoice.id, { ...invoice, supplierPaymentSchedule: schedule });
    audit(s, a, op, invoice.id, schedule);
    return schedule;
}

/** Confirming a source or clearing its last hold applies the standing rule once. */
export async function reconcileSupplierInvoices(s: State, a: Actor, op: string, env?: Bindings) {
    if (!env || !['invoice-reading-confirm', 'invoice-risk-review', 'receipt'].includes(op)) return;
    for (const invoice of all(s, 'invoice').filter(invoice => invoice.supplierSubmission && invoice.sourceConfirmation === 'confirmed')) {
        if (s.get('payable:' + invoice.id)?.value.approvedAt || !supplierPaymentEligible(s, invoice)) continue;
        const event = s.get('orderSend:' + get(s, 'supplierInvoiceSubmission', invoice.supplierSubmission).send)?.value;
        if (!event?.invoiceConsent?.automaticApproval) continue;
        // A paused rule leaves evidence pending; it never grants fallback authority.
        try { await currentRule(s, env, invoice); } catch { continue; }
        await approve(s, a, env, invoice);
    }
}
