import { recordScope } from './documents';
import { all, audit, can, get, put, requireThat, text, uid, own, type Actor, type Data, type State, roles } from './types';
const workflows = { intake: ['need', 'supplied evidence', 'supplier', 'quantity', 'project', 'need date'], rfq: ['nominated suppliers', 'scope', 'response deadline', 'supplied offers'], renewal: ['agreement', 'usage evidence', 'notice date', 'keep/change/cancel options'], exception: ['PO', 'receipt or invoice evidence', 'correction or escalation'], negotiation: ['known counterparty', 'owner price bounds', 'owner term bounds', 'nonbinding draft'] };
export function preparation(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (op === 'prepare') {
        requireThat(roles(s,a).length,'Active business capability required',403);
        requireThat(Object.hasOwn(workflows, b.workflow), 'Unknown preparation workflow');
        const refs = (b.references ?? []).map((ref: Data) => { requireThat(['request', 'supplier', 'order', 'invoice', 'attachment'].includes(ref.kind), 'Unsupported source record'); const row = get(s, ref.kind, ref.id); recordScope(s, a, ref.kind === 'attachment' ? row.kind : ref.kind, ref.kind === 'attachment' ? get(s, row.kind, row.record) : row); return { kind: ref.kind, id: ref.id, version: s.get(`${ref.kind}:${ref.id}`)!.revision }; });
        const fields = b.fields ?? {};
        const requirements = workflows[b.workflow as keyof typeof workflows];
        const missing = requirements.filter(k => !fields[k]);
        const draft = text(b.draft, 'Editable human preparation draft', 20000);
        const id = uid();
        put(s, 'agentRun', id, { workflow: b.workflow, actor: a.id, mode: 'human-preparation', model: null, references: refs, fields, missing, draft, version: 1, at: new Date().toISOString(), actions: [] });
        audit(s, a, op, id);
        return get(s, 'agentRun', id);
    }
    if (op === 'edit-preparation') {
        requireThat(roles(s,a).length,'Active business capability required',403);
        const run = get(s, 'agentRun', b.id);
        requireThat(a.owner || run.actor === a.id, 'Preparation outside your scope', 403);
        requireThat(run.version === b.version, 'Preparation changed', 409);
        put(s, 'agentRun', run.id, { ...run, draft: text(b.draft, 'Draft', 20000), version: run.version + 1 });
        audit(s, a, op, run.id);
        return get(s, 'agentRun', run.id);
    }
    if (op === 'propose-action') {
        requireThat(roles(s,a).length,'Active business capability required',403);
        const run = get(s, 'agentRun', b.run);
        requireThat(run.actor === a.id || a.owner, 'Preparation outside your scope', 403);
        requireThat(['submit', 'decision', 'convert', 'issue', 'receipt'].includes(b.action), 'Unsupported action');
        requireThat(b.input && typeof b.input === 'object', 'Action input required');
        const id = uid();
        put(s, 'proposedAction', id, { run: run.id, runVersion: run.version, actor: a.id, action: b.action, input: b.input, status: 'proposed', references: run.references });
        audit(s, a, op, id);
        return get(s, 'proposedAction', id);
    }
}
export function actionInput(s: State, a: Actor, b: Data) { const p = get(s, 'proposedAction', b.id), run = get(s, 'agentRun', p.run); requireThat(p.status === 'proposed' && p.runVersion === run.version, 'Action or input version stale', 409); requireThat(a.owner || p.actor === a.id, 'Action outside your scope', 403); requireThat(p.references.every((r: Data) => s.get(`${r.kind}:${r.id}`)?.revision === r.version), 'Source records changed', 409); return p; }
