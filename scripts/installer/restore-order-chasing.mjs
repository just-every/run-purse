import { validateSendResult } from '../../src/modules/mail/src/core/validation.mjs';

const dayMs = 86400000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 2000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const email = value => text(value, 254) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)
    && date(value.slice(0, 10)) && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60
    && (value.endsWith('Z') || Number(value.slice(-5, -3)) < 24 && Number(value.slice(-2)) < 60) && Number.isFinite(Date.parse(value));
const calendar = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

function policyVersions(all, get, check) {
    const versions = new Map();
    for (const policy of all('orderChasePolicy')) {
        check(object(policy) && text(policy.id, 200) && policy.id === policy.order && !versions.has(policy.id), 'order_chase_policy');
        const order = get('order', policy.order);
        // Eligibility can change after a policy or send. Issuance remains its historical authority.
        check(!order.imported && timestamp(order.issuedAt), 'order_chase_order');
        check(positive(policy.version) && Array.isArray(policy.history) && policy.history.length === policy.version - 1, 'order_chase_policy_history');
        const entries = [...policy.history, policy];
        for (const [index, entry] of entries.entries()) {
            check(object(entry) && entry.id === policy.id && entry.order === policy.order && entry.version === index + 1
                && (entry === policy || !Object.hasOwn(entry, 'history')), 'order_chase_policy_history');
            check(typeof entry.enabled === 'boolean' && positive(entry.cadenceDays) && entry.cadenceDays <= 30
                && positive(entry.maxChases) && entry.maxChases <= 20, 'order_chase_policy_limits');
            check(text(entry.actor) && email(entry.email) && typeof entry.owner === 'boolean'
                && email(entry.escalateTo) && entry.escalateTo === entry.escalateTo.toLowerCase()
                && typeof entry.escalateToOwner === 'boolean'
                && entry.escalateToOwner === (entry.owner && entry.escalateTo === entry.email.toLowerCase()), 'order_chase_policy_actor');
            check(timestamp(entry.at) && Date.parse(entry.at) >= Date.parse(order.issuedAt)
                && (!index || Date.parse(entries[index - 1].at) <= Date.parse(entry.at)), 'order_chase_policy_time');
        }
        versions.set(policy.id, entries);
    }
    return versions;
}

function evidenceSnapshot(event, get, check) {
    if (event.evidence === null) return;
    const evidence = event.evidence;
    check(object(evidence) && evidence.id === event.order && positive(evidence.version), 'order_chase_evidence');
    const source = get('supplierOrderEvidence', evidence.id);
    check(source.order === event.order && Array.isArray(source.history), 'order_chase_evidence');
    const entry = source.history[evidence.version - 1];
    check(object(entry) && entry.version === evidence.version
        && ['source', 'promisedDate', 'acknowledgedAt', 'actor', 'at'].every(field => evidence[field] === entry[field]), 'order_chase_evidence_version');
    check(text(evidence.source) && text(evidence.actor) && date(evidence.promisedDate) && timestamp(evidence.at)
        && Date.parse(evidence.at) <= Date.parse(event.at)
        && (evidence.acknowledgedAt === null || timestamp(evidence.acknowledgedAt)
            && Date.parse(evidence.acknowledgedAt) <= Date.parse(evidence.at)), 'order_chase_evidence_time');
    const next = source.history[evidence.version];
    check(!next || timestamp(next.at) && Date.parse(next.at) >= Date.parse(event.at), 'order_chase_evidence_time');
}

function outcomeRecord(event, order, policy, check) {
    const outcome = event.outcome;
    const recipient = event.kind === 'escalation' ? policy.escalateTo : order.supplierSnapshot?.contacts?.[0]?.email ?? '';
    check(object(outcome) && typeof outcome.recipient === 'string' && outcome.recipient.length <= 2000
        && outcome.recipient === recipient, 'order_chase_outcome');
    const { recipient: target, at, ...result } = outcome;
    if (result.provider === undefined) {
        check(['unknown', 'unavailable', 'uncertain'].includes(result.status) && Object.keys(result).length === 1
            && (result.status === 'unknown' ? at === undefined : timestamp(at) && Date.parse(at) === Date.parse(event.at)), 'order_chase_outcome');
        return;
    }
    check(text(target) && timestamp(at) && Date.parse(at) === Date.parse(event.at)
        && (result.recipientResults === undefined || Array.isArray(result.recipientResults)
            && result.recipientResults.length <= 1 && result.recipientResults.every(item => object(item) && item.recipient === target)), 'order_chase_outcome');
    try { validateSendResult(result, result.provider); } catch { check(false, 'order_chase_outcome_provider'); }
}

function dueReason(event, order, policy, check) {
    const parts = calendar.formatToParts(Date.parse(event.at));
    const part = name => parts.find(value => value.type === name).value;
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    const deliveryDate = event.evidence?.promisedDate || order.needDate;
    const overdue = Boolean(deliveryDate && today > deliveryDate);
    const unacknowledged = !event.evidence?.acknowledgedAt && Date.parse(event.at) >= Date.parse(order.issuedAt) + policy.cadenceDays * dayMs;
    const reason = overdue && unacknowledged ? 'unacknowledged-and-overdue-delivery' : overdue ? 'overdue-delivery' : unacknowledged ? 'unacknowledged' : null;
    check(reason !== null && event.reason === reason, 'order_chase_reason');
}

function eventSequences(groups, check) {
    for (const { events, policy } of groups.values()) {
        const chases = events.filter(event => event.kind === 'chase').sort((left, right) => left.sequence - right.sequence);
        for (const [index, event] of chases.entries()) {
            check(event.sequence === index + 1 && (!index || Date.parse(event.at) - Date.parse(chases[index - 1].at) >= policy.cadenceDays * dayMs), 'order_chase_cadence');
        }
        const escalations = events.filter(event => event.kind === 'escalation');
        check(escalations.length <= 1 && (!escalations.length || chases.length === policy.maxChases
            && Date.parse(escalations[0].at) >= Date.parse(chases.at(-1).at)), 'order_chase_escalation');
    }
}

/** Validate retained chase history without reapplying today's supplier or PO eligibility. */
export function validateOrderChasing(all, get, check) {
    const versions = policyVersions(all, get, check), groups = new Map(), identities = new Set();
    const evidenceByOrder = new Map(all('supplierOrderEvidence').map(row => [row.order, row]));
    for (const event of all('orderChaseEvent')) {
        check(object(event) && text(event.order, 200) && positive(event.policyVersion)
            && positive(event.sequence) && ['chase', 'escalation'].includes(event.kind), 'order_chase_event');
        const entries = versions.get(event.order), policy = entries?.[event.policyVersion - 1];
        check(policy && policy.enabled, 'order_chase_event_policy');
        const order = get('order', event.order);
        const id = `${event.order}:${event.policyVersion}:${event.kind === 'escalation' ? 'escalation' : `chase:${event.sequence}`}`;
        check(event.id === id && !identities.has(id) && (event.kind === 'chase' ? event.sequence <= policy.maxChases
            : event.sequence === policy.maxChases + 1), 'order_chase_event_id');
        identities.add(id);
        const next = entries[event.policyVersion];
        check(timestamp(event.at) && Date.parse(event.at) >= Date.parse(policy.at)
            && (!next || Date.parse(event.at) <= Date.parse(next.at)), 'order_chase_event_time');
        evidenceSnapshot(event, get, check);
        if (event.evidence === null) {
            const first = evidenceByOrder.get(event.order)?.history?.[0];
            check(!first || timestamp(first.at) && Date.parse(first.at) >= Date.parse(event.at), 'order_chase_evidence_time');
        }
        dueReason(event, order, policy, check);
        outcomeRecord(event, order, policy, check);
        const groupId = JSON.stringify([event.order, event.policyVersion]);
        if (!groups.has(groupId)) groups.set(groupId, { policy, events: [] });
        groups.get(groupId).events.push(event);
    }
    eventSequences(groups, check);
}
