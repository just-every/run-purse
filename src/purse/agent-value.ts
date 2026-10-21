import { projectProtectedContext, protectedContextPending } from './protected-context';
import { approvedValueRequest, buildValueSnapshot, canonicalValue, parseSeatOriginal, valueDigest, valueMode, valueDelivery } from './agent-value-evidence';
import { all, allowed, audit, can, date, get, key, own, put, requirePermission, requireThat, roles, text, uid, type Actor, type Data, type State } from './types';
export { buildValueSnapshot, valueDelivery } from './agent-value-evidence';

function enabled(s: State) {
    const policy = s.get('valuePolicy:main')?.value;
    requireThat(policy?.enabled === true, 'Value tracking is paused; owner must enable it', 409);
    return policy;
}
function currentRequest(s: State, a: Actor, b: Data) {
    requireThat(roles(s, a).length, 'Active business capability required', 403);
    const r = get(s, 'request', b.request); own(s, a, r);
    approvedValueRequest(s, r, b.revision);
    return r;
}

export async function agentValue(s: State, a: Actor, op: string, b: Data): Promise<Data | undefined> {
    if (!['value-policy', 'value-seat-import', 'value-report', 'value-confirm'].includes(op)) return;
    if (op === 'value-policy') {
        can(s, a, 'owner');
        const previous = s.get('valuePolicy:main')?.value;
        requireThat(b.version === (previous?.version ?? 0), 'Value policy changed; reload', 409);
        requireThat(typeof b.enabled === 'boolean', 'Choose enabled or paused');
        const entry = { version: (previous?.version ?? 0) + 1, enabled: b.enabled, actor: a.id, operatorVersion: a.version, at: new Date().toISOString(), reason: text(b.reason, 'Value policy reason') };
        put(s, 'valuePolicy', 'main', { ...entry, history: [...(previous?.history ?? []), entry] });
        audit(s, a, op, 'main', { version: entry.version, enabled: entry.enabled, reason: entry.reason });
        return get(s, 'valuePolicy', 'main');
    }
    enabled(s);
    if (op === 'value-seat-import') {
        requirePermission(s, a, 'request.create');
        const request = currentRequest(s, a, b);
        requirePermission(s, a, 'request.create', request); requirePermission(s, a, 'request.edit', request);
        const attachment = get(s, 'attachment', b.attachment);
        // Identical scope to the existing request-attachment command, with no identity grants.
        requireThat(attachment.kind === 'request' && attachment.record === request.id, 'Seat original belongs to another request', 403);
        const delivery = valueDelivery(s, request, request.revision);
        requireThat(delivery, 'Seat usage requires an accepted native receipt for this exact approved revision', 409);
        const provider = text(b.provider, 'Reported provider', 200), periodStart = date(b.periodStart, 'Usage period start'), periodEnd = date(b.periodEnd, 'Usage period end');
        requireThat(periodStart <= periodEnd, 'Usage period end must follow its start');
        requireThat(periodEnd >= delivery.date, 'Usage period end must be on or after the native delivery date');
        requireThat(b.activeRule === 'active-true', 'Declare active-true: only active === true counts');
        const { seats, bytes } = parseSeatOriginal(attachment), sha256 = await valueDigest(bytes);
        requireThat(!all(s, 'valueSeatImport').some(u => u.request === request.id && u.revision === request.revision && u.attachment === attachment.id && u.provider === provider && u.periodStart === periodStart && u.periodEnd === periodEnd), 'This usage original and period were already imported', 409);
        const id = uid();
        put(s, 'valueSeatImport', id, { request: request.id, revision: request.revision, attachment: attachment.id,
            deliveryReceipt: delivery.receipt, deliveryAt: delivery.at, attachmentVersion: s.get(key('attachment', attachment.id))!.revision, provider, periodStart, periodEnd, activeRule: 'active-true',
            sha256, originalLocation: `/api/purse/download/attachment/${attachment.id}`, seatCount: seats.length, activeSeats: seats.filter(seat => seat.active === true).length,
            provenance: 'provider-reported, unverified', actor: a.id, operatorVersion: a.version, at: new Date().toISOString() });
        audit(s, a, op, request.id, { usage: id, revision: request.revision, attachment: attachment.id, sha256 });
        return get(s, 'valueSeatImport', id);
    }
    if (op === 'value-report') {
        const request = currentRequest(s, a, b), inputs = await buildValueSnapshot(s, request, b.revision), id = uid(), proposalId = uid();
        const input = { id, version: 1, request: request.id, revision: request.revision, fingerprint: inputs.fingerprint };
        put(s, 'agentRun', id, { workflow: 'value-realization', actor: a.id, request: request.id, revision: request.revision, version: 1,
            inputs, references: inputs.references, mode: valueMode, model: 'none', provider: 'none',
            sources: inputs.sources, report: inputs.assessment, messages: [], proposals: [proposalId], actions: [proposalId], outcomes: [],
            at: new Date().toISOString(), authority: { actor: a.id, operatorVersion: a.version, roles: roles(s, a) } });
        put(s, 'proposedAction', proposalId, { run: id, runVersion: 1, actor: request.requester, action: 'value-confirm', input, status: 'proposed', references: inputs.references });
        audit(s, a, op, request.id, { run: id, revision: request.revision, fingerprint: inputs.fingerprint, proposal: proposalId });
        return projectValueRecord(s, a, get(s, 'agentRun', id));
    }
    const run = get(s, 'agentRun', b.id);
    requireThat(!protectedContextPending('agentRun',run)&&!run.protectedContextCleanup?.authorityInvalidated,'Historical protected context requires a new report',409);
    requireThat(run.workflow === 'value-realization', 'Value report required', 409);
    const request = get(s, 'request', run.request);
    // Owner authority never substitutes for this exact native requester identity.
    requireThat(a.id === request.requester && allowed(s, a, 'request.edit', request), 'Only the current requester with requester capability may confirm usefulness', 403);
    requireThat(b.request === request.id && b.revision === run.revision && b.version === run.version && b.fingerprint === run.inputs.fingerprint, 'Value report input changed; reload', 409);
    approvedValueRequest(s, request, run.revision);
    requireThat(!all(s, 'valueConfirmation').some(c => c.run === run.id && c.runVersion === run.version), 'This report version was already confirmed', 409);
    const fresh = await buildValueSnapshot(s, request, run.revision);
    requireThat(fresh.fingerprint === run.inputs.fingerprint && canonicalValue(fresh.references) === canonicalValue(run.references), 'Value source evidence changed; prepare a new report', 409);
    const proposals = all(s, 'proposedAction').filter(p => p.run === run.id && p.action === 'value-confirm' && p.runVersion === run.version);
    requireThat(proposals.length === 1 && proposals[0].status === 'proposed' && proposals[0].actor === request.requester && canonicalValue(proposals[0].input) === canonicalValue({ id: run.id, version: run.version, request: request.id, revision: run.revision, fingerprint: run.inputs.fingerprint }), 'Confirmation proposal changed or was already used', 409);
    requireThat(typeof b.usefulness === 'boolean', 'Explicit usefulness answer required');
    requireThat(typeof b.notes === 'string' && b.notes.length <= 2000, 'Usefulness notes must be text (maximum 2000 characters)');
    const id = uid(), at = new Date().toISOString();
    const confirmation = { run: run.id, runVersion: run.version, request: request.id, revision: run.revision, requester: request.requester,
        actor: a.id, operatorVersion: a.version, role: 'requester', usefulness: b.usefulness, notes: b.notes, at,
        fingerprint: fresh.fingerprint, inputs: structuredClone(run.inputs), references: structuredClone(run.references),
        proposal: proposals[0].id, mode: valueMode, model: 'none', provider: 'none' };
    put(s, 'valueConfirmation', id, confirmation);
    put(s, 'proposedAction', proposals[0].id, { ...proposals[0], status: 'executed', executedBy: a.id, at, confirmation: id });
    put(s, 'agentRun', run.id, { ...run, outcomes: [...(run.outcomes ?? []), { status: 'confirmed', confirmation: id, actor: a.id, at }] });
    audit(s, a, op, request.id, { confirmation: id, run: run.id, revision: run.revision, fingerprint: fresh.fingerprint, usefulness: b.usefulness });
    return projectValueRecord(s, a, get(s, 'valueConfirmation', id));
}

export function visibleAgentValue(s: State, a: Actor, visibleRequestIds: Set<string>): Data {
    requireThat(roles(s, a).length, 'Active business capability required', 403);
    return { valuePolicy: all(s, 'valuePolicy'),
        valueRun: all(s, 'agentRun').filter(v => v.workflow === 'value-realization' && visibleRequestIds.has(v.request)).map(v => projectValueRecord(s,a,v)),
        valueSeatImport: all(s, 'valueSeatImport').filter(v => visibleRequestIds.has(v.request)),
        valueConfirmation: all(s, 'valueConfirmation').filter(v => visibleRequestIds.has(v.request)).map(v => projectValueRecord(s,a,v)),
        valueCheckin: all(s, 'valueCheckin').filter(v => visibleRequestIds.has(v.request)).map(v => projectValueRecord(s,a,v)) };
}

/** Stored financial provenance follows current performance permission on its exact source request. */
export function projectValueRecord(s: State, a: Actor, row: Data): Data {
    row=projectProtectedContext('agentRun',row);
    const request = row.request ? s.get('request:' + row.request)?.value : undefined;
    if (row.inputs?.promise?.kind !== 'quoted-saving' || request && allowed(s, a, 'performance.read', request)) return row;
    const projected = structuredClone(row), restricted = new Set(['quote', 'quoteAward', 'agreementAward', 'invoice', 'payable']);
    const sources = (values: Data[]) => values.map(source => restricted.has(source.kind)
        ? { kind: source.kind, id: source.id, version: source.version, restricted: true } : source);
    const assessment = { kind: 'quoted-saving', status: 'restricted', promisedMinor: row.inputs.promise.amountMinor,
        currency: row.inputs.promise.currency,
        statement: 'Financial evidence requires procurement performance permission on this request; requester confirms usefulness' };
    projected.inputs.assessment = assessment;
    projected.inputs.sources = sources(projected.inputs.sources);
    if (projected.sources) projected.sources = sources(projected.sources);
    if (projected.report) projected.report = assessment;
    return projected;
}
