import { notificationPreference } from './notification-preferences';
import { createHash } from 'node:crypto';
import { canReadCommentParent, canReadRecord } from './access-records';
import { actorStep } from './approval-chain';
import { authorizedApproval } from './requests';
import { mayReceive, receiptPrompts } from './receipt-routing';
import { all, get, put, requireThat, roles, text, type Actor, type Data, type State } from './types';

export function approvalRecipient(s: State, a: Actor, request: Data): boolean {
    if (request.status !== 'pending' || request.imported || !canReadRecord(s, a, 'request', request)) return false;
    if (request.approvalRoute) return Boolean(actorStep(s, a, request));
    try { authorizedApproval(s, a, request); return true; } catch { return false; }
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const member = (s: State, a: Actor) => requireThat(roles(s, a).length, 'No active business membership', 403);

/** Only native event transitions create recipients. Historical archive rows never acquire new recipients. */
export async function captureNotifications(db: D1Database, before: State, s: State) {
    const changed = (kind: string) => all(s, kind).filter(row => before.get(kind + ':' + row.id)?.revision !== s.get(kind + ':' + row.id)?.revision);
    const requests = changed('request'), mentions = changed('commentNotice').filter(n => !before.has('commentNotice:' + n.id));
    const prompts = changed('receiptPromptEvent').filter(n => !before.has('receiptPromptEvent:' + n.id));
    if (!requests.length && !mentions.length && !prompts.length) return;
    const operators = (await db.prepare("SELECT id,email,role,version FROM oa_operators WHERE status='active'").all<Data>()).results;
    const directory: Actor[] = operators.map(o => ({ id: o.id, email: o.email, owner: o.role === 'owner', version: o.version, session: '', dev: false }))
        .filter(a => roles(s, a).length > 0);
    const add = (a: Actor, type: string, sourceKind: string, source: Data, recordKind: string, record: Data, detail: Data = {}) => {
        const id = digest([a.id, type, sourceKind, source.id, detail.step ?? '']);
        if (s.has('notification:' + id)) return;
        put(s, 'notification', id, { recipient: a.id, type, sourceKind, source: source.id, recordKind, record: record.id,
            deliveryConsent: notificationPreference(s,a).version > 0, sourceRevision: record.revision ?? null, at: source.at, read: false, dismissed: false, ...detail });
    };
    const newAudits = changed('audit').filter(event => !before.has('audit:' + event.id));
    for (const request of requests) {
        const previous = before.get('request:' + request.id)?.value;
        const event = newAudits.filter(event => event.record === request.id).at(-1);
        if (!event || request.imported) continue;
        for (const a of directory) {
            if (approvalRecipient(s, a, request)) {
                const step = actorStep(s, a, request)?.id ?? 'primary';
                const priorStep = previous && approvalRecipient(before, a, previous) ? actorStep(before, a, previous)?.id ?? 'primary' : undefined;
                if (!previous || previous.revision !== request.revision || previous.approvalAttempt !== request.approvalAttempt || step !== priorStep)
                    add(a, 'approval-needed', 'audit', event, 'request', request, { step, approvalAttempt: request.approvalAttempt ?? null });
            }
            if (['returned', 'approved'].includes(request.status) && previous?.status !== request.status && a.id === request.requester)
                add(a, request.status, 'audit', event, 'request', request);
        }
    }
    for (const notice of mentions) {
        const a = directory.find(a => a.id === notice.recipient), comment = s.get('comment:' + notice.comment)?.value;
        const record = comment && s.get(comment.kind + ':' + comment.record)?.value;
        if (a && record) add(a, 'comment-mention', 'commentNotice', notice, comment.kind, record, { commentVersion: notice.commentVersion ?? comment.version });
    }
    for (const event of prompts) {
        const order = s.get('order:' + event.order)?.value, a = directory.find(a => a.email.toLowerCase() === event.receiver.toLowerCase());
        if (a && order) add(a, 'receipt-needed', 'receiptPromptEvent', event, 'order', order);
    }
}

/** No cached source text or purchasing fields enter a notification. Every projection rechecks both source and current scope. */
export function notificationView(s: State, a: Actor, n: Data): Data {
    const safe = { id: n.id, type: n.type, at: n.at, read: n.read, dismissed: n.dismissed };
    const record = s.get(n.recordKind + ':' + n.record)?.value, source = s.get(n.sourceKind + ':' + n.source)?.value;
    let accessible = !n.erasure && Boolean(record && source);
    let body: string | undefined;
    let displayRecord = record;
    if (accessible && n.type === 'comment-mention') {
        const comment = s.get('comment:' + source!.comment)?.value, version = comment?.versions[n.commentVersion - 1];
        accessible = Boolean(comment && !comment.erasure && version && canReadCommentParent(s, a, n.recordKind, record!));
        if (accessible) body = version.body || 'Comment deleted';
    } else if (accessible) {
        const historical = n.recordKind === 'request' ? s.get('revision:' + n.record + ':' + n.sourceRevision)?.value : record;
        displayRecord = historical;
        accessible = Boolean(historical && canReadRecord(s, a, n.recordKind, record!) && canReadRecord(s, a, n.recordKind, historical));
    }
    if (!accessible) return { ...safe, canRead: false, message: 'This notification’s source is no longer available to you.' };
    let actionable = true;
    if (n.type === 'approval-needed') actionable = record!.revision === n.sourceRevision && (record!.approvalAttempt ?? null) === n.approvalAttempt
        && approvalRecipient(s, a, record!) && (actorStep(s, a, record!)?.id ?? 'primary') === n.step
        && (Boolean(record!.approvalRoute) || all(s, 'audit').filter(event => event.record === n.record && event.action === 'submit').at(-1)?.id === n.source);
    if (n.type === 'receipt-needed') actionable = record!.revision === n.sourceRevision && mayReceive(s, a, record!)
        && receiptPrompts(s).some(prompt => prompt.order === record!.id && prompt.receiver.toLowerCase() === a.email.toLowerCase() && prompt.reason === source!.reason);
    if (['returned', 'approved'].includes(n.type)) actionable = record!.revision === n.sourceRevision && record!.status === n.type;
    const order = n.recordKind === 'invoice' || n.recordKind === 'invoiceException' ? record!.order : record!.id;
    const url = n.recordKind === 'request' ? '/app?request=' + encodeURIComponent(record!.id)
        : ['order','invoice','invoiceException'].includes(n.recordKind) ? '/app?tab=Orders&receipt=' + encodeURIComponent(order)
        : n.recordKind === 'supplier' ? '/app?tab=Suppliers&supplier=' + encodeURIComponent(record!.id)
        : '/app?agreement=' + encodeURIComponent(record!.id);
    return { ...safe, canRead: true, actionable, recordKind: n.recordKind, record: n.record, source: n.source,
        sourceRevision: n.sourceRevision, ...(n.commentVersion ? { commentVersion: n.commentVersion } : {}),
        title: displayRecord!.title ?? displayRecord!.number ?? displayRecord!.name ?? displayRecord!.reference ?? 'Purchasing record', url, ...(body ? { body } : {}) };
}
export function notificationList(s: State, a: Actor) {
    member(s, a);
    return all(s, 'notification').filter(n => n.recipient === a.id).sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)).map(n => notificationView(s, a, n));
}
export function notifications(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['notification-read', 'notification-dismiss'].includes(op)) return;
    member(s, a);
    const n = s.get('notification:' + text(b.id, 'Notification', 64))?.value;
    requireThat(n && n.recipient === a.id, 'Notification unavailable', 404);
    const view = notificationView(s, a, n);
    requireThat(view.canRead, 'Notification source outside your current scope', 403);
    // Monotonic state makes retries inert and prevents a replay from reviving a dismissed item.
    if (!n.read || op === 'notification-dismiss' && !n.dismissed)
        put(s, 'notification', n.id, { ...n, read: true, dismissed: n.dismissed || op === 'notification-dismiss' });
    return notificationView(s, a, get(s, 'notification', n.id));
}
