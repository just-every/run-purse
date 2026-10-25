import { createHash } from 'node:crypto';
import { parseTravelCsv, travelExportColumns } from '../../src/purse/travel-export-format.mjs';

/** Called only for a retained, unwithdrawn CSV original. Erasure validation
 * stays in the parent travel validator. No source provider is contacted. */
export function validateTravelExport(expense, revision, bytes, all, check, same) {
    check(Object.hasOwn(travelExportColumns, expense.provider), 'travel_expense_provider');
    const event = all('audit').find(event => event.action === 'travel-expense-return' && event.report === expense.id && event.record === expense.request);
    check(event && event.actor === expense.actor && event.email === expense.confirmerEmail && event.provider === expense.provider && event.confirmed === true && event.closed === true && event.reportFingerprint === expense.reportFingerprint, 'travel_expense_source_consent');
    check(expense.confirmed === true && expense.closed === true, 'travel_expense_source_consent');
    let original, report;
    try {
        original = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        report = parseTravelCsv(original, expense.provider, expense.sourceReview, expense.columns, expense.approvalReference, revision.travel.travelerEmail);
    } catch { check(false, 'travel_expense_source'); }
    check(report && report.id === expense.externalId && report.revision === expense.externalRevision && report.title === expense.title && report.number === expense.externalNumber && report.employeeEmail === expense.employeeEmail && report.status === expense.sourceStatus && report.currency === expense.currency && report.totalMinor === expense.totalMinor && same(report.items, expense.items), 'travel_expense_source');
    check(same(report.sourceReview, expense.sourceReview) && same(report.columns, expense.columns) && expense.sourceAccount === report.sourceReview.sourceAccount && expense.sourceOrigin === expense.provider + ':' + report.sourceReview.sourceAccount, 'travel_expense_source_provenance');
    const fingerprint = createHash('sha256').update(JSON.stringify({ sha256: expense.sha256, provider: expense.provider, report })).digest('hex');
    check(fingerprint === expense.reportFingerprint, 'travel_expense_source_fingerprint');
}
