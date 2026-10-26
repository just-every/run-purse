import { runtimeBindings, type Bindings } from '../auth.server';
import { agentPolicies, purchaseTypes } from './agent-governance';
import { canonicalValue, valueDigest } from './agent-value-evidence';
import { agreementDay } from './agreements';
import { assignedAgreementOwner } from './recurring-scenario-authority';
import { buildRecurringDiscovery, canReadRecurringDiscoveryProposal, recurringAgreementOrders } from './recurring-opportunities';
import { load } from './store';
import { accessGrants, all, allowed, uid, type Actor, type Data, type State } from './types';

const day = 86400000;
type Native = { id: string; email: string; role: string; version: number };
const actor = (native: Native): Actor => ({ ...native, owner: native.role === 'owner', session: '', dev: false });

function window(s: State, agreement: Data, now: number) {
    const offsets = (agreement.reminderDays ?? []).filter((value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 365);
    if (agreement.imported || !offsets.length || !agreement.noticeDeadline || !agreement.startDate || !agreement.endDate) return;
    const today = agreementDay(s, now), from = new Date(Date.parse(agreement.noticeDeadline) - Math.max(...offsets) * day).toISOString().slice(0, 10);
    if (today < from || today > agreement.noticeDeadline) return;
    return { agreement: agreement.id, from, to: agreement.noticeDeadline };
}

function governed(s: State, agreement: Data, preparer: Native) {
    const orders = recurringAgreementOrders(s, agreement), types = [...new Set(orders.flatMap(purchaseTypes))];
    const policies = agentPolicies(s, 'AGENT-006', types.length ? types : ['*']);
    return policies?.every(policy => !policy.imported && policy.actor === preparer.id && policy.operatorVersion === preparer.version);
}

function recipients(s: State, natives: Native[], proposal: Data) {
    const agreements = proposal.agreementIds.map((id: string) => s.get('agreement:' + id)!.value);
    const orders = proposal.sources.filter((source: Data) => source.kind === 'order').map((source: Data) => s.get('order:' + source.id)!.value);
    const result: { native: Native; role: string; agreements: string[] }[] = [];
    for (const native of natives) {
        const a = actor(native), owned = agreements.filter((agreement: Data) => assignedAgreementOwner(s, a, agreement));
        if (owned.length) result.push({ native, role: 'owner', agreements: owned.map((agreement: Data) => agreement.id).sort() });
        else if (!accessGrants(s, a).some(grant => grant.role === 'auditor') && allowed(s, a, 'payable.approve') && allowed(s, a, 'cash.read') &&
            orders.every((order: Data) => allowed(s, a, 'payable.approve', order) && allowed(s, a, 'cash.read', order)) && canReadRecurringDiscoveryProposal(s, a, proposal))
            result.push({ native, role: 'finance', agreements: proposal.agreementIds });
    }
    return result;
}

async function claim(env: Bindings, preparer: Native, anchor: Data, proposal: Data, from: string, to: string, now: number) {
    const { state, revision } = await load(env.DB), agreement = state.get('agreement:' + anchor.id)?.value;
    const noticeWindow = agreement && window(state, { ...agreement, id: anchor.id }, now);
    if (!noticeWindow || !proposal.agreementIds.every((id: string) => {
        const row = state.get('agreement:' + id)?.value;
        return row && governed(state, { ...row, id }, preparer);
    }) || !canReadRecurringDiscoveryProposal(state, actor(preparer), proposal) ||
        !proposal.sources.every((source: Data) => state.get(source.kind + ':' + source.id)?.revision === source.revision)) return;
    const natives = (await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE status='active'").all<Native>()).results;
    if (!natives.some(native => native.id === preparer.id && native.version === preparer.version && native.role === 'owner')) return;
    const targets = recipients(state, natives, proposal);
    if (!targets.length) return;
    const sourceHash = proposal.id, identity = await valueDigest(canonicalValue({ window: noticeWindow, sourceHash }));
    const id = 'recurring-discovery:' + identity, at = new Date(now).toISOString(), claimVersion = uid();
    const references = proposal.sources.map((source: Data) => ({ kind: source.kind, id: source.id, version: source.revision }));
    const notices = await Promise.all(targets.map(async target => ({
        id: await valueDigest(canonicalValue({ window: noticeWindow, sourceHash, recipient: target.native.id, role: target.role })),
        run: id, proposal: proposal.id, preparedBy: preparer.id, preparerVersion: preparer.version, recipient: target.native.id, recipientEmail: target.native.email.toLowerCase(), recipientVersion: target.native.version,
        role: target.role, agreementIds: target.agreements, sourceHash, from, to, noticeWindow,
        noticeDeadlines: proposal.baseline.noticeDeadlines, at, mode: 'deterministic v1', model: 'none', provider: 'none', status: 'proposed',
    })));
    const pending = notices.filter(notice => !state.has('recurringDiscoveryNotice:' + notice.id));
    if (!pending.length) return;
    const prior = state.get('agentRun:' + id)?.value;
    const run = prior ? { ...prior, outcomes: [...(prior.outcomes ?? []), ...pending.map(notice => ({ notice: notice.id, recipient: notice.recipient, status: 'proposed' }))] } : { id, workflow: 'recurring-discovery', actor: preparer.id, operatorVersion: preparer.version, from, to,
        inputs: { from, to, limit: 200 }, missing: [], draft: 'Conditional recurring-spend proposal; review the cited sources and prepare a separately approved scenario.',
        version: 1, at, actions: [], mode: 'deterministic v1', model: 'none', provider: 'none', proposals: [proposal], references,
        scheduled: true, noticeWindow, messages: [], outcomes: notices.map(notice => ({ notice: notice.id, recipient: notice.recipient, status: 'proposed' })) };
    const proofs = [preparer, ...targets.map(target => target.native)].map(native => ({ id: native.id, email: native.email.toLowerCase(), version: native.version, role: native.role }));
    const insert = (kind: string, recordId: string, value: Data, update = false) => env.DB.prepare(`INSERT INTO p_records(business,kind,id,revision,value)
        SELECT 'main',?,?,?,? WHERE EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='recurringDiscoveryNotice' AND id=? AND revision=?)
        ON CONFLICT(business,kind,id) DO ${update ? 'UPDATE SET revision=excluded.revision,value=excluded.value' : 'NOTHING'}`)
        .bind(kind, recordId, uid(), JSON.stringify(value), pending[0].id, claimVersion);
    // A recipient claim fences domain grants and native identities atomically.
    // New eligible recipients can join an existing run without repeating notices.
    const saved = await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO p_records(business,kind,id,revision,value)
            SELECT 'main','recurringDiscoveryNotice',?,?,? WHERE (SELECT revision FROM p_meta WHERE id=1)=?
            AND NOT EXISTS(SELECT 1 FROM json_each(?) proof WHERE NOT EXISTS(
                SELECT 1 FROM oa_operators native WHERE native.id=json_extract(proof.value,'$.id')
                AND lower(native.email)=json_extract(proof.value,'$.email') AND native.version=json_extract(proof.value,'$.version')
                AND native.role=json_extract(proof.value,'$.role') AND native.status='active'))`)
            .bind(pending[0].id, claimVersion, JSON.stringify(pending[0]), revision, JSON.stringify(proofs)),
        insert('agentRun', id, run, true),
        ...pending.slice(1).map(notice => insert('recurringDiscoveryNotice', notice.id, notice)),
        insert('audit', id, { id, actor: preparer.id, email: preparer.email, action: 'recurring-scenario-discover', record: 'recurring-opportunities',
            run: id, from, to, at, scheduled: true, mode: 'deterministic v1', model: 'none', provider: 'none',
            proposals: [{ id: proposal.id, kind: proposal.kind, agreements: proposal.agreementIds, sources: proposal.sources.map((source: Data) => ({ kind: source.kind, id: source.id, revision: source.revision })) }] }),
        ...pending.map(notice => insert('audit', 'recurring-discovery-notice:' + notice.id, { actor: preparer.id, email: preparer.email,
            action: 'recurring-discovery-notice', record: notice.id, run: id, recipient: notice.recipient, at, status: 'proposed' })),
    ]);
    return saved[0].meta.changes ? { run: id, notices: pending } : undefined;
}

/** The recorded reminder lead days define one business-local notice window.
 * Scheduled research stores proposals and in-app notices, with no outbound mail.
 */
export async function runRecurringDiscoverySchedule(original: Bindings, now = Date.now()) {
    const env = runtimeBindings(original), { state } = await load(env.DB), events: Data[] = [];
    if (!state.has('business:main')) return { events };
    const owners = (await env.DB.prepare("SELECT id,email,role,version FROM oa_operators WHERE role='owner' AND status='active'").all<Native>()).results;
    for (const preparer of owners) {
        const eligible = all(state, 'agreement').filter(agreement => !agreement.imported && governed(state, agreement, preparer));
        const periods = new Map<string, Awaited<ReturnType<typeof buildRecurringDiscovery>>>();
        for (const agreement of eligible.filter(agreement => window(state, agreement, now))) {
            const from = agreement.startDate, to = agreement.endDate;
            const period = canonicalValue([from, to]);
            let discovery = periods.get(period);
            if (!discovery) {
                discovery = await buildRecurringDiscovery(state, actor(preparer), { from, to, limit: 200 }, eligible.map(row => row.id));
                periods.set(period, discovery);
            }
            for (const proposal of discovery.proposals.filter(proposal => proposal.agreementIds.includes(agreement.id))) {
                const event = await claim(env, preparer, agreement, proposal, from, to, now);
                if (event) events.push(event);
            }
        }
    }
    return { events };
}
