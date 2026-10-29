import { recordScope } from './documents';
import { canonicalSupplier } from './supplier-identity';
import { accessGrants, allowed, requirePermission } from './access';
import { get, requireThat, text, type Actor, type Data, type State } from './types';

// These records are shared registers, not purchases whose scope can be
// inferred from a caller-supplied location, supplier or requester field.
const globalProcurement = new Set([
    'supplier', 'screen-supplier', 'supplier-matching-setup', 'supplier-duplicates',
    'preview-supplier-merge', 'merge-suppliers', 'catalogue', 'catalogue-bundle', 'catalogue-import-commit',
    'supplier-document', 'review-supplier-document',
]);
const nativeOwner = new Set([
    'supplier-tax-review',
    'adopt-order-preview', 'adopt-order', 'propose-adopted-cancellation', 'replace-adopted-remainder',
    'review-screening', 'catalogue-grant', 'po-profile', 'agreement', 'agreement-invoice',
    'agreement-extract', 'agreement-reading-edit', 'value-policy', 'protected-context-cleanup',
]);
const orderById = new Set(['close-order', 'reopen-order', 'propose-order-cancellation']);
const orderByOrder = new Set(['order-chase-policy', 'supplier-order-evidence']);
const quoteAgentCommands = new Set(['quote-agent-consent','quote-agent-run','quote-agent-clarify','quote-agent-review']);
const requestProcurement = new Set(['agreement-award']);
const quoteReadingNew = new Set(['quote-extract', 'quote-reading-propose']);
const quoteReadingExisting = new Set(['quote-reading-edit', 'quote-reading-confirm']);
const humanPreparation = new Set(['prepare', 'edit-preparation', 'propose-action']);

function unrestrictedProcurement(s: State, a: Actor) {
    requireThat(accessGrants(s, a).some(grant => grant.permissions.includes('procurement.manage')
        && Object.keys(grant.scope).length === 0 && Object.keys(grant.roleScope ?? {}).length === 0),
    'Unrestricted procurement permission required for this shared register', 403);
}
function procurementRecord(s: State, a: Actor, kind: string, id: unknown) {
    requirePermission(s, a, 'procurement.manage');
    const record = get(s, kind, text(id, 'Record id', 200));
    requirePermission(s, a, 'procurement.manage', record); return record;
}
function preparationReferences(s: State, a: Actor, references: unknown) {
    requireThat(Array.isArray(references), 'Preparation references must be a list');
    for (const reference of references) {
        requireThat(reference && ['request', 'supplier', 'order', 'invoice', 'attachment'].includes(reference.kind), 'Unsupported source record');
        const record = get(s, reference.kind, reference.id);
        recordScope(s, a, reference.kind, record);
    }
}

/** Runs before the dispatcher and again for the actual target of execute-action.
 * Integrated purchasing handlers retain their own normalized before/after
 * authorization. Unknown operations remain the dispatcher's responsibility.
 */
export function authorizeAccessCommand(s: State, a: Actor, op: string, b: Data): void {
    if (a.owner || op === 'execute-action') return;
    if(quoteAgentCommands.has(op)){const rfq=get(s,'rfq',b.rfq);requirePermission(s,a,'rfq.manage',get(s,'request',rfq.request));return;}
    if (globalProcurement.has(op)) { unrestrictedProcurement(s, a); return; }
    if (nativeOwner.has(op)) { requireThat(false, 'Current native owner required', 403); }
    if (orderById.has(op)) { procurementRecord(s, a, 'order', b.id); return; }
    if (orderByOrder.has(op)) { procurementRecord(s, a, 'order', b.order); return; }
    if(op==='quote-award'){const request=get(s,'request',b.request);requirePermission(s,a,'rfq.manage',request);requirePermission(s,a,'request.edit',request);return;}
    if (requestProcurement.has(op)) { procurementRecord(s, a, 'request', b.request); return; }
    if (op === 'supplier-issue' || op === 'resolve-supplier-issue') {
        requirePermission(s, a, 'procurement.manage');
        const issue = op === 'resolve-supplier-issue' ? get(s, 'supplierIssue', b.id) : undefined;
        const order = procurementRecord(s, a, 'order', issue?.order ?? b.order);
        const supplier = get(s, 'supplier', issue?.supplier ?? b.supplier);
        // Preserve the existing business-conflict result for inconsistent
        // supplier evidence; the permission decision above always returns 403.
        requireThat(canonicalSupplier(s, order.supplier) === canonicalSupplier(s, supplier.id), 'PO belongs to another supplier', 409); return;
    }
    if (op === 'stockroom-item' || op === 'stockroom-count') {
        requirePermission(s, a, 'procurement.manage');
        if (op === 'stockroom-count' || b.id) procurementRecord(s, a, 'stockroom', b.id);
        if (op === 'stockroom-item') requirePermission(s, a, 'procurement.manage', {
            location: text(b.location, 'Location'), costCentre: text(b.costCentre, 'Cost centre'), project: text(b.project, 'Project'), entity: 'main',
        });
        return;
    }
    if (humanPreparation.has(op)) {
        requireThat(allowed(s, a, 'request.create') || allowed(s, a, 'procurement.manage'), 'Purchasing preparation permission required', 403);
        if (op === 'prepare') preparationReferences(s, a, b.references ?? []);
        else {
            const run = get(s, 'agentRun', op === 'edit-preparation' ? b.id : b.run);
            requireThat(run.mode === 'human-preparation','Value reports are immutable; prepare a new report for changed evidence',409);
            requireThat(run.actor === a.id, 'Preparation outside your scope', 403);
            preparationReferences(s, a, run.references);
        }
        return;
    }
    if (op === 'value-report') {
        // Existing requester, approver and receiver reports are mutable runs;
        // finance/auditor read grants alone cannot create them.
        requireThat(['request.edit', 'request.approve', 'receive', 'procurement.manage'].some(permission => allowed(s, a, permission)), 'Value report creation requires purchasing write permission', 403);
        const request = get(s, 'request', b.request);
        requirePermission(s, a, 'request.read', request);
        requireThat(['request.edit', 'request.approve', 'receive', 'procurement.manage'].some(permission => allowed(s, a, permission, request)), 'Value report outside your purchasing scope', 403); return;
    }
    if (op === 'value-seat-import' || op === 'value-confirm') {
        requirePermission(s, a, 'request.edit');
        const request = op === 'value-confirm' ? get(s, 'request', get(s, 'agentRun', b.id).request) : get(s, 'request', b.request);
        requirePermission(s, a, 'request.edit', request); return;
    }
    if (op === 'quote-reading-instructions' || quoteReadingNew.has(op) || quoteReadingExisting.has(op)) {
        const permission = op === 'quote-reading-instructions' ? 'request.read' : 'request.edit';
        requirePermission(s, a, permission);
        const request = quoteReadingExisting.has(op) ? get(s, 'request', get(s, 'quoteReading', b.id).request) : get(s, 'request', b.request);
        requirePermission(s, a, permission, request); return;
    }
    if (op === 'request-again-preview' && ['request', 'order'].includes(b.kind)) {
        const permission = b.kind === 'order' ? 'po.read' : 'request.read';
        requirePermission(s, a, permission); requirePermission(s, a, permission, get(s, b.kind, b.id));
    }
}
