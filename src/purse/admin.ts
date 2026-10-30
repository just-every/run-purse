import { activeEntity, entityId } from './entities';
import { pauseTravelReleaseRule } from './travel-release-rule';
import { budgetDimensionInput, sameBudgetDimensions } from './budget-dimensions';
import { budgetPeriod } from './budget-position';
import { policyWorkflow } from './approval-chain';
import { accessAdministration, requireAdministrativeEdit } from './access-admin';
import { hasSupplierReviewHold, initializeSupplierMatching } from './supplier-identity';
import { moneyInput } from './money';
import { allowed, all, audit, can, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';
export function administration(s: State, a: Actor, op: string, b: Data): Data | undefined {
    const access = accessAdministration(s, a, op, b); if (access) return access;
    if (op === 'business') {
        const currencies = (b.currencies ?? ['AUD']).map((c: unknown) => text(c, 'Currency'));
        requireThat(currencies.length && currencies.every((c: string) => /^[A-Z]{3}$/.test(c)), 'Use ISO currency codes');
        for(const field of ['locations','costCentres','projects']){requireThat(Array.isArray(b[field])&&b[field].length>0&&b[field].length<=100,field+' requires 1–100 codes');requireThat(b[field].every((v:unknown)=>typeof v==='string'&&v.trim().length>0&&v.length<=200),field+' must contain nonempty names');requireThat(new Set(b[field]).size===b[field].length,field+' contains duplicates')}
        const timezone = Object.hasOwn(b, 'timezone') ? b.timezone || undefined : s.get('business:main')?.value.timezone;
        try { if (timezone) new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(); } catch { requireThat(false,'Use a valid IANA installation timezone'); }
        const next = { timezone, name: text(b.name, 'Business name'), currencies, locations: b.locations ?? [], costCentres: b.costCentres ?? [], projects: b.projects ?? [] };
        requireAdministrativeEdit(s, a, s.get('business:main')?.value, next);
        if (s.get('business:main')?.value.timezone !== timezone) pauseTravelReleaseRule(s, 'Business calendar changed; renew timed release consent');
        put(s, 'business', 'main', next);
        initializeSupplierMatching(s);
        audit(s, a, op, 'main');
        return get(s, 'business', 'main');
    }
    if (op === 'policy') {
        currency(s, b.currency);
        const id = b.id ?? uid(), oldPolicy = s.get('policy:'+id)?.value;
        const entity = b.entity ?? oldPolicy?.entity ?? 'main';
        activeEntity(s, entity);
        requireThat(!oldPolicy || entity === entityId(oldPolicy), 'Policy entity is immutable; create a separate policy',409);
        requireThat(entity === 'main' || b.currency === 'USD', 'Additional-entity policies require USD');
        const next: Data = { ...(entity !== 'main' ? {entity} : {}), name: text(b.name, 'Policy name'), currency: b.currency, category: b.category || '*', project: b.project || '*', limitMinor: moneyInput(b, 'limitAmount', 'limitMinor', 'Authority limit'), budgetMinor: moneyInput(b, 'budgetAmount', 'budgetMinor', 'Budget'), approver: text(b.approver, 'Approver email').toLowerCase(), active: b.active !== false, ...policyWorkflow(b,s.get('policy:'+id)?.value), ...budgetDimensionInput(b,s.get('policy:'+id)?.value,all(s,'intakeForm')), ...(budgetPeriod(b,s.get('policy:'+id)?.value) ? {budgetPeriod:budgetPeriod(b,s.get('policy:'+id)?.value)} : {}), ...(b.costCentre ? { costCentre: text(b.costCentre,'Policy department') } : {}) };
        requireThat(!next.location || next.location==='*' || get(s,'business','main').locations.includes(next.location), 'Choose a configured budget location');
        const previous=s.get('policy:'+id)?.value, used=['request','revision','order','decision','commitment'].some(kind=>all(s,kind).some(record=>record.policy===id||(record.budgetAllocations??[]).some((share:Data)=>share.policy===id)));
        requireThat(a.owner || previous?.internationalTravelReviewer === next.internationalTravelReviewer, 'Only the current native owner may configure international travel review',403);
        requireThat(!used || JSON.stringify(previous?.budgetPeriod??null)===JSON.stringify(next.budgetPeriod??null),'A used budget period is fixed; create another dated policy',409);
        requireThat(!used || !previous?.budgetPeriod || previous.costCentre===next.costCentre,'A used dated budget retains its department; create another policy',409);
        requireThat(!used || !previous?.budgetPeriod || (['currency','category','project'] as const).every(field=>previous[field]===next[field]),'A used dated budget retains its coding and currency; create another policy',409);
        requireThat(!used || !previous?.budgetPeriod || sameBudgetDimensions(previous,next),'A used dated budget retains its dimensions; create another policy',409);
        if(next.budgetPeriod)requireThat(all(s,'request').filter(request=>request.policy===id).every(request=>request.needDate>=next.budgetPeriod!.from&&request.needDate<=next.budgetPeriod!.through),'Existing purchases fall outside that budget period',409);
        requireAdministrativeEdit(s, a, s.get('policy:' + id)?.value, next);
        put(s, 'policy', id, next);
        audit(s, a, op, id);
        return get(s, 'policy', id);
    }
    if (op === 'delegation') {
        can(s, a, 'approver');
        const p = get(s, 'policy', b.policy);
        requireThat(a.owner || p.approver === a.email, 'Only policy approver may delegate', 403);
        requireThat(all(s, 'member').some(m => m.email === b.delegate && m.active && allowed(s,{id:m.id,email:m.email,owner:false,dev:false,session:'',version:0},'request.approve')), 'Delegate must be an active approver');
        const expires = text(b.expires, 'Expiry');
        requireThat(Number.isFinite(Date.parse(expires)) && Date.parse(expires) > Date.now(), 'Expiry must be in the future');
        const id = uid();
        put(s, 'delegation', id, { policy: p.id, from: p.approver, delegate: b.delegate, expires, reason: text(b.reason, 'Delegation reason'), active: true });
        audit(s, a, op, id);
        return get(s, 'delegation', id);
    }
    if (op === 'revoke-delegation') {
        can(s, a, 'approver');
        const d = get(s, 'delegation', b.id);
        requireThat(a.owner || d.from === a.email, 'Delegation outside your scope', 403);
        put(s, 'delegation', b.id, { ...d, active: false });
        audit(s, a, op, b.id);
        return { id: b.id };
    }
}
export function supplier(s: State, id: string) { const v = get(s, 'supplier', id); requireThat(!v.mergedInto, 'Supplier merged; choose the surviving supplier and renew purchasing authority', 409); requireThat(v.status !== 'blocked', 'Supplier blocked: ' + v.reason, 409); requireThat(!hasSupplierReviewHold(s,id) && !['proposed','invited','onboarding','vendor_approval'].includes(v.status), 'Supplier pending vendor approval', 409); requireThat(v.status !== 'pending_review', 'Supplier pending OFAC compliance review', 409); requireThat(['active','preferred'].includes(v.status), 'Supplier is not active for purchasing',409); requireThat(v.screenings?.length, 'Supplier requires OFAC screening before activation', 409); return v; }
export function currency(s: State, c: string) { requireThat(get(s, 'business', 'main').currencies.includes(c), 'Currency is not enabled for this business'); }
