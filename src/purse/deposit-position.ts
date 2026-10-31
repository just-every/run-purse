import { all, get, type Data, type State } from './types';
import { openInvoiceFlags } from './invoice-status';
import { depositTermKey } from './deposit-terms';

export const nativeDepositInvoice = (invoice: Data) => ['deposit', 'deposit-final'].includes(invoice.depositKind);
export function liveDepositRule(s: State, order: Data) {
    const rule = s.get('depositRule:' + order.id)?.value, authority = s.get('nativeDepositAuthority:' + order.id)?.value;
    return rule?.enabled && !rule.erasure && authority?.version === rule.version && authority?.actor === rule.actor
        && authority?.operatorVersion === rule.operatorVersion && rule.termKey === depositTermKey(order)
        && order.status === 'issued' && !order.amendedBy && !order.cancelledByApproval ? rule : null;
}
export function confirmedDepositSource(s: State, invoice: Data) {
    const reading = s.get('invoiceReading:' + invoice.confirmedReading)?.value, source = reading && s.get('invoiceSource:' + reading.source)?.value;
    const file = source && s.get('attachment:' + source.attachment)?.value;
    return invoice.sourceConfirmation === 'confirmed' && !invoice.sourceValuesErased && !invoice.erasure
        && reading?.status === 'confirmed' && reading.invoice === invoice.id && reading.sourceDescriptor.sha256 === invoice.document?.sha256
        && file?.base64 && !file.erasure && file.sha256 === invoice.document?.sha256;
}
export function depositApprovalEligible(s: State, invoice: Data): boolean {
    if (!nativeDepositInvoice(invoice)) return true;
    const order = get(s, 'order', invoice.order), approval = invoice.paymentApproval, rule = liveDepositRule(s, order);
    if (!approval || !rule || approval.ruleVersion !== rule.version || approval.termKey !== depositTermKey(order)
        || approval.documentSha256 !== invoice.document?.sha256 || approval.amountMinor !== invoice.totalMinor
        || !confirmedDepositSource(s, invoice) || invoice.disputed || invoice.exception || openInvoiceFlags(invoice).length) return false;
    if (invoice.depositKind === 'deposit') return approval.match === 'deposit-two-way';
    const application = s.get('depositApplication:' + invoice.id)?.value;
    const deposit = application && s.get('invoice:' + application.depositInvoice)?.value;
    return approval.match === 'deposit-final-three-way' && application?.amountMinor === invoice.depositAppliedMinor
        && deposit?.depositKind === 'deposit' && depositApprovalEligible(s, deposit);
}
export function nativeDepositPosition(s: State, order: Data) {
    const invoices = all(s, 'invoice').filter(invoice => invoice.order === order.id && nativeDepositInvoice(invoice));
    const deposits = invoices.filter(invoice => invoice.depositKind === 'deposit' && invoice.paymentApproval);
    const applications = all(s, 'depositApplication').filter(row => row.order === order.id);
    const approvedMinor = deposits.reduce((n, invoice) => n + invoice.totalMinor, 0), appliedMinor = applications.reduce((n, row) => n + row.amountMinor, 0);
    return { term: order.poDetails?.deposit, termKey: depositTermKey(order), ruleVersion: s.get('depositRule:' + order.id)?.value.version ?? 0,
        enabled: Boolean(liveDepositRule(s, order)), approvedMinor, appliedMinor, unappliedMinor: Math.max(0, approvedMinor - appliedMinor),
        eligibleMinor: deposits.filter(invoice => depositApprovalEligible(s, invoice)).reduce((n, invoice) => n + invoice.totalMinor, 0),
        depositInvoices: deposits.map(invoice => invoice.id), applications, posting: 'unmapped', postingAvailable: false, settlement: 'No settlement evidence recorded' };
}
