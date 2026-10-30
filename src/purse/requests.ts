import { bindRequestEntity, requireEntityPurchase } from './entities';
import { linePosition } from './orders';
import { hasSupplierGroups, supplierLineRemaining } from './po-supplier-groups';
import { openReviews, requireReviews } from './cross-team-reviews';
import { normalizePurchaseCharges } from './purchase-charges';
import { eventBudgetPortion, requestBudgetShares } from './budget-allocations';
import { budgetRoom } from './budget-position';
import { startChain, chainDecision } from './approval-chain';
import { operationalOrder } from './adoption-position';
import { applyIntakeFields, splitValues, intakeDefaults } from './intake-fields';
import { requestSupplier } from './supplier-proposals';
import { serviceTerms, servicePosition } from './service-orders';
import { currentScimAssignment, scimAssignmentAllows } from './scim-approvals';
import { blanketTerms, blanketBilled } from './blanket-orders';
import { normalizeValuePromise } from './value-promise';
import { checkInvoiceAttachment } from './invoice-evidence';
import { allocateLineTax } from './po-line-tax';
import { optionalPoText } from './po-profiles';
import { moneyInput } from './money';
import { requireCatalogueAccess } from './catalogue-access';
import { currentPrice, requiredCatalogueFiles } from './catalogue';
import { all, audit, can, get, put, requireThat, requirePermission, text, minor, quantity, extended, date, uid, type Actor, type Data, type State } from './types';
import { supplier, currency } from './admin';
import { approvalAmount as approvalOf, coveringPolicies } from './policy-match';
export function lines(s: State, input: unknown, a: Actor) { requireThat(Array.isArray(input) && input.length > 0 && input.length <= 100, 'Provide 1–100 lines'); return input.map((x: Data) => { const item = x.catalogue ? get(s, 'catalogue', x.catalogue) : undefined; if (item)
    { requireCatalogueAccess(s, a, item); requireThat(item.approved, 'Catalogue item is not approved'); requireThat(currentPrice(item), 'Catalogue price is outside its validity dates', 409); } const unitMinor = moneyInput(x, 'unitAmount', 'unitMinor', 'Unit price', { fallback: item?.unitMinor }), q = quantity(x.quantity); return { ...(x.glAccount ? {glAccount:text(x.glAccount,'Line GL account',200)} : {}), id: x.id ?? uid(), description: text(x.description ?? item?.description, 'Line description'), quantity: x.quantity, q, unitMinor, totalMinor: extended(q, unitMinor), category: text(x.category ?? item?.category, 'Category'), project: text(x.project || item?.project, 'Project'), catalogue: item?.id ?? null, partNumber: item?.partNumber ?? x.partNumber ?? '', unit: item?.unit ?? x.unit ?? 'each', shipTo: optionalPoText(x.shipTo, 'Line ship to'), lineTaxMinor: Object.hasOwn(x, 'lineTaxAmount') || Object.hasOwn(x, 'lineTaxMinor') ? moneyInput(x, 'lineTaxAmount', 'lineTaxMinor', 'Line tax', { optional: true }) : null, requiredAttachments: item?.requiredAttachments ?? x.requiredAttachments ?? [], allocations: splitValues(s, x.allocations, extended(q, unitMinor)), ...(x.service != null ? { service: serviceTerms(x.service, extended(q, unitMinor)) } : {}) }; }); }
export function requestTotal(r: Data) { const total = r.lines.reduce((n: number, l: Data) => n + l.totalMinor, 0) + r.freightMinor + r.taxMinor + (r.otherChargesMinor ?? 0); return minor(total, 'Request total'); }
export function policies(s: State, r: Data) { return coveringPolicies(all(s, 'policy'), r); }
export const reserved = (s: State, policy: string) => all(s, 'commitment').reduce((n, e) => n + eventBudgetPortion(e, policy), 0);
export function reservationAvailable(s: State, r: Data, amountMinor: number) { const p = policies(s, r).find(p => p.id === r.policy); return Boolean(p && ((!p.budgetPeriod && p.overBudget==='owner' && r.budgetOwnerReview && r.totalMinor===s.get('request:'+r.id)?.value.totalMinor && all(s,'decision').some(decision=>decision.request===r.id&&decision.revision===r.revision&&(!r.approvalRoute||decision.approvalAttempt===r.approvalAttempt)&&decision.decision==='approved'&&decision.email===p.budgetOwner&&decision.policyVersion===s.get('policy:'+p.id)?.revision)) || (budgetRoom(s,r,p,amountMinor) ?? reserved(s,p.id)+all(s,'travelExpense').filter(expense=>expense.policy===p.id&&expense.currency===p.currency).reduce((sum,expense)=>sum+expense.totalMinor,0)+amountMinor<=p.budgetMinor))); }
export function ledger(s: State, a: Actor, r: Data, amountMinor: number, kind: string, budgetFace: Data = r) { requireThat(amountMinor <= 0 || reservationAvailable(s, r, amountMinor), 'Current policy or budget does not authorize replenishment; renew approval', 409); const balance=all(s,'commitment').filter(e=>e.currency===r.currency).reduce((n,e)=>n+e.amountMinor,0);requireThat(Number.isSafeInteger(balance+amountMinor),'Commitment exceeds supported integer range',409);const id = uid(); put(s, 'commitment', id, { request: r.id, revision: r.revision, ...(r.entity ? {entity:r.entity} : {}), policy: r.policy, currency: r.currency, amountMinor, budgetAllocations: conversionBudgetShares(s,r,budgetFace,amountMinor,kind), kind, actor: a.id, at: new Date().toISOString() }); }
/** A grouped buyer revision can move remainder cents between budgets even
 * when its aggregate reservation is unchanged. Preserve the exact delta. */
function conversionBudgetShares(s: State,r: Data,budgetFace: Data,amount: number,kind: string) {
    const groupedOrders=all(s,'order').filter(order=>order.request===r.id&&order.supplierGroup&&order.issuedAt);
    if(hasSupplierGroups(r)&&kind==='buyer-conversion-reservation' || budgetFace.supplierGroup&&groupedOrders.length) {
        const events=all(s,'commitment').filter(event=>event.request===r.id&&event.currency===r.currency);
        const balance=events.reduce((sum,event)=>sum+event.amountMinor,0);
        let target:Data[];
        if(kind==='buyer-conversion-reservation')target=requestBudgetShares(s,r,balance+amount);
        else {
            const sums=new Map<string,number>();
            for(const order of groupedOrders)for(const line of order.lines) {
                const value=supplierLineRemaining(order,line,linePosition(s,order.id,line).outstanding);
                const face={...r,lines:[{...line,totalMinor:value}],charges:[],freightMinor:0,taxMinor:0,otherChargesMinor:0,totalMinor:value,supplierGroup:undefined};
                for(const share of requestBudgetShares(s,face,value))sums.set(share.policy,(sums.get(share.policy)??0)+share.amountMinor);
            }
            target=[...sums].map(([policy,amountMinor])=>({policy,amountMinor}));
        }
        const ids=new Set([...target.map(share=>share.policy),...events.flatMap(event=>(event.budgetAllocations??[{policy:event.policy}]).map((share:Data)=>share.policy))]);
        return [...ids].map(policy=>({policy,amountMinor:(target.find(share=>share.policy===policy)?.amountMinor??0)-events.reduce((sum,event)=>sum+eventBudgetPortion(event,policy),0)}));
    }
    return requestBudgetShares(s,budgetFace,Math.abs(amount)).map(share=>({...share,amountMinor:amount<0?-share.amountMinor:share.amountMinor}));
}
export function authorizedApproval(s: State, a: Actor, r: Data) {
    requirePermission(s, a, 'request.approve', r);
    requireThat(a.id !== r.requester && a.email !== r.requesterEmail, 'Self approval is prohibited', 403);
    const p = get(s, 'policy', r.policy);
    requireThat(policies(s, r).some(x => x.id === p.id), 'Current policy does not cover these terms', 409);
    const assignment = currentScimAssignment(s, r);
    if (assignment) {
        requireThat(scimAssignmentAllows(s, a, r), 'The current approval transfer does not authorize you', 403);
        return { p, delegated: undefined, assignment };
    }
    const delegated = all(s, 'delegation').find(d => d.policy === p.id && d.from === p.approver && d.delegate === a.email && d.active && Date.parse(d.expires) > Date.now());
    requireThat(a.email === p.approver || delegated, 'You do not hold authority for this policy', 403);
    return { p, delegated, assignment: undefined };
}
export function requests(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op === 'request' || op === 'amend') {
        b = intakeDefaults(s,b);
        let old: Data | undefined;
        if (b.id) {
            old = get(s, 'request', b.id);requireThat(b.revision===old.revision,'Stale request revision',409);
            requirePermission(s, a, 'request.edit', old);
            requireThat(!old.imported, 'Imported historical records cannot grant native authority', 409);
        }
        const entityBinding = bindRequestEntity(s, b, old);
        requireThat(!entityBinding.entity || Boolean(a.session), 'Additional entities require native interactive request creation',409);
        const counterparty = requestSupplier(s, a, b.supplier, old);
        currency(s, b.currency);
        const id = old?.id ?? uid();
        const supplierSnapshot = { id: counterparty.id, name: counterparty.name, address: counterparty.address || '', remitTo: counterparty.remitTo || '', postalState: counterparty.postalState || '', contacts: structuredClone(counterparty.contacts), contractRef: counterparty.contractRef };
        const r = { ...entityBinding, id, requester: old?.requester ?? a.id, requesterEmail:old?.requesterEmail??a.email, requesterOwner:old?.requesterOwner??a.owner, title: text(b.title, 'Request title'), supplier: b.supplier, supplierSnapshot, currency: b.currency, needDate: date(b.needDate), location: text(b.location, 'Location'), costCentre: text(b.costCentre, 'Cost centre'), lines: lines(s, b.lines, old && !a.owner ? { ...a, id: old.requester, email: old.requesterEmail, owner: old.requesterOwner === true } : a), freightMinor: moneyInput(b, 'freightAmount', 'freightMinor', 'Freight', { fallback: 0 }), taxMinor: moneyInput(b, 'taxAmount', 'taxMinor', 'Supplied tax', { fallback: 0 }), terms: text(b.terms, 'Supplier-supplied terms'), revision: (old?.revision ?? 0) + 1, status: 'draft', policy: null, totalMinor: 0 };
        for(const field of ['glAccount','class','shipTo','notes']) if(b[field]!==undefined||old?.[field]!==undefined)(r as Data)[field]=text(b[field]??old?.[field],field);
        if(Object.hasOwn(b,'valuePromise')||Object.hasOwn(old??{},'valuePromise')) (r as Data).valuePromise=normalizeValuePromise(Object.hasOwn(b,'valuePromise')?b.valuePromise:old?.valuePromise,r.currency,r.needDate);
        if (old?.cancellation) requireThat(false, 'A cancellation revision is frozen for independent approval; submit it or create a new proposal', 409);
        if (old?.adoptedDisposition) (r as Data).adoptedDisposition = structuredClone(old.adoptedDisposition);
        if (old?.adoption) { (r as Data).imported = false; (r as Data).adoption = old.adoption; (r as Data).importedSourceRequest = old.importedSourceRequest; }
        if(old?.integration) (r as Data).integration = structuredClone(old.integration);
        if(old?.emailIntake) (r as Data).emailIntake = old.emailIntake;
        if(old?.quoteTerms) (r as Data).quoteTerms = structuredClone(old.quoteTerms);
        (r as Data).poDetails = { blanket: blanketTerms((b.poDetails ?? old?.poDetails)?.blanket), depositTerms: optionalPoText((b.poDetails ?? old?.poDetails)?.depositTerms, 'Deposit/prepayment terms'), notes: optionalPoText((b.poDetails ?? old?.poDetails)?.notes, 'Notes to supplier'), shippingTerms: optionalPoText((b.poDetails ?? old?.poDetails)?.shippingTerms, 'Shipping terms'), buyerContact: optionalPoText((b.poDetails ?? old?.poDetails)?.buyerContact, 'Buyer contact') };
        applyIntakeFields(s, r, { ...old, ...b });
        if (b.charges !== undefined || (old as Data | undefined)?.charges) Object.assign(r, normalizePurchaseCharges(b, old ?? {}));
        allocateLineTax(r.lines, r.taxMinor);
        const business = get(s, 'business', 'main');
        requireThat(business.locations.includes(r.location) && business.costCentres.includes(r.costCentre) && r.lines.every(l => business.projects.includes(l.project)), 'Use configured location, cost centre and project');
        requireThat(new Set(r.lines.map(l => l.id)).size === r.lines.length, 'Line IDs must be unique');
        requirePermission(s, a, old ? 'request.edit' : 'request.create', r);
        if (old) requireThat(!all(s, 'orderClosure').some(c => c.active && get(s, 'order', c.order).request === old!.id), 'Reopen closed balances before amending this request', 409);
        if (old)
            requireThat(r.lines.every(l => !b.lines.find((x: Data) => x.id === l.id) || old!.lines.some((x: Data) => x.id === l.id)), 'Line ID is outside this request');
        for (const l of r.lines) {
            if (l.catalogue) {
                const item = get(s, 'catalogue', l.catalogue);
                requireThat(item.currency === r.currency && item.supplier === r.supplier, 'Catalogue supplier and currency must match the request');
            }
        }
        r.totalMinor = requestTotal(r);
        requireEntityPurchase(s, r);
    requireThat(!all(s,'order').some(order=>order.request===id&&order.supplierGroup),'Existing supplier groups require a separate supported disposition; grouped amendments are unavailable',409);
        const issued = all(s, 'order').find(o => o.request === id && (o.status === 'issued' || o.status === 'adopted' || o.status === 'amendment-pending'));
        if (issued) {
            if (old?.adoption) { requireThat(r.currency === issued.currency, 'Use the reviewed replacement-remainder disposition to change an adopted currency', 409); requireThat(r.supplier === issued.supplier, 'Use the reviewed replacement-remainder disposition to change an adopted supplier', 409); }
            requireThat(Boolean(issued.poDetails?.blanket) === Boolean((r as Data).poDetails.blanket), 'An issued PO retains its blanket or ordinary basis; create a separate request for another basis', 409);
            if (issued.poDetails?.blanket) requireThat(r.currency === issued.currency, 'A blanket amendment retains its currency', 409);
            (r as Data).amends = issued.id;
            for (const l of r.lines) {
                const prior = issued.lines.find((p: Data) => p.id === l.id);
                requireThat(!prior || Boolean(prior.service) === Boolean(l.service), 'Issued lines retain their quantity or service receiving basis', 409);
                if (prior?.service) {
                    requireThat(prior.service.mode === l.service?.mode, 'An issued service line retains its receiving basis',409);
                    const value = servicePosition(s, issued, prior);
                    requireThat(l.totalMinor >= value.acceptedMinor + value.cancelledMinor, 'Amendment cannot erase received service value', 409);
                    const completed = [...(prior.carriedMilestones ?? []), ...all(s, 'receipt').filter(e => e.order === issued.id && e.line === prior.id && e.milestone).map(e => e.milestone)];
                    if (prior.service.mode === 'milestone') requireThat(completed.every(mid => { const before = prior.service.milestones.find((m: Data) => m.id === mid), after = l.service?.milestones.find((m: Data) => m.id === mid); return before && after && before.valueMinor === after.valueMinor && before.name === after.name; }), 'Accepted named milestones retain their approved identity and value',409);
                    Object.assign(l, { carriedAcceptedMinor: value.acceptedMinor, carriedCancelledMinor: value.cancelledMinor, carriedMilestones: [...(prior.carriedMilestones ?? []), ...all(s, 'receipt').filter(e => e.order === issued.id && e.line === prior.id && e.milestone).map(e => e.milestone)] });
                }
                const events = all(s, 'receipt').filter(e => e.order === issued.id && e.line === l.id);
                const accepted = (prior?.carriedAccepted ?? 0) + events.reduce((n, e) => n + (e.event === 'receive' ? e.q : e.event === 'return' ? -e.q : 0), 0);
                const cancelled = (prior?.carriedCancelled ?? 0) + events.filter(e => e.event === 'cancel').reduce((n, e) => n + e.q, 0);
                requireThat(l.q >= accepted + cancelled, 'Amended quantity cannot erase received or cancelled quantities');
                Object.assign(l, { carriedAccepted: accepted, carriedCancelled: cancelled });
            }
            requireThat(issued.lines.every((p: Data) => r.lines.some(l => l.id === p.id)), 'Amendments retain each original line');
            // Editing invalidates unissued amendment reservations, but never the original obligation.
            const originalLines=issued.lines.map((l:Data)=>{const current:Data=r.lines.find(x=>x.id===l.id)!;return {...l,carriedAccepted:current.carriedAccepted,carriedCancelled:current.carriedCancelled}});
            const originalLiability=approvalAmount({...issued,lines:originalLines},s);
            const groups=new Map<string,Data>();for(const e of all(s,'commitment').filter(e=>e.request===id)){const k=e.policy+':'+e.currency;const g=groups.get(k)??{policy:e.policy,currency:e.currency,amount:0};g.amount+=e.amountMinor;groups.set(k,g)}
            // A draft can release authority, never grant unapproved replenishment.
            for(const g of groups.values()){const target=g.policy===issued.policy&&g.currency===issued.currency?Math.min(originalLiability,g.amount):0;if(g.amount!==target)ledger(s,a,{...old,policy:g.policy,currency:g.currency},target-g.amount,'unissued-amendment-release')}
            put(s, 'order', issued.id, { ...issued, status: 'amendment-pending' });
        }
        else if (old?.status === 'approved' || old?.approvalRoute) {
            const current = all(s, 'commitment').filter(e => e.request === id).reduce((n, e) => n + e.amountMinor, 0);
            ledger(s, a, old, -current, 'amendment-release');
        }
        for (const o of all(s, 'order').filter(o => o.request === id && !operationalOrder(s, o)))
            put(s, 'order', o.id, { ...o, status: 'superseded' });
        put(s, 'request', id, r);
        put(s, 'revision', `${id}:${r.revision}`, { ...r, request: id });
        audit(s, a, op, id, { revision: r.revision, reason: old ? text(b.reason, 'Amendment reason') : 'Created' });
        return r;
    }
    if (['submit', 'decision'].includes(op)) {
        const r = get(s, 'request', b.id);
        requireEntityPurchase(s, r);
        requirePermission(s,a,op==='decision'?'request.approve':'request.edit',r);
        requireThat(r.revision === b.revision, 'Stale request revision', 409);
        if (r.purchaseType !== 'travel') requestSupplier(s, a, r.supplier, r);
        requireThat(!r.imported, 'Imported status cannot grant native authority', 409);
        if (op === 'submit') {
            requirePermission(s, a, 'request.edit', r);
            requireThat(a.owner || r.requester === a.id || r.requesterEmail===a.email, 'Only requester may submit', 403);
            requireThat(['draft', 'returned', 'rejected'].includes(r.status), 'Request is not a draft', 409);
            for (const line of r.lines) if (line.catalogue) { const item = get(s, 'catalogue', line.catalogue); requireCatalogueAccess(s, a, item); requireThat(item.approved && currentPrice(item), 'Catalogue item is unapproved or outside price validity; revise the draft', 409); }
            requiredCatalogueFiles(s, r);
            applyIntakeFields(s, r, r, true);
            r.attachmentIds = all(s, 'attachment').filter(file => file.kind === 'request' && file.record === r.id && !file.erasure).map(file => file.id);
            put(s, 'revision', `${r.id}:${r.revision}`, {...r, request: r.id});
            const p = policies(s, r)[0];
            requireThat(p, 'No amount/category/project authority policy covers this request', 409);
            requireThat(!all(s, 'scimUser').some(user => user.userName === p.approver && user.active === false), 'The designated approver was deactivated; the owner must select a current approval policy before submission', 409);
            startChain(s,a,r,p) ?? put(s, 'request', r.id, { ...r, status: 'pending', policy: p.id });
            openReviews(s,a,get(s,'request',r.id));
            audit(s, a, op, r.id, { revision: get(s,'request',r.id).revision });
            return get(s, 'request', r.id);
        }
        const priorStep = b.chainStep && all(s,'decision').find(decision => decision.request === r.id && decision.revision === r.revision && decision.chainStep === b.chainStep && decision.approvalAttempt === r.approvalAttempt);
        requireThat(!priorStep, `Step already decided by ${priorStep?.email ?? ''} at ${priorStep?.at ?? ''}`,409);
        requireThat(r.status === 'pending' && !r.imported, 'Request is not pending native authority', 409);
        if(b.decision === 'approved') requireReviews(s,r);
        const chained=chainDecision(s,a,r,b); if(chained) return chained;
        const { p, delegated, assignment } = authorizedApproval(s, a, r);
        const decision = b.decision;
        requireThat(['approved', 'rejected', 'returned'].includes(decision), 'Choose approve, reject or return');
        const reason = text(b.reason, 'Decision reason');
        if (decision === 'approved') {
            const current = all(s, 'commitment').filter(e => e.request === r.id && e.policy===r.policy && e.currency===r.currency).reduce((n, e) => n + e.amountMinor, 0);
            const desired = approvalAmount(r,s);
            const delta = Math.max(0, desired - current);
            requireThat(reservationAvailable(s,r,delta), 'Budget exhausted by existing commitments', 409);
            if (delta)
                ledger(s, a, r, delta, r.amends ? 'amendment-reservation' : 'reservation');
        }
        const id = uid();
        put(s, 'decision', id, { request: r.id, revision: r.revision, decision, reason, actor: a.id, email: a.email, owner: a.owner, operatorVersion:a.version, at: new Date().toISOString(), policy: p.id, policyVersion:s.get('policy:'+p.id)!.revision, policySnapshot:structuredClone(p), delegation: delegated?.id ?? null, ...(assignment ? {scimTransfer: assignment.id} : {}) });
        put(s, 'request', r.id, { ...r, status: decision });
        audit(s, a, op, r.id, { revision: r.revision, decision, reason, decisionId: id });
        return get(s, 'request', r.id);
    }
    if (op === 'quote') {
        const r = get(s, 'request', b.request);
        requirePermission(s, a, 'request.edit', r);
        supplier(s, b.supplier);
        currency(s, b.currency);
        const id = uid();
        const ls = lines(s, b.lines, a);
        requirePermission(s, a, 'request.edit', { ...r, lines: ls });
        const q = { id, at: new Date().toISOString(), sequence: all(s, 'quote').filter(q => q.request === r.id && q.revision === r.revision).length + 1, request: r.id, revision: r.revision, supplier: b.supplier, currency: b.currency, lines: ls, freightMinor: moneyInput(b, 'freightAmount', 'freightMinor', 'Freight', { optional: true }), taxMinor: moneyInput(b, 'taxAmount', 'taxMinor', 'Supplied tax', { optional: true }), delivery: b.delivery ? date(b.delivery) : null, conditions: b.conditions ? text(b.conditions, 'Conditions') : null, source: text(b.source, 'Quote source evidence'), missing: [] as string[] };
        q.missing = ['freightMinor', 'taxMinor', 'delivery', 'conditions'].filter(k => (q as Data)[k] === null);
        put(s, 'quote', id, q);
        audit(s, a, op, r.id, { quote: id });
        return q;
    }
    if (op === 'attachment') {
        const kind = text(b.kind, 'Record kind');
        requireThat(['request', 'intakeDraft', 'supplier', 'order', 'invoice', 'agreement'].includes(kind), 'Unsupported attachment record');
        const r = get(s, kind, b.record);
        requireThat(b.privateSupplierDocument === undefined || typeof b.privateSupplierDocument === 'boolean', 'Private supplier document flag must be boolean');
        requireThat(!b.privateSupplierDocument || kind === 'supplier', 'Private compliance evidence belongs to a supplier');
        if (kind === 'intakeDraft') {
            requirePermission(s, a, 'request.create');
            requireThat(r.requester === a.id && r.requesterEmail === a.email && r.status === 'draft', 'Draft outside your scope', 403);
            requireThat(b.version === r.version, 'Draft changed; reload before attaching', 409);
            if(r.emailIntake){const intake=get(s,'emailIntake',r.emailIntake);requireThat(intake.requester===a.id&&intake.status==='draft','Email intake is no longer assigned and editable',409);}
        }
        else if (kind === 'request') {
            requirePermission(s, a, 'request.edit', r);
        }
        else if (kind === 'agreement') can(s, a, 'owner');
        else requirePermission(s, a, kind === 'supplier' ? 'procurement.manage' : kind === 'invoice' ? 'invoice.capture' : 'receive', r);
        requireThat(typeof b.base64 === 'string' && b.base64.length > 0 && b.base64.length <= 1400000, 'Attachment must contain up to 1 MB of bytes');
        let bytes;
        try {
            bytes = atob(b.base64);
        }
        catch {
            requireThat(false, 'Invalid attachment bytes');
        }
        requireThat(bytes!.length<=1000000,'Attachment must contain up to 1 MB of bytes');
        const id = uid();
        put(s, 'attachment', id, { kind, record: r.id, ...(b.privateSupplierDocument ? { privateSupplierDocument: true } : {}), name: text(b.name, 'Filename', 200), mediaType: text(b.mediaType ?? 'application/octet-stream', 'Media type', 150), base64: b.base64, size: bytes!.length, actor: a.id, at: new Date().toISOString() });
        audit(s, a, op, r.id, { attachment: id });
        if(kind==='intakeDraft') put(s,'intakeDraft',r.id,{...r,version:r.version+1});
        if (kind === 'invoice') checkInvoiceAttachment(s, a, get(s, 'attachment', id));
        return { id };
    }
}
/** What approving reserves, with the invoices already billed against a blanket PO's cap. */
export function approvalAmount(r: Data, s: State) { return approvalOf(r, r.poDetails?.blanket ? blanketBilled(s, r) : 0); }
