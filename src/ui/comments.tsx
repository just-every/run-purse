import { useEffect, useState } from 'react';
import { call, Details, Field, Form, when, type D } from './shared';

async function commentFile(value: unknown) {
    if (!(value instanceof File) || !value.size) return undefined;
    if (value.size > 1000000) throw new Error('Attachment must contain up to 1 MB of bytes');
    let raw = ''; for (const byte of new Uint8Array(await value.arrayBuffer())) raw += String.fromCharCode(byte);
    return { name: value.name, mediaType: value.type || 'application/octet-stream', base64: btoa(raw) };
}
function CommentForm({ members, current, save }: { members: D[]; current?: D; save: (body: D) => Promise<void> }) {
    const [mentions, setMentions] = useState<string[]>(current?.mentions ?? []);
    return <Form label={current ? 'Save comment edit' : 'Post internal comment'} initial={{ body: current?.body ?? '' }} onSubmit={async b => save({ body: b.body, mentions, file: await commentFile(b.file) })}>
        <Field label={current ? 'Edit comment' : 'Internal comment'} name="body" type="textarea" defaultValue={current?.body ?? ''}/>
        <label className="field">Mention members<select multiple aria-label="Mention members" value={mentions} onChange={e => setMentions(Array.from(e.currentTarget.selectedOptions, o => o.value))}>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="field">Comment attachment (up to 1 MB)<input type="file" name="file"/></label>
    </Form>;
}
export function Comments({ kind, record, mutate }: { kind: string; record: string; mutate: (op: string, b: D) => Promise<any> }) {
    const [thread, setThread] = useState<D>(), [error, setError] = useState(''), [editing, setEditing] = useState(''), [capture, setCapture] = useState(() => crypto.randomUUID());
    const reload = async () => setThread(await call(`comments/${kind}/${record}`));
    useEffect(() => { reload().catch(e => setError(e.message)); }, [kind, record]);
    async function save(op: string, body: D) {
        await mutate(op, body); setEditing(''); setCapture(crypto.randomUUID()); await reload();
    }
    return <section aria-label="Internal comments" className="attachments">
        <h3>Internal comments</h3><p>For your team. Comments stay off supplier messages, links and purchase order documents.</p>
        {error && <p role="alert">{error}</p>}
        {!thread ? <p>Loading comments…</p> : <>
            {!thread.comments.length && <p>No internal comments yet.</p>}
            <ul className="ruled-list">{thread.comments.map((comment: D) => {
                const current = comment.versions.at(-1);
                return <li key={comment.id}>
                    <p>{comment.authorName} · {when(comment.at)} · version {comment.version}</p>
                    <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{comment.status === 'deleted' ? 'Comment deleted' : current.body}</p>
                    {current.files.map((file: D) => <p key={file.id} style={{ overflowWrap: 'anywhere' }}>{file.erased ? 'Attachment withdrawn by personal-data erasure' : <a href={`/api/purse/download/attachment/${file.id}`}>{file.name}</a>}</p>)}
                    {comment.warnings.map((w: D) => <p key={w.id} role="status">{w.name}: {w.message}</p>)}
                    {comment.mayEdit && <div className="form-end"><button type="button" onClick={() => setEditing(editing === comment.id ? '' : comment.id)}>Edit comment</button><Form label="Delete comment" onSubmit={async () => save('comment-delete', { id: comment.id, version: comment.version })}><p>Deletion keeps every version in the internal history and audit log.</p></Form></div>}
                    {editing === comment.id && <CommentForm key={comment.id + comment.version} members={thread.members} current={current} save={async b => save('comment-edit', { ...b, id: comment.id, version: comment.version })}/>}
                    <Details label="Comment version history">{comment.versions.map((v: D) => <div key={v.version}><p>Version {v.version} · {when(v.at)} · {v.action === 'comment-delete' ? 'Deleted by author' : v.action === 'comment-edit' ? 'Edited by author' : 'Posted by author'}</p><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{v.body}</p>{v.files.map((file: D) => <p key={file.id}>{file.erased ? 'Attachment withdrawn' : <a href={`/api/purse/download/attachment/${file.id}`}>{file.name}</a>}</p>)}</div>)}</Details>
                </li>;
            })}</ul>
            <CommentForm key={capture} members={thread.members} save={async b => save('comment-add', { ...b, kind, record, attempt: capture })}/>
        </>}
    </section>;
}
export function CommentNotices({ refresh }: { refresh: D }) {
    const [notices, setNotices] = useState<D[]>([]), [error, setError] = useState('');
    useEffect(() => { call('comments/notices').then(r => { setNotices(r.notices); setError(''); }).catch(e => { setNotices([]); setError(e.message); }); }, [refresh]);
    if (!notices.length && !error) return null;
    return <section aria-label="Comment mentions"><Details label={`Comment mentions · ${notices.length}`}>
        {error && <p role="alert">{error}</p>}
        <ul className="ruled-list">{notices.map(n => <li key={n.id}><p>{n.mentionedBy} mentioned you · {when(n.at)}</p>{n.canRead ? <><a href={n.kind === 'request' ? `/app?request=${n.record}` : `/app?tab=Orders&receipt=${n.record}`}>{n.title}</a><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.body}</p></> : <p>{n.message}</p>}</li>)}</ul>
    </Details></section>;
}
