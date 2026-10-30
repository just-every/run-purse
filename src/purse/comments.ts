import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { runtimeBindings, type Bindings } from '../auth.server';
import { canReadCommentParent } from './access-records';
import { actor, load, readFence } from './store';
import { all, audit, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

/** Internal correspondence is never an approval, supplier message or agent action. */
function parent(s: State, kind: string, id: string) {
    requireThat(['request', 'order', 'invoice', 'invoiceException', 'supplier', 'agreement'].includes(kind), 'Purchasing comment record required');
    return get(s, kind, id);
}
async function members(env: Bindings, s: State): Promise<(Actor & { name: string })[]> {
    const operators = (await env.DB.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE status='active'").all<Data>()).results;
    return operators.filter(o => o.role === 'owner' || all(s, 'member').some(m => m.active && m.email.toLowerCase() === o.email.toLowerCase()))
        .map(o => ({ id: o.id, email: o.email, name: all(s, 'member').find(m => m.email.toLowerCase() === o.email.toLowerCase())?.name ?? o.display_name, owner: o.role === 'owner', version: o.version, session: '', dev: false }));
}
function warnings(s: State, record: Data, kind: string, mentions: string[], directory: (Actor & { name: string })[]) {
    return mentions.filter(id => { const member = directory.find(m => m.id === id); return !member || !canReadCommentParent(s, member, kind, record); })
        .map(id => ({ id, name: directory.find(m => m.id === id)?.name ?? 'Unavailable member', message: 'This member cannot see the record. Their notice contains no record content.' }));
}
export async function comments(s: State, a: Actor, op: string, b: Data, env?: Bindings): Promise<Data | undefined> {
    if (!['comment-add', 'comment-edit', 'comment-delete'].includes(op)) return;
    requireThat(env, 'Native comment storage required', 409);
    const existing = op === 'comment-add' ? undefined : get(s, 'comment', text(b.id, 'Comment', 200));
    const kind = existing?.kind ?? b.kind, recordId = existing?.record ?? b.record;
    const record = parent(s, kind, recordId); requireThat(canReadCommentParent(s, a, kind, record), 'Record outside your scope', 403);
    if (existing) {
        requireThat(existing.author === a.id && existing.authorEmail.toLowerCase() === a.email.toLowerCase(), 'Only the author can change this comment', 403);
        requireThat(existing.status !== 'deleted' && !existing.erasure, 'Comment is no longer editable', 409);
        requireThat(b.version === existing.version, 'Comment changed; reload before editing', 409);
    }
    const body = op === 'comment-delete' ? '' : text(b.body, 'Comment', 10000);
    const mentions: string[] = op === 'comment-delete' ? [] : b.mentions ?? [];
    requireThat(Array.isArray(mentions) && mentions.length <= 20 && mentions.every(id => typeof id === 'string') && new Set(mentions).size === mentions.length, 'Choose up to 20 distinct members');
    const directory = await members(env, s);
    requireThat(mentions.every(id => directory.some(m => m.id === id)), 'Choose current members from the picker');
    let file: Data | undefined;
    if (b.file && op !== 'comment-delete') {
        requireThat(typeof b.file.base64 === 'string' && b.file.base64.length > 0 && b.file.base64.length <= 1400000, 'Attachment must contain up to 1 MB of bytes');
        let bytes = '';
        try { bytes = atob(b.file.base64); } catch { requireThat(false, 'Invalid attachment bytes'); }
        requireThat(bytes.length > 0 && bytes.length <= 1000000, 'Attachment must contain up to 1 MB of bytes');
        file = { name: text(b.file.name, 'Filename', 200), mediaType: text(b.file.mediaType ?? 'application/octet-stream', 'Media type', 150), base64: b.file.base64, size: bytes.length };
    }
    const attempt = existing?.attempt ?? text(b.attempt, 'Comment capture identifier', 100);
    const captureHash = createHash('sha256').update(JSON.stringify({ kind, record: recordId, body, mentions, file })).digest('hex');
    if (!existing) {
        const replay = all(s, 'comment').find(c => c.author === a.id && c.attempt === attempt);
        if (replay) {
            requireThat(replay.captureHash === captureHash && !replay.erasure, 'Comment capture already used for different content', 409);
            return { ...replay, warnings: warnings(s, record, kind, mentions, directory) };
        }
    }
    const id = existing?.id ?? uid(), at = new Date().toISOString(), version = (existing?.version ?? 0) + 1;
    const files = op === 'comment-delete' ? [] : [...(existing?.versions.at(-1).files ?? [])];
    if (file) {
        const attachment = uid(); files.push(attachment);
        put(s, 'attachment', attachment, { ...file, kind: 'comment', record: id, actor: a.id, at });
        audit(s, a, 'attachment', id, { attachment, comment: id, parentKind: kind, parentRecord: recordId });
    }
    const snapshot = { version, action: op, body, mentions, files, actor: a.id, email: a.email, at };
    const comment = { id, kind, record: recordId, author: a.id, authorEmail: a.email, authorName: existing?.authorName ?? directory.find(m => m.id === a.id)?.name ?? 'Member', attempt, captureHash: existing?.captureHash ?? captureHash, version, status: op === 'comment-delete' ? 'deleted' : 'active', at: existing?.at ?? at, versions: [...(existing?.versions ?? []), snapshot] };
    put(s, 'comment', id, comment);
    audit(s, a, op, recordId, { comment: id, parentKind: kind, version, snapshot });
    for (const recipient of mentions) if (!(existing?.versions.at(-1).mentions ?? []).includes(recipient)) {
        const noticeId = uid();
        put(s, 'commentNotice', noticeId, { comment: id, commentVersion: version, recipient, mentionedBy: a.id, mentionedByName: comment.authorName, at });
    }
    return { ...comment, warnings: warnings(s, record, kind, mentions, directory) };
}

function recordUrl(kind: string, record: Data) {
    if (kind === 'request') return '/app?request=' + encodeURIComponent(record.id);
    if (kind === 'order') return '/app?tab=Orders&receipt=' + encodeURIComponent(record.id);
    if (kind === 'invoiceException') return '/app?tab=Orders&receipt=' + encodeURIComponent(record.order);
    if (kind === 'invoice') return '/app?tab=Orders&receipt=' + encodeURIComponent(record.order) + '#invoice-' + encodeURIComponent(record.id);
    if (kind === 'supplier') return '/app?tab=Suppliers&supplier=' + encodeURIComponent(record.id);
    return '/app?agreement=' + encodeURIComponent(record.id);
}

export const commentsApi = new Hono<{ Bindings: Bindings }>();
commentsApi.get('/api/purse/comments/notices', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    const directory = await members(runtimeBindings(c.env), state);
    requireThat(directory.some(m => m.id === a.id), 'No active business membership', 403);
    const notices = all(state, 'commentNotice').filter(n => n.recipient === a.id).map(n => {
        const comment = get(state, 'comment', n.comment), record = get(state, comment.kind, comment.record);
        const canRead = canReadCommentParent(state, a, comment.kind, record);
        const safe = { id: n.id, mentionedBy: n.mentionedByName, at: n.at, canRead };
        return canRead ? { ...safe, kind: comment.kind, record: comment.record, title: record.title ?? record.number ?? record.name ?? record.reference ?? 'Invoice exception', url: recordUrl(comment.kind, record), body: comment.status === 'deleted' ? 'Comment deleted' : comment.versions.at(-1).body }
            : { ...safe, message: 'You were mentioned on a record you cannot access.' };
    });
    const recent = all(state, 'comment').filter(comment => comment.status === 'active' && canReadCommentParent(state, a, comment.kind, get(state, comment.kind, comment.record)))
        .sort((x, y) => y.versions.at(-1).at.localeCompare(x.versions.at(-1).at) || x.id.localeCompare(y.id)).slice(0, 20).map(comment => {
            const record = get(state, comment.kind, comment.record);
            return { id: comment.id, author: comment.authorName, at: comment.versions.at(-1).at, title: record.title ?? record.number ?? record.name ?? record.reference ?? 'Invoice exception', body: comment.versions.at(-1).body, url: recordUrl(comment.kind, record) };
        });
    await readFence(c.env.DB, a, revision); return c.json({ notices, recent });
});
commentsApi.get('/api/purse/comments/:kind/:record', async c => {
    const a = await actor(c.req.raw, c.env), { state, revision } = await load(c.env.DB);
    const kind = c.req.param('kind'), record = parent(state, kind, c.req.param('record'));
    requireThat(canReadCommentParent(state, a, kind, record), 'Record outside your scope', 403);
    const directory = await members(runtimeBindings(c.env), state);
    const thread = all(state, 'comment').filter(comment => comment.kind === kind && comment.record === record.id)
        .sort((x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id))
        .map(comment => ({ ...comment, mayEdit: comment.author === a.id && comment.authorEmail === a.email && !comment.erasure && comment.status !== 'deleted', warnings: warnings(state, record, kind, comment.versions.at(-1).mentions, directory), versions: comment.versions.map((v: Data) => ({ ...v, files: v.files.map((id: string) => { const f = get(state, 'attachment', id); return { id, name: f.name, size: f.size, erased: Boolean(f.erasure) }; }) })) }));
    await readFence(c.env.DB, a, revision);
    return c.json({ comments: thread, members: directory.map(m => ({ id: m.id, name: m.name })) });
});
