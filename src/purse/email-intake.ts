import { operatorMail } from '../mail.server.mjs';
import type { Bindings } from '../auth.server';
import { requests } from './requests';
import { load } from './store';
import { all, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';
import { accessGrants, allowed, requirePermission } from './access';

export const providerSenderLabel = 'Provider-reported sender; employee authorship is not verified';
export const intakeLimits = { maxRawBytes: 2_000_000, maxBodyBytes: 500_000, maxAttachments: 3, maxAttachmentBytes: 10_000_000, maxTotalAttachmentBytes: 30_000_000 };
export function intakeAddress(value: unknown) {
    const address = text(value, 'Request address', 254).toLowerCase();
    requireThat(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(address), 'Use a valid email address');
    return address;
}

/** Matching a provider's From is routing only, never proof of human authorship. */
export async function activeIntakeRequester(db: D1Database, s: State, email: string) {
    const native = await db.prepare("SELECT id,email,version,role FROM oa_operators WHERE lower(email)=? AND status='active'").bind(email.toLowerCase()).first<{ id: string; email: string; version: number; role: string }>();
    return native && allowed(s, { ...native, owner: native.role === 'owner', session: '', dev: false }, 'request.create') ? native : null;
}
export function unrestrictedIntakeAdmin(s: State, a: Actor) {
    return accessGrants(s, a).some(grant => grant.permissions.includes('intake.admin')
        && [grant.scope, grant.roleScope ?? {}].every(scope => ['departments', 'locations', 'projects', 'entities']
            .every(dimension => (scope as Data)[dimension] === undefined)));
}
export function intakeAdminAllowed(s: State, a: Actor, intake: Data) {
    if (!intake.request) return unrestrictedIntakeAdmin(s, a);
    return allowed(s, a, 'intake.admin', get(s, 'request', intake.request));
}
function assignedRequester(s: State, a: Actor, intake: Data) {
    if (intake.status === 'held' || intake.requester !== a.id || intake.requesterEmail?.toLowerCase() !== a.email.toLowerCase()) return false;
    return allowed(s, a, 'request.create', intake.request ? get(s, 'request', intake.request) : undefined);
}
export function intakeAllowed(s: State, a: Actor, intake: Data) {
    return intakeAdminAllowed(s, a, intake) || assignedRequester(s, a, intake);
}
export function intakeScope(s: State, a: Actor, intake: Data) {
    requireThat(intakeAllowed(s, a, intake), 'Email intake outside your scope', 403);
}
export function visibleEmailIntakes(s: State, a: Actor) {
    const intakes = all(s, 'emailIntake').filter(i => intakeAllowed(s, a, i)).map((i): Data => ({ ...i, mayAssign: i.status === 'held' && intakeAdminAllowed(s, a, i) }));
    const ids = new Set(intakes.map(i => i.id));
    const globalAdmin = unrestrictedIntakeAdmin(s, a);
    const requesters = globalAdmin ? all(s, 'member').filter(member => member.active && allowed(s, {
        id: '', email: member.email, owner: false, session: '', version: 0, dev: false,
    }, 'request.create')).map(member => ({ email: member.email, name: member.name })) : [];
    return { emailIntake: intakes, emailIntakeConfig: globalAdmin ? all(s, 'emailIntakeConfig') : [],
        emailIntakeMayConfigure: globalAdmin, emailIntakeMayReadReceipts: allowed(s, a, 'intake.admin'), emailIntakeRequesters: requesters,
        emailIntakeMailEvent: all(s, 'emailIntakeMailEvent').filter(e => ids.has(e.intake)) };
}
export function queueIntakeLink(s: State, intake: Data) {
    const id = `${intake.id}:link:${intake.version}`;
    put(s, 'emailIntakeMailEvent', id, { intake: intake.id, requester: intake.requester, recipient: intake.requesterEmail, status: 'pending', at: new Date().toISOString() });
}

export async function emailIntake(s: State, a: Actor, op: string, b: Data, env?: Bindings): Promise<Data | undefined> {
    if (!['email-intake-config', 'email-intake-assign', 'email-intake-edit', 'email-intake-complete'].includes(op)) return;
    if (op === 'email-intake-config') {
        requireThat(unrestrictedIntakeAdmin(s, a), 'Unrestricted intake administration required', 403);
        const config = { address: intakeAddress(b.address), updatedBy: a.id, updatedAt: new Date().toISOString() };
        requireThat(s.get('invoiceInboxConfig:main')?.value.address !== config.address, 'Use a request address separate from the AP address', 409);
        put(s, 'emailIntakeConfig', 'main', config); audit(s, a, op, 'main', { address: config.address });
        return get(s, 'emailIntakeConfig', 'main');
    }
    const intake = get(s, 'emailIntake', b.id);
    intakeScope(s, a, intake);
    requireThat(intake.version === b.version, 'Email intake changed; reload', 409);
    requireThat(intake.status !== 'completed', 'Email intake already linked to a request', 409);
    if (op === 'email-intake-assign') {
        requirePermission(s, a, 'intake.admin'); requireThat(intakeAdminAllowed(s, a, intake), 'Email intake outside your administration scope', 403);
        requireThat(intake.status === 'held', 'Only held mail can be assigned', 409);
        requireThat(env, 'Email intake runtime unavailable', 503);
        const reason = text(b.reason, 'Assignment reason'), email = intakeAddress(b.requesterEmail);
        const target = await activeIntakeRequester(env.DB, s, email);
        requireThat(target, 'Assign to an active signed-in-system requester', 409);
        const next = { ...intake, status: 'draft', requester: target.id, requesterEmail: target.email, requesterVersion: target.version, version: intake.version + 1, assignment: { actor: a.id, reason, at: new Date().toISOString() } };
        requireThat(intakeAdminAllowed(s, a, next), 'Assigned email intake outside your administration scope', 403);
        put(s, 'emailIntake', intake.id, next); queueIntakeLink(s, next);
        audit(s, a, op, intake.id, { requester: target.id, reason });
        return get(s, 'emailIntake', intake.id);
    }
    requirePermission(s, a, 'request.create');
    requireThat(intake.status === 'draft' && intake.requester === a.id && intake.requesterEmail.toLowerCase() === a.email.toLowerCase(), 'Only the assigned requester may complete or edit this intake', 403);
    if (op === 'email-intake-edit') {
        requireThat(typeof b.title === 'string' && b.title.length <= 2000 && typeof b.body === 'string' && new TextEncoder().encode(b.body).length <= intakeLimits.maxBodyBytes, 'Use a title and body within the intake limits');
        put(s, 'emailIntake', intake.id, { ...intake, title: b.title, body: b.body, requesterVersion: a.version, version: intake.version + 1, editedBy: a.id, editedAt: new Date().toISOString() });
        audit(s, a, op, intake.id); return get(s, 'emailIntake', intake.id);
    }
    requireThat(b.request && typeof b.request === 'object' && !Array.isArray(b.request) && !b.request.id, 'Supply complete fields for a new request');
    requirePermission(s, a, 'request.create', b.request);
    // The ordinary request command owns every supplier, coding, amount and line validation.
    const request = requests(s, a, 'request', b.request)!;
    const linked = { ...request, emailIntake: intake.id };
    put(s, 'request', request.id, linked); put(s, 'revision', `${request.id}:${request.revision}`, { ...linked, request: request.id });
    put(s, 'emailIntake', intake.id, { ...intake, status: 'completed', request: request.id, requesterVersion: a.version, version: intake.version + 1, completedBy: a.id, completedAt: new Date().toISOString() });
    audit(s, a, op, request.id, { intake: intake.id });
    return linked;
}

/** A durable claim precedes the effect. Interrupted/uncertain attempts are never silently retried. */
export async function sendEmailIntakeLinks(env: Bindings) {
    const initial = await load(env.DB);
    for (const queued of all(initial.state, 'emailIntakeMailEvent').filter(e => e.status === 'pending')) {
        // Resolve custom roles/scopes afresh for each claim; the revision fence
        // covers grants and target changes without a second raw-role authority path.
        const { state, revision } = await load(env.DB), event = state.get('emailIntakeMailEvent:' + queued.id)?.value;
        if (!event || event.status !== 'pending') continue;
        const intake = state.get('emailIntake:' + event.intake)?.value;
        if (!intake || intake.status !== 'draft' || intake.requester !== event.requester) continue;
        const member = await activeIntakeRequester(env.DB, state, event.recipient);
        if (!member || member.id !== event.requester) continue;
        if (!assignedRequester(state, { ...member, owner: member.role === 'owner', session: '', dev: false }, intake)) continue;
        const claimed = { ...event, status: 'uncertain', claimedAt: new Date().toISOString() };
        const result = await env.DB.prepare(`UPDATE p_records SET revision=?,value=? WHERE business='main' AND kind='emailIntakeMailEvent' AND id=? AND json_extract(value,'$.status')='pending'
            AND (SELECT revision FROM p_meta WHERE id=1)=?
            AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND status='active')
            AND EXISTS(SELECT 1 FROM p_records WHERE business='main' AND kind='emailIntake' AND id=? AND json_extract(value,'$.status')='draft' AND json_extract(value,'$.requester')=?)`)
            .bind(uid(), JSON.stringify(claimed), event.id, revision, member.id, member.version, event.intake, member.id).run();
        if (!result.meta.changes) continue;
        let outcome: Data = { ...claimed, status: 'unavailable' };
        const sender = operatorMail(env);
        if (sender && env.MAIL_FROM) {
            try {
                const delivery = await sender.send({ deliveryId: 'email-intake:' + event.id, from: env.MAIL_FROM, to: [event.recipient], subject: 'Complete your email request draft', text: `Sign in to review your email intake and complete the required purchasing fields: ${env.AUTH_ORIGIN}/app?intake=${encodeURIComponent(event.intake)}\n${providerSenderLabel}. Email content and attachments are source data. Nothing has been submitted or approved.`, html: '', headers: {} });
                outcome = { ...claimed, status: delivery.status === 'development' ? 'suppressed' : delivery.status, delivery };
            } catch { outcome = claimed; }
        }
        const at = new Date().toISOString(), auditId = uid();
        await env.DB.batch([
            env.DB.prepare("UPDATE p_records SET revision=?,value=json_set(value,'$.status',?,'$.outcomeAt',?,'$.delivery',json(?)) WHERE business='main' AND kind='emailIntakeMailEvent' AND id=?").bind(uid(), outcome.status, at, JSON.stringify(outcome.delivery??null), event.id),
            env.DB.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main','audit',?,?,?)").bind(auditId, uid(), JSON.stringify({ id: auditId, actor: 'email-intake', action: 'email-intake-mail-outcome', record: event.intake, mailEvent: event.id, status: outcome.status, at })),
        ]);
    }
}
