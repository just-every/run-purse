import type { Bindings } from '../auth.server';
import { allowed, requirePermission } from './access';
import { currentOrderSender } from './order-response';
import { openInvoiceFlags } from './invoice-status';
import { requireSupplierInvoiceOrder } from './supplier-invoice';
import { discrepancies } from './orders';
import { all, audit, date, get, put, requireThat, text, type Actor, type Data, type State } from './types';

/** A native approval and date instruction never claims that a provider moved funds. */
export function supplierInvoiceMatched(s: State, invoice: Data): boolean {
    if (!invoice.supplierSubmission || invoice.sourceConfirmation !== 'confirmed' || invoice.sourceValuesErased || invoice.erasure || invoice.exception || invoice.disputed || openInvoiceFlags(invoice).length) return false;
    const source = get(s, 'supplierInvoiceSubmission', invoice.supplierSubmission);
    const attachment = all(s, 'attachment').find(file => file.record === source.source && file.sha256 === invoice.document?.sha256 && file.base64 && !file.erasure && !file.erased);
    const order = get(s, 'order', invoice.order), subtotal = order.lines.reduce((sum: number, line: Data) => sum + line.totalMinor, 0);
    const share = (amount: number) => subtotal ? Number((BigInt(amount) * BigInt(source.subtotalMinor) + BigInt(subtotal) / 2n) / BigInt(subtotal)) : 0;
    const chargesMatch = source.freightMinor <= share(order.freightMinor) && source.taxMinor <= share(order.taxMinor);
    return Boolean(attachment) && chargesMatch && source.lines.every((line: Data) => line.invoiceUnitMinor === line.unitMinor)
        && !discrepancies(s).filter(row => row.invoiceId === invoice.id).some(row => row.quantityMismatch || row.receiptShortfall || row.closedBalance || row.exception);
}

async function liveRule(env: Bindings, s: State, event: Data): Promise<boolean> {
    const rule = event.invoiceApprovalRule;
    if (!rule?.enabled || rule.invoiceConsentVersion !== event.invoiceConsent?.version) return false;
    try { requireSupplierInvoiceOrder(s, event); } catch { return false; }
    return Boolean(await env.DB.prepare("SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active' AND role='owner'").bind(rule.actor, rule.operatorVersion).first())
        && Boolean(await env.DB.prepare('SELECT 1 FROM p_order_send_links WHERE send=? AND revoked_at IS NULL AND expires_at>?').bind(event.id, Date.now()).first())
        && await currentOrderSender(env, s, event);
}

export async function supplierInvoiceApproval(s: State, a: Actor, op: string, b: Data, env?: Bindings): Promise<Data | undefined> {
    if (!['supplier-invoice-rule', 'supplier-invoice-schedule'].includes(op)) return;
    requireThat(env, 'Native installation required', 409);
    if (op === 'supplier-invoice-rule') {
        requireThat(a.owner, 'Current native owner must consent to automatic invoice approval', 403);
        const order = get(s, 'order', b.order), event = get(s, 'orderSend', 'order-send:' + order.id);
        requireThat(b.revision === order.revision && b.version === (event.invoiceApprovalRule?.version ?? 0), 'Order or approval rule changed; reload', 409);
        requireThat(typeof b.enabled === 'boolean' && b.consent === true, 'Explicit standing approval consent required');
        if (b.enabled) {
            requireSupplierInvoiceOrder(s, event);
            requireThat(await currentOrderSender(env, s, event), 'Current purchasing authority required', 409);
            requireThat(event.invoiceConsent.actor === a.id && event.invoiceConsent.operatorVersion === a.version, 'Renew exact supplier invoice access as the current owner first', 409);
        }
        const entry = { version: (event.invoiceApprovalRule?.version ?? 0) + 1, enabled: b.enabled, order: order.id, revision: order.revision, send: event.id, invoiceConsentVersion: event.invoiceConsent?.version ?? 0, pdfSha256: event.pdf.sha256, actor: a.id, operatorVersion: a.version, reason: text(b.reason, 'Standing approval reason'), at: new Date().toISOString() };
        put(s, 'orderSend', event.id, { ...event, invoiceApprovalRule: entry, invoiceApprovalRuleHistory: [...(event.invoiceApprovalRuleHistory ?? []), entry] });
        audit(s, a, op, order.id, entry);
        return entry;
    }
    const invoice = get(s, 'invoice', b.invoice);
    requirePermission(s, a, 'payable.approve', invoice);
    const approval = invoice.paymentApproval, source = get(s, 'supplierInvoiceSubmission', invoice.supplierSubmission), event = get(s, 'orderSend', source.send);
    requireThat(b.version === (invoice.paymentSchedule?.version ?? 0), 'Payment schedule changed; reload', 409);
    requireThat(approval && supplierInvoiceMatched(s, invoice) && await liveRule(env, s, event), 'Current matched payment approval without unresolved holds required', 409);
    requireThat(!invoice.paymentSchedule, 'A scheduled invoice cannot be scheduled twice', 409);
    const entry = { version: 1, invoice: invoice.id, date: date(b.date, 'Scheduled payment date'), reason: text(b.reason, 'Scheduling reason'), actor: a.id, at: new Date().toISOString(), approvalAt: approval.at, basis: 'native-payment-instruction' };
    put(s, 'invoice', invoice.id, { ...invoice, paymentSchedule: entry });
    audit(s, a, op, invoice.id, entry);
    return entry;
}

/** Only a native AP action can advance confirmed evidence under the owner's exact rule. */
export async function approveMatchedSupplierInvoices(env: Bindings, s: State, a: Actor) {
    for (const invoice of all(s, 'invoice')) {
        if (invoice.paymentApproval || !allowed(s, a, 'payable.approve', invoice) || !supplierInvoiceMatched(s, invoice)) continue;
        const source = get(s, 'supplierInvoiceSubmission', invoice.supplierSubmission), event = get(s, 'orderSend', source.send);
        if (!await liveRule(env, s, event)) continue;
        const rule = event.invoiceApprovalRule, entry = { invoice: invoice.id, order: invoice.order, revision: source.revision, send: event.id, ruleVersion: rule.version, owner: rule.actor, operatorVersion: rule.operatorVersion, documentSha256: invoice.document.sha256, reading: invoice.confirmedReading, amountMinor: invoice.totalMinor, currency: invoice.currency, actor: a.id, at: new Date().toISOString(), match: 'three-way' };
        put(s, 'invoice', invoice.id, { ...invoice, paymentApproval: entry });
        audit(s, a, 'supplier-invoice-approved', invoice.id, entry);
    }
}
