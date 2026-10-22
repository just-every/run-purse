import { date, minor, requireThat, text, type Data } from './types';

/** Parse Coaster's actual GET /api/coaster/claims/:id response. Its accounting
 * CSV deliberately omits item custom fields and cannot supply this reference. */
export function coasterTravelReport(original: unknown, approvalReference: string, travelerEmail: string) {
    requireThat(typeof original === 'string' && original.length > 0 && new TextEncoder().encode(original).length <= 1000000, 'Upload up to 1 MB of native Coaster report JSON');
    let report: Data;
    try { report = JSON.parse(original); } catch { requireThat(false, 'Invalid Coaster report JSON'); }
    const claim = report!.claim;
    requireThat(claim && typeof claim === 'object' && Array.isArray(report!.revisions) && Array.isArray(report!.decisions), 'Use the native Coaster claim detail JSON, including frozen revisions and decisions');
    const id = text(claim.id, 'Coaster claim id', 200);
    requireThat(['approved', 'reimbursed'].includes(claim.status), 'Only a completed, approved Coaster expense report can close a trip', 409);
    requireThat(claim.employee_email === travelerEmail, 'Coaster report traveler does not match the approved trip', 409);
    requireThat(Number.isSafeInteger(claim.revision) && claim.revision > 0, 'Coaster report revision required');
    const frozen = report!.revisions.filter((revision: Data) => revision.revision === claim.revision);
    requireThat(frozen.length === 1, 'Exactly one current frozen Coaster revision required');
    const snapshot = frozen[0].snapshot;
    requireThat(snapshot && Array.isArray(snapshot.items) && snapshot.items.length > 0 && snapshot.items.length <= 500, 'Frozen Coaster expense items required');
    const totalMinor = minor(claim.total_minor, 'Coaster expense total');
    requireThat(totalMinor > 0 && frozen[0].total_minor === totalMinor && snapshot.total_minor === totalMinor && snapshot.currency === claim.currency, 'Coaster report and frozen totals or currencies differ', 409);
    const items = snapshot.items.map((item: Data) => {
        requireThat(item.fields?.purse_reference === approvalReference, 'Every report item must reference this exact travel approval', 409);
        return { id: text(item.id, 'Coaster item id', 200), amountMinor: minor(item.amount_minor, 'Coaster item amount'), date: date(item.spent_on, 'Coaster expense date'), description: text(item.description || item.merchant, 'Coaster expense description'), merchant: String(item.merchant ?? '') };
    });
    requireThat(new Set(items.map((item: Data) => item.id)).size === items.length && items.reduce((sum: number, item: Data) => sum + item.amountMinor, 0) === totalMinor, 'Coaster items must be unique and add to the frozen report total', 409);
    requireThat(Array.isArray(report!.items) && report!.items.length === items.length && items.every((item: Data) => report!.items.some((current: Data) => current.id === item.id && current.amount_minor === item.amountMinor && current.fields?.purse_reference === approvalReference)), 'Current Coaster items differ from the approved frozen revision', 409);
    const decisions = report!.decisions.filter((decision: Data) => decision.revision === claim.revision);
    requireThat(decisions.some((decision: Data) => decision.decision === 'approved' && decision.actor_email !== travelerEmail) && !decisions.some((decision: Data) => ['rejected', 'returned'].includes(decision.decision)), 'Independent approval of the current Coaster report is required', 409);
    // Coaster's current workflow records explicitly identify their final step.
    if (snapshot.workflow) requireThat(decisions.some((decision: Data) => decision.decision === 'approved' && Boolean(decision.workflow_final)), 'Coaster workflow final approval is missing', 409);
    return { id, number: claim.number, title: text(claim.title, 'Coaster report title'), revision: claim.revision, currency: text(claim.currency, 'Coaster currency', 3), totalMinor, employeeEmail: claim.employee_email, status: claim.status, items, submittedAt: frozen[0].submitted_at, approvedAt: decisions.filter((decision: Data) => decision.decision === 'approved').at(-1)?.at };
}
export function coasterSource(input: unknown, claimId: string) {
    let url: URL;
    try { url = new URL(text(input, 'Coaster source URL', 2000)); } catch { requireThat(false, 'Use the Coaster report HTTP URL'); }
    requireThat((url!.protocol === 'https:' || url!.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url!.hostname)) && !url!.username && !url!.password && !url!.search && !url!.hash, 'Use a secure Coaster source URL or a local installation URL');
    requireThat(url!.pathname === '/api/coaster/claims/' + encodeURIComponent(claimId), 'Source URL must identify the native Coaster report');
    return { sourceOrigin: url!.origin, sourceUrl: url!.href };
}
