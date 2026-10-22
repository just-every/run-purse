import { currentDecision } from './approval';
import { coasterSource, coasterTravelReport } from './travel-coaster';
import { ledger } from './requests';
import { travelRequest } from './travel';
import { all, audit, get, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

export async function travelExpenses(s: State, a: Actor, op: string, input: Data): Promise<Data | undefined> {
    if (op !== 'travel-expense-return') return;
    const request = travelRequest(s, input.id);
    requireThat(a.owner, 'Current native owner required to confirm an external expense report', 403);
    requirePermission(s, a, 'request.read', request);
    requirePermission(s, a, 'payable.approve', request);
    requireThat(input.revision === request.revision, 'Stale travel revision', 409);
    requireThat(input.confirmed === true && input.closed === true, 'Confirm the native report source and that this is the trip’s final expense report');
    const approvalReference = request.travel.approvalReference;
    requireThat(approvalReference, 'Approved travel reference required', 409);
    const report = coasterTravelReport(input.original, approvalReference, request.travel.travelerEmail), source = coasterSource(input.sourceUrl, report.id);
    requireThat(report.currency === request.currency, 'Expense report currency differs from the approved reservation', 409);
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.original)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const existing = all(s, 'travelExpense').find(expense => expense.sourceOrigin === source.sourceOrigin && expense.externalId === report.id);
    if (existing) {
        requireThat(existing.request === request.id && existing.sha256 === sha256, 'This Coaster report was already reconciled; its source or request differs', 409);
        return existing;
    }
    requireThat(request.status === 'approved' && !request.travel.closedAt && !request.imported, 'An open native approved trip is required', 409);
    currentDecision(s, request);
    requireThat(!all(s, 'travelExpense').some(expense => expense.request === request.id), 'This trip already has a final expense report', 409);
    requireThat(report.totalMinor <= request.totalMinor, 'The expense report exceeds the approved estimate; renew travel approval first', 409);
    const balance = all(s, 'commitment').filter(event => event.request === request.id && event.currency === request.currency && event.policy === request.policy).reduce((sum, event) => sum + event.amountMinor, 0);
    requireThat(balance === request.totalMinor, 'Exact approved travel reservation is required', 409);
    const id = uid(), attachment = uid(), at = new Date().toISOString(), bytes = new TextEncoder().encode(input.original);
    let raw = ''; for (const byte of bytes) raw += String.fromCharCode(byte);
    put(s, 'attachment', attachment, { kind: 'request', record: request.id, name: `coaster-report-${report.id}.json`, mediaType: 'application/json', base64: btoa(raw), size: bytes.length, actor: a.id, at });
    audit(s,a,'attachment',request.id,{attachment,kind:'request',name:`coaster-report-${report.id}.json`,size:bytes.length,revision:request.revision});
    const expense = { id, request: request.id, revision: request.revision, approvalReference, policy: request.policy, currency: request.currency, totalMinor: report.totalMinor, releasedMinor: balance - report.totalMinor,
        externalId: report.id, externalRevision: report.revision, externalNumber: report.number, title: report.title, employeeEmail: report.employeeEmail, sourceStatus: report.status, ...source, sha256, attachment, items: report.items,
        sourceBasis: 'Manually imported native Coaster report; original retained for review', actor: a.id, at, reason: text(input.reason, 'Expense return reason') };
    ledger(s, a, request, -report.totalMinor, 'travel-actual-movement');
    if (expense.releasedMinor) ledger(s, a, request, -expense.releasedMinor, 'travel-unspent-release');
    put(s, 'travelExpense', id, expense);
    put(s, 'request', request.id, { ...request, travel: { ...request.travel, closedAt: at, expenseReport: id } });
    audit(s, a, 'travel-expense-return', request.id, { revision: request.revision, report: id, externalId: report.id, attachment, sha256, actualMinor: report.totalMinor, releasedMinor: expense.releasedMinor, reason: expense.reason });
    return expense;
}
export function travelActualMinor(s: State, policy: string, currency?: string) {
    return all(s, 'travelExpense').filter(expense => expense.policy === policy && (!currency || expense.currency === currency)).reduce((sum, expense) => sum + expense.totalMinor, 0);
}
