import { createHash } from 'node:crypto';

/** Travel is an approval and budget record, never fabricated supplier authority. */
export function validateTravel(all, get, check, same) {
    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    for (const kind of ['request', 'revision', 'order']) for (const request of all(kind).filter(record => record.purchaseType === 'travel')) {
        const trip = request.travel;
        check(kind !== 'order' && request.supplier === null && request.supplierSnapshot === null && !request.amends && !request.issuedAt, 'travel_authority');
        check(trip && typeof trip.traveler === 'string' && trip.traveler && typeof trip.travelerEmail === 'string' && trip.travelerEmail && trip.purpose && trip.origin, 'travel_identity');
        check(validDate(trip.departureDate) && validDate(trip.returnDate) && trip.departureDate <= trip.returnDate && request.needDate === trip.departureDate, 'travel_dates');
        check(Array.isArray(trip.destinations) && trip.destinations.length && trip.destinations.every(destination => destination.city && destination.country), 'travel_destinations');
        const total = Object.values(trip.costs).reduce((sum, amount) => { check(Number.isSafeInteger(amount) && amount >= 0, 'travel_cost'); return sum + amount; }, 0);
        check(total === trip.totalMinor && total === request.totalMinor && request.lines.reduce((sum, line) => sum + line.totalMinor, 0) === total, 'travel_total');
        if (trip.approvalReference) check(trip.approvalReference === `PURSE-TRAVEL-${request.request ?? request.id}-R${request.revision}` && Number.isFinite(Date.parse(trip.approvedAt)), 'travel_reference');
        if (trip.expenseReport) check(get('travelExpense', trip.expenseReport).request === (request.request ?? request.id), 'travel_expense_link');
    }
    const external = new Set();
    for (const expense of all('travelExpense')) {
        const request = get('request', expense.request), revision = get('revision', expense.request + ':' + expense.revision);
        const attachment = get('attachment', expense.attachment), bytes = Buffer.from(attachment.base64, 'base64');
        check(request.purchaseType === 'travel' && revision.travel.approvalReference === expense.approvalReference && expense.policy === revision.policy && expense.currency === revision.currency, 'travel_expense_reference');
        check(attachment.kind === 'travelExpense' && attachment.record === expense.id && attachment.size === bytes.length && createHash('sha256').update(bytes).digest('hex') === expense.sha256, 'travel_expense_original');
        let original; try { original = JSON.parse(bytes.toString('utf8')); } catch { check(false, 'travel_expense_original'); }
        const frozen = original.revisions?.find(source => source.revision === expense.externalRevision);
        check(original.claim?.id === expense.externalId && ['approved', 'reimbursed'].includes(original.claim.status) && original.claim.employee_email === revision.travel.travelerEmail && original.claim.revision === expense.externalRevision, 'travel_expense_source');
        check(frozen?.total_minor === expense.totalMinor && frozen.snapshot?.total_minor === expense.totalMinor && frozen.snapshot.currency === expense.currency && frozen.snapshot.items.every(item => item.fields?.purse_reference === expense.approvalReference), 'travel_expense_source');
        check(expense.totalMinor > 0 && Number.isSafeInteger(expense.releasedMinor) && expense.releasedMinor >= 0 && expense.totalMinor + expense.releasedMinor === revision.totalMinor, 'travel_expense_total');
        const identity = expense.sourceOrigin + ':' + expense.externalId;
        check(!external.has(identity), 'travel_expense_duplicate'); external.add(identity);
        const events = all('commitment').filter(event => event.request === request.id && event.revision === expense.revision);
        check(events.filter(event => event.kind === 'travel-actual-movement').length === 1 && events.find(event => event.kind === 'travel-actual-movement').amountMinor === -expense.totalMinor, 'travel_expense_movement');
        check(expense.releasedMinor ? events.filter(event => event.kind === 'travel-unspent-release').length === 1 && events.find(event => event.kind === 'travel-unspent-release').amountMinor === -expense.releasedMinor : !events.some(event => event.kind === 'travel-unspent-release'), 'travel_expense_release');
        check(request.travel.expenseReport === expense.id && Number.isFinite(Date.parse(request.travel.closedAt)), 'travel_expense_closure');
        check(all('audit').some(event => event.action === 'travel-expense-return' && event.record === request.id && event.report === expense.id && event.sha256 === expense.sha256), 'travel_expense_audit');
    }
}
