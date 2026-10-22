import { createHash } from 'node:crypto';
import { erasedOriginal, erasedField } from '../../src/purse/erasure-journal.mjs';

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
    for (const policy of all('travelReleasePolicy')) {
        const revision = get('revision', policy.request + ':' + policy.revision);
        check(policy.id === policy.request && revision.purchaseType === 'travel' && Number.isSafeInteger(policy.version) && policy.version > 0 && ['off','armed','paused','released','closed'].includes(policy.status), 'travel_release_policy');
        check(all('audit').some(event => event.action === 'travel-release-policy' && event.record === policy.request && event.revision === policy.revision && event.policyVersion <= policy.version), 'travel_release_consent');
        if (policy.status !== 'off') {
            check(Number.isSafeInteger(policy.days) && policy.days >= 1 && policy.days <= 3650 && policy.confirmed === true && policy.acceptLateActual === true && policy.owner && Number.isSafeInteger(policy.ownerVersion), 'travel_release_consent');
            const due = new Date(policy.returnDate + 'T12:00:00Z'); due.setUTCDate(due.getUTCDate() + policy.days);
            check(policy.returnDate === revision.travel.returnDate && policy.dueDate === due.toISOString().slice(0,10) && policy.approvalReference === revision.travel.approvalReference, 'travel_release_calendar');
            try { new Intl.DateTimeFormat('en-US', {timeZone:policy.timezone}).format(); } catch { check(false, 'travel_release_calendar'); }
        }
        if (policy.status === 'released') check(get('travelRelease', policy.release).request === policy.request && get('travelRelease', policy.release).revision === policy.revision, 'travel_release_policy_link');
    }
    for (const release of all('travelRelease')) {
        const revision = get('revision', release.request + ':' + release.revision);
        check(release.id === release.request + ':' + release.revision && revision.purchaseType === 'travel' && revision.status === 'approved' && !revision.imported && release.approvalReference === revision.travel.approvalReference && release.amountMinor === revision.totalMinor && release.currency === revision.currency && release.policy === revision.policy, 'travel_timed_release');
        const events = all('commitment').filter(event => event.request === release.request && event.revision === release.revision && event.kind === 'travel-timed-release');
        check(events.length === 1 && events[0].amountMinor === -release.amountMinor && !all('commitment').some(event => event.request === release.request && event.revision === release.revision && ['travel-actual-movement', 'travel-unspent-release'].includes(event.kind)), 'travel_timed_release_movement');
        const consent = all('audit').find(event => event.action === 'travel-release-policy' && event.record === release.request && event.revision === release.revision && event.policyVersion === release.policyVersion);
        check(consent?.status === 'armed' && consent.confirmed === true && consent.acceptLateActual === true && consent.owner === release.owner && consent.ownerVersion === release.ownerVersion && consent.actor === release.owner && consent.days === release.days && consent.returnDate === release.returnDate && consent.dueDate === release.dueDate && consent.timezone === release.timezone, 'travel_timed_release_consent');
        const day = new Intl.DateTimeFormat('en-CA', {timeZone:release.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(release.at));
        const part = name => day.find(part => part.type === name)?.value;
        check(validDate(release.dueDate) && `${part('year')}-${part('month')}-${part('day')}` >= release.dueDate, 'travel_timed_release_early');
        check(all('audit').some(event => event.action === 'travel-timed-release' && event.record === release.request && event.revision === release.revision && event.amountMinor === release.amountMinor && event.at === release.at), 'travel_timed_release_audit');
    }
    const external = new Set();
    for (const expense of all('travelExpense')) {
        const request = get('request', expense.request), revision = get('revision', expense.request + ':' + expense.revision);
        const attachment = get('attachment', expense.attachment), bytes = Buffer.from(attachment.base64, 'base64');
        check(request.purchaseType === 'travel' && revision.travel.approvalReference === expense.approvalReference && expense.policy === revision.policy && expense.currency === revision.currency, 'travel_expense_reference');
        check(attachment.kind === 'travelExpense' && attachment.record === expense.id && Number.isSafeInteger(attachment.size) && attachment.size > 0 && /^[a-f0-9]{64}$/.test(expense.sha256), 'travel_expense_original');
        if (expense.erasure) {
            check(attachment.erasure === expense.erasure && erasedOriginal(all, attachment) && attachment.sha256 === expense.sha256 && expense.originalStatus === 'withdrawn' && expense.originalSourceVerified === false, 'travel_expense_withdrawn_original');
            for (const field of ['erasure','originalStatus','originalSourceVerified','sourceBasis']) check(erasedField(all,'travelExpense',expense.id,[field],expense[field]), 'travel_expense_erasure_evidence');
        } else {
            check(!attachment.erasure && expense.originalStatus !== 'withdrawn' && expense.originalSourceVerified !== false && attachment.size === bytes.length && createHash('sha256').update(bytes).digest('hex') === expense.sha256, 'travel_expense_original');
            let original; try { original = JSON.parse(bytes.toString('utf8')); } catch { check(false, 'travel_expense_original'); }
            const frozen = original.revisions?.find(source => source.revision === expense.externalRevision);
            check(original.claim?.id === expense.externalId && ['approved', 'reimbursed'].includes(original.claim.status) && original.claim.employee_email === revision.travel.travelerEmail && original.claim.revision === expense.externalRevision, 'travel_expense_source');
            check(frozen?.total_minor === expense.totalMinor && frozen.snapshot?.total_minor === expense.totalMinor && frozen.snapshot.currency === expense.currency && frozen.snapshot.items.every(item => item.fields?.purse_reference === expense.approvalReference), 'travel_expense_source');
        }
        check(Array.isArray(expense.items) && expense.items.length > 0 && new Set(expense.items.map(item=>item.id)).size === expense.items.length && expense.items.every(item=>Number.isSafeInteger(item.amountMinor) && item.amountMinor >= 0 && validDate(item.date)) && expense.items.reduce((sum,item)=>sum+item.amountMinor,0) === expense.totalMinor, 'travel_expense_items');
        check(expense.totalMinor > 0 && Number.isSafeInteger(expense.releasedMinor) && expense.releasedMinor >= 0 && (expense.earlierRelease ? expense.releasedMinor === 0 && Number.isSafeInteger(expense.remainingEstimateMinor) && expense.remainingEstimateMinor >= 0 && expense.totalMinor + expense.remainingEstimateMinor === revision.totalMinor : expense.totalMinor + expense.releasedMinor === revision.totalMinor), 'travel_expense_total');
        const identity = expense.sourceOrigin + ':' + expense.externalId;
        check(!external.has(identity), 'travel_expense_duplicate'); external.add(identity);
        const events = all('commitment').filter(event => event.request === request.id && event.revision === expense.revision);
        if (expense.earlierRelease) {
            const release = get('travelRelease', expense.earlierRelease.id);
            check(release.request === request.id && release.revision === expense.revision && release.at === expense.earlierRelease.at && release.amountMinor === expense.earlierRelease.amountMinor && expense.earlierRelease.amountMinor === revision.totalMinor, 'travel_expense_prior_release');
            const movements = events.filter(event => event.kind === 'travel-actual-recorded-after-release');
            check(movements.length === 1 && movements[0].amountMinor === 0 && !events.some(event => event.kind === 'travel-actual-movement'), 'travel_expense_movement');
        } else check(events.filter(event => event.kind === 'travel-actual-movement').length === 1 && events.find(event => event.kind === 'travel-actual-movement').amountMinor === -expense.totalMinor && !events.some(event => ['travel-actual-recorded-after-release', 'travel-timed-release'].includes(event.kind)), 'travel_expense_movement');
        check(expense.releasedMinor ? events.filter(event => event.kind === 'travel-unspent-release').length === 1 && events.find(event => event.kind === 'travel-unspent-release').amountMinor === -expense.releasedMinor : !events.some(event => event.kind === 'travel-unspent-release'), 'travel_expense_release');
        check(request.travel.expenseReport === expense.id && Number.isFinite(Date.parse(request.travel.closedAt)), 'travel_expense_closure');
        check(all('audit').some(event => event.action === 'travel-expense-return' && event.record === request.id && event.report === expense.id && event.sha256 === expense.sha256), 'travel_expense_audit');
    }
}
