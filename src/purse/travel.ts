import { activeTraveler, travelerReferences } from './travel-reference';
import { currentDecision } from './approval';
import { allowed } from './access';
import { currency } from './admin';
import { ledger, requests } from './requests';
import { travelCostCategories, travelCostLabels, travelFields } from './travel-fields';
import { all, audit, get, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

export function travelRequest(s: State, id: string) {
    const request = get(s, 'request', id);
    requireThat(request.purchaseType === 'travel' && request.travel, 'Travel request required', 409);
    return request;
}
/** Shared dispatcher calls this before any generic request/PO handler. Travel
 * authority is only changed through the travel-specific validated operations. */
export function travelGuard(s: State, op: string, input: Data) {
    const id = input.id ?? input.request;
    const request = typeof id === 'string' ? s.get('request:' + id)?.value : undefined;
    if (request?.purchaseType !== 'travel') return;
    const forbidden = ['request', 'amend', 'submit', 'decision', 'convert', 'need-date-edit', 'approver-edit', 'request-again-preview', 'request-again', 'quote', 'quote-award', 'agreement-award', 'rfq', 'rfq-create', 'rfq-award', 'need-date-edit', 'quote-extract', 'quote-reading-propose'];
    requireThat(!forbidden.includes(op) && !op.startsWith('rfq-') && !op.startsWith('quote-reading-'), 'Use the travel request actions; booking and expense processing happen in the travel or expense tool', 409);
}
export function travelCommands(s: State, a: Actor, op: string, input: Data): Data | undefined {
    if (op === 'travel-request' || op === 'travel-amend') {
        const previous = input.id ? travelRequest(s, input.id) : undefined;
        requireThat(op !== 'travel-amend' || previous, 'Existing travel request required');
        if (previous) {
            requireThat(input.revision === previous.revision, 'Stale travel revision', 409);
            requirePermission(s, a, 'request.edit', previous);
            requireThat(a.owner || previous.requester === a.id, 'Only the requester or owner may amend this trip', 403);
            requireThat(!previous.travel.closedAt, 'The expense report has closed this trip', 409);
            requireThat(!previous.imported, 'Imported travel history cannot grant native authority', 409);
            requireThat(['draft', 'returned', 'rejected', 'approved'].includes(previous.status), 'Return the pending trip before amending it', 409);
        }
        const travel = travelFields(input), business = get(s, 'business', 'main');
        currency(s, input.currency);
        requireThat(input.currency === 'USD' || travel.mealsBasis === 'explicit-estimate', 'GSA defaults are denominated in USD; enter an explicit estimate for another currency');
        const member = all(s, 'member').find(member => member.email === travel.travelerEmail && member.active);
        requireThat(member || travel.travelerEmail === a.email, 'Traveler must be an active workspace member');
        const location = text(input.location, 'Location'), costCentre = text(input.costCentre, 'Department'), project = text(input.project, 'Project');
        requireThat(business.locations.includes(location) && business.costCentres.includes(costCentre) && business.projects.includes(project), 'Use a configured location, department and project');
        const id = previous?.id ?? uid(), revision = (previous?.revision ?? 0) + 1;
        const lines = travelCostCategories.map(category => ({ id: previous?.lines.find((line: Data) => line.travelCategory === category)?.id ?? uid(), description: travelCostLabels[category], quantity: '1', q: 1000, unitMinor: travel.costs[category + 'Minor'], totalMinor: travel.costs[category + 'Minor'], category: 'travel', travelCategory: category, project, allocations: [], requiredAttachments: [], unit: 'trip', partNumber: '', lineTaxMinor: 0 }));
        const request: Data = { id, revision, status: 'draft', purchaseType: 'travel', requester: previous?.requester ?? a.id, requesterEmail: previous?.requesterEmail ?? a.email, requesterOwner: previous?.requesterOwner ?? a.owner,
            title: text(input.title, 'Travel request title'), travel, currency: input.currency, location, costCentre, project, needDate: travel.departureDate, supplier: null, supplierSnapshot: null, lines, freightMinor: 0, taxMinor: 0, totalMinor: travel.totalMinor, terms: travel.purpose, policy: null, poDetails: { depositTerms: '', notes: '', shippingTerms: '', buyerContact: '' } };
        requirePermission(s, a, previous ? 'request.edit' : 'request.create', request);
        if (previous) {
            const balances = new Map<string, Data>();
            for (const event of all(s, 'commitment').filter(event => event.request === id)) {
                const key = event.policy + ':' + event.currency, group = balances.get(key) ?? { policy: event.policy, currency: event.currency, amountMinor: 0 };
                group.amountMinor += event.amountMinor; balances.set(key, group);
            }
            for (const balance of balances.values()) if (balance.amountMinor) ledger(s, a, { ...previous, policy: balance.policy, currency: balance.currency }, -balance.amountMinor, 'travel-amendment-release');
        }
        put(s, 'request', id, request); put(s, 'revision', id + ':' + revision, { ...request, request: id });
        audit(s, a, op, id, { revision, reason: previous ? text(input.reason, 'Amendment reason') : 'Created', travelerEmail: travel.travelerEmail });
        return request;
    }
    if (op !== 'travel-submit' && op !== 'travel-decision') return;
    const request = travelRequest(s, input.id);
    requireThat(!request.travel.closedAt, 'The expense report has closed this trip', 409);
    if (op === 'travel-decision') requireThat(a.email !== request.travel.travelerEmail, 'The traveler cannot approve their own trip', 403);
    const result = requests(s, a, op === 'travel-submit' ? 'submit' : 'decision', input)!;
    if (result.status === 'approved') {
        currentDecision(s, result);
        const approvalReference = `PURSE-TRAVEL-${result.id}-R${result.revision}`;
        const approved = { ...result, travel: { ...result.travel, approvalReference, approvedAt: new Date().toISOString() } };
        put(s, 'request', result.id, approved);
        // Freeze the final approved trip alongside its exact submitted terms.
        put(s, 'revision', result.id + ':' + result.revision, { ...approved, request: result.id });
        audit(s, a, 'travel-approved', result.id, { revision: result.revision, approvalReference });
        return approved;
    }
    return result;
}
export function visibleTravel(s: State, a: Actor, requestIds?: Set<string>) {
    const visible = (request: string) => (!requestIds || requestIds.has(request)) && allowed(s, a, 'request.read', get(s, 'request', request));
    return { travelReference: activeTraveler(s, a) ? travelerReferences(s, a) : [],
        travelReleasePolicy: all(s, 'travelReleasePolicy').filter(policy => visible(policy.request)).map(policy => a.owner ? policy : Object.fromEntries(['id', 'request', 'revision', 'version', 'status', 'days', 'dueDate', 'timezone', 'pauseReason', 'releasedAt'].map(field => [field, policy[field]]))),
        travelRelease: all(s, 'travelRelease').filter(event => visible(event.request)).map(event => Object.fromEntries(['id', 'request', 'revision', 'amountMinor', 'currency', 'at', 'dueDate', 'timezone'].map(field => [field, event[field]]))),
        travelExpense: all(s, 'travelExpense').filter(expense => visible(expense.request)).map(expense=>a.owner?expense:Object.fromEntries(['id','request','revision','approvalReference','currency','totalMinor','releasedMinor','externalId','externalRevision','externalNumber','title','items','at','sourceBasis','earlierRelease','remainingEstimateMinor','erasure','originalStatus','originalSourceVerified'].map(field=>[field,expense[field]]))) };
}
