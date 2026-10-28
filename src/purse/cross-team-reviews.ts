import { createHash } from 'node:crypto';
import { all, allowed, audit, get, put, requirePermission, requireThat, text, uid, type Actor, type Data, type State } from './types';

export const reviewTypes = ['security', 'privacy', 'it', 'legal', 'finance'];
/** A named review never lends record scope or purchase approval to its assignee. */
export function reviewPlan(s: State, input: unknown) {
    requireThat(Array.isArray(input) && input.length <= 5, 'Use up to five cross-team reviews');
    const plan = input.map((step: Data) => {
        requireThat(step && reviewTypes.includes(step.type), 'Choose a native review type');
        const reviewer = text(step.reviewer, 'Reviewer', 254).toLowerCase();
        requireThat(all(s, 'member').some(member => member.active && member.email.toLowerCase() === reviewer), 'Choose an active member reviewer');
        requireThat(Number.isInteger(step.stage) && step.stage >= 1 && step.stage <= 5, 'Use review stages from 1 to 5');
        return { type: step.type, reviewer, stage: step.stage };
    });
    requireThat(new Set(plan.map(step => step.type)).size === plan.length, 'Each review type appears once');
    return plan.sort((a,b) => a.stage - b.stage || a.type.localeCompare(b.type));
}
export function requiredReviews(s: State, r: Data): Data[] {
    const types = new Set([r.purchaseType, r.intakeFormSnapshot?.purchaseType, ...r.lines.map((line: Data) => line.category.toLowerCase())].filter(Boolean));
    // All matching forms apply, including requests created without a form picker.
    return all(s, 'intakeForm').filter(form => form.active && types.has(form.purchaseType)).flatMap(form => (form.reviews ?? []).map((step: Data) => ({ ...step, form: form.id, formVersion: form.version })));
}
export const reviewBasis = (plan: Data[]) => createHash('sha256').update(JSON.stringify(plan)).digest('hex');
export function reviewSatisfied(s: State, review: Data, r: Data) {
    const decision = review.events.at(-1), live = s.get('nativeReviewAuthority:' + review.id)?.value;
    return !review.erasure && decision?.decision === 'approved' && live?.version === review.version
        && live?.actor === decision.actor && live?.operatorVersion === decision.operatorVersion
        && allowed(s, { id: decision.actor, email: decision.email, owner: false, dev: false, session: '', version: decision.operatorVersion }, 'request.read', r);
}
export function matchingReviews(s: State, r: Data) {
    const plan = requiredReviews(s,r), basis = reviewBasis(plan);
    const submitted = all(s,'crossTeamReview').filter(row => row.request === r.id && row.revision === r.revision);
    return { plan, basis, configurationCurrent: submitted.every(row => row.basis === basis), rows: submitted.filter(row => row.basis === basis) };
}
export function requireReviews(s: State, r: Data) {
    const {plan,rows,configurationCurrent} = matchingReviews(s,r);
    requireThat(configurationCurrent, 'Review configuration changed; revise and submit the request',409);
    requireThat(plan.every(step => rows.some(row => row.form === step.form && row.type === step.type && reviewSatisfied(s,row,r))), 'Every required cross-team review must approve this exact revision with current authority',409);
    return rows;
}
export function openReviews(s: State, a: Actor, r: Data) {
    const {plan,basis,rows} = matchingReviews(s,r);
    for(const step of plan) if(!rows.some(row => row.form === step.form && row.type === step.type)) {
        const id = uid(), at = new Date().toISOString();
        put(s,'crossTeamReview',id,{id,request:r.id,revision:r.revision,basis,...step,version:0,events:[],at});
        audit(s,a,'cross-review-open',r.id,{review:id,revision:r.revision,basis,...step});
    }
}
export function reviews(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if(op !== 'cross-review-record') return;
    const row = get(s,'crossTeamReview',b.id), r = get(s,'request',row.request);
    requirePermission(s,a,'request.read',r);
    requireThat(a.email.toLowerCase() === row.reviewer && !a.owner, 'Only the assigned active member may review',403);
    requireThat(!r.imported && !row.erasure && r.status === 'pending' && r.revision === row.revision && b.revision === r.revision && row.basis === reviewBasis(requiredReviews(s,r)), 'Review belongs to an older revision or configuration; submit the current draft',409);
    requireThat(b.version === row.version, 'Review changed; reload',409);
    requireThat(row.events.length < 100, 'Review history is full; revise the request',409);
    const {rows} = matchingReviews(s,r);
    requireThat(rows.filter(other => other.stage < row.stage).every(other => reviewSatisfied(s,other,r)), 'Earlier review stages must approve first',409);
    requireThat(['question','approved','rejected'].includes(b.decision), 'Choose a question, approval or rejection');
    const body = text(b.body,'Review notes',10000), version = row.version + 1, at = new Date().toISOString(), files: string[] = [];
    if(b.file) {
        requireThat(typeof b.file.base64 === 'string' && b.file.base64.length > 0 && b.file.base64.length <= 1400000, 'Review file must contain up to 1 MB of bytes');
        let bytes = ''; try { bytes = atob(b.file.base64); } catch { requireThat(false,'Invalid review file bytes'); }
        requireThat(bytes.length > 0 && bytes.length <= 1000000,'Review file must contain up to 1 MB of bytes');
        requireThat(row.events.reduce((n: number,e: Data) => n + e.files.length,0) < 10,'Use up to ten review files');
        const id = uid(); files.push(id);
        put(s,'attachment',id,{id,kind:'crossTeamReview',record:row.id,name:text(b.file.name,'Filename',200),mediaType:text(b.file.mediaType ?? 'application/octet-stream','Media type',150),base64:b.file.base64,size:bytes.length,actor:a.id,at});
        audit(s,a,'attachment',row.id,{attachment:id,parentKind:'request',parentRecord:r.id});
    }
    const event = {version,decision:b.decision,body,files,actor:a.id,email:a.email,operatorVersion:a.version,at};
    const next = {...row,version,events:[...row.events,event]};
    put(s,'crossTeamReview',row.id,next);
    // This is installation authority. It is persisted separately and never exported.
    put(s,'nativeReviewAuthority',row.id,{version,actor:a.id,operatorVersion:a.version});
    audit(s,a,op,r.id,{review:row.id,revision:r.revision,version,snapshot:event});
    return next;
}
export function reviewView(s: State, a: Actor, r: Data) {
    const {plan,basis,configurationCurrent} = matchingReviews(s,r);
    const rows: Data[] = all(s,'crossTeamReview').filter(row => row.request === r.id && allowed(s,a,'request.read',get(s,'revision',row.request+':'+row.revision))).sort((a,b) => b.revision - a.revision || a.stage - b.stage || a.type.localeCompare(b.type) || a.id.localeCompare(b.id)).map(row => {
        const current = row.revision === r.revision && row.basis === basis;
        const stageReady = all(s,'crossTeamReview').filter(other => other.request === r.id && other.revision === r.revision && other.basis === basis && other.stage < row.stage).every(other => reviewSatisfied(s,other,r));
        return {...row,current,satisfied:current && reviewSatisfied(s,row,r),mayReview:current && stageReady && !row.erasure && r.status === 'pending' && !a.owner && a.email.toLowerCase() === row.reviewer};
    });
    return {rows,required:plan.length,configurationChanged:!configurationCurrent,complete:configurationCurrent && plan.every(step => rows.some(row => row.form === step.form && row.type === step.type && row.satisfied))};
}
