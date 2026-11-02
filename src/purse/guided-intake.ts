import { approvalRouteView } from './approval-chain';
import { containsProtectedInput } from './protected-context-fields.mjs';
import { emailIntake, intakeScope } from './email-intake';
import { proposedSupplier } from './supplier-proposals';
import { requests, policies } from './requests';
import { all, audit, get, put, requirePermission, requireThat, uid, type Actor, type Data, type State } from './types';

const headerKeys = ['title','supplier','currency','needDate','location','costCentre','terms','freightAmount','taxAmount','intakeForm','answers','glAccount','customFields'];
const lineKeys = ['description','quantity','unitAmount','unitMinor','category','project','catalogue','partNumber','unit','allocations','glAccount','customFields'];
function partial(input: Data) {
    requireThat(!containsProtectedInput(input), 'Protected tax, bank and credential fields cannot be saved in intake drafts');
    requireThat(input && typeof input === 'object' && !Array.isArray(input) && JSON.stringify(input).length <= 100000, 'Draft fields must fit 100 kB');
    const value: Data = Object.fromEntries(headerKeys.filter(key => Object.hasOwn(input, key)).map(key => [key, structuredClone(input[key])]));
    requireThat(Array.isArray(input.lines ?? []) && (input.lines ?? []).length <= 100, 'Use up to 100 lines');
    value.lines = (input.lines ?? []).map((line: Data) => Object.fromEntries(lineKeys.filter(key => Object.hasOwn(line, key)).map(key => [key, structuredClone(line[key])])));
    return value;
}
export function ownGuidedDraft(s: State, a: Actor, draft: Data) {
    requirePermission(s, a, 'request.create');
    requireThat(draft.requester === a.id && draft.requesterEmail === a.email, 'Only the requester may use this saved draft', 403);
    if (draft.emailIntake) { const intake = get(s, 'emailIntake', draft.emailIntake); intakeScope(s, a, intake); requireThat(intake.requester === a.id && intake.status === 'draft', 'Email intake is no longer assigned and editable', 409); }
}
export async function guidedIntake(s: State, a: Actor, op: string, b: Data, env?: any) {
    if (!['intake-draft','intake-draft-file','intake-route','intake-complete'].includes(op)) return;
    requirePermission(s, a, 'request.create');
    const old = b.id ? get(s, 'intakeDraft', b.id) : undefined;
    if (old) { ownGuidedDraft(s, a, old); requireThat(old.status === 'draft' && b.version === old.version, 'Draft changed or completed; reload', 409); }
    if (op === 'intake-draft') {
        const fields = partial(b.fields), form = get(s, 'intakeForm', fields.intakeForm);
        requireThat(form.active, 'Form is inactive', 409);
        if (b.emailIntake || old?.emailIntake) {
            const intake = get(s, 'emailIntake', old?.emailIntake ?? b.emailIntake); intakeScope(s, a, intake);
            requireThat(intake.requester === a.id && intake.status === 'draft', 'Only assigned requester may complete email intake', 403);
            requireThat(b.emailIntakeVersion === intake.version, 'Email source changed; reload and review before saving', 409);
        }
        if (b.proposal) fields.supplier = proposedSupplier(s, a, b.proposal, 'guided-intake');
        const draft = { id: old?.id ?? uid(), requester: a.id, requesterEmail: a.email, fields, version: (old?.version ?? 0) + 1, status: 'draft',
            ...(old?.emailIntake || b.emailIntake ? { emailIntake: old?.emailIntake ?? b.emailIntake, emailIntakeVersion: b.emailIntakeVersion } : {}), updatedAt: new Date().toISOString() };
        put(s, 'intakeDraft', draft.id, draft); audit(s, a, op, draft.id, { version: draft.version }); return draft;
    }
    requireThat(old, 'Save the draft first');
    if (op === 'intake-draft-file') {
        const file = requests(s, a, 'attachment', { ...b, kind: 'intakeDraft', record: old.id });
        requireThat(file, 'Attachment creation failed');
        const {base64, ...metadata} = get(s,'attachment',file.id);
        return { ...get(s, 'intakeDraft', old.id), file: metadata };
    }
    // A clone exercises the same complete purchasing validation, without creating authority or records.
    if (op === 'intake-route') {
        const steps: Data[] = [];
        if (s.get('supplier:' + old.fields.supplier)?.value.status === 'proposed') steps.push({ kind: 'new-supplier', label: 'New supplier review', authority: 'Authorized supplier administrator', blockingPurchasing: true });
        try {
            const trial = structuredClone(s), request = requests(trial, a, 'request', old.fields)!;
            const policy = policies(trial, request)[0];
            if (policy) steps.push({ kind: 'approval', label: policy.name, approver: policy.approver, policy: policy.id });
            for (const file of all(trial,'attachment').filter(file=>file.kind==='intakeDraft'&&file.record===old.id)) put(trial,'attachment',file.id,{...file,kind:'request',record:request.id});
            const submitted = requests(trial,a,'submit',{id:request.id,revision:request.revision})!;
            const predicted = approvalRouteView(trial,a,submitted).approvalPreview;
            const primary = steps.findIndex(step=>step.kind==='approval');
            if (primary >= 0) steps.splice(primary,1,...predicted.map((step:Data)=>({kind:'approval',label:step.id==='primary'?policy.name:step.reason,approver:step.emails.join(', '),policy:policy.id,step:step.id,mode:step.mode})));
            return { steps, ready: true, message: 'Predicted from current policy; submission checks it again.' };
        } catch (error) { return { steps, ready: false, message: (error as Error).message }; }
    }
    requireThat(b.consent === true, 'Confirm creating this purchase request draft');
    const request = old.emailIntake
        ? await emailIntake(s, a, 'email-intake-complete', { id: old.emailIntake, version: old.emailIntakeVersion, request: old.fields }, env)
        : requests(s, a, 'request', old.fields);
    requireThat(request, 'Request creation failed');
    for (const file of all(s, 'attachment').filter(file => file.kind === 'intakeDraft' && file.record === old.id)) { put(s, 'attachment', file.id, { ...file, kind: 'request', record: request.id }); audit(s,a,'attachment',request.id,{attachment:file.id,fromDraft:old.id}); }
    put(s, 'intakeDraft', old.id, { ...old, status: 'completed', request: request.id, version: old.version + 1 });
    audit(s, a, op, request.id, { draft: old.id, consent: true }); return request;
}
