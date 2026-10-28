export function validateComments(all, get, check, same) {
    for (const comment of all('comment')) {
        check(['request', 'order'].includes(comment.kind), 'comment_parent');
        get(comment.kind, comment.record);
        check(['active', 'deleted'].includes(comment.status) && Array.isArray(comment.versions) && comment.versions.length === comment.version && comment.version > 0, 'comment_versions');
        check(typeof comment.author === 'string' && typeof comment.authorEmail === 'string' && typeof comment.authorName === 'string' && typeof comment.attempt === 'string' && /^[a-f0-9]{64}$/.test(comment.captureHash), 'comment_author');
        for (const [index, version] of comment.versions.entries()) {
            check(version.version === index + 1 && version.actor === comment.author && version.email === comment.authorEmail && Number.isFinite(Date.parse(version.at)), 'comment_version_actor');
            check(version.action === (index === 0 ? 'comment-add' : index === comment.version - 1 && comment.status === 'deleted' ? 'comment-delete' : 'comment-edit'), 'comment_version_action');
            check(typeof version.body === 'string' && version.body.length <= 10000 && Array.isArray(version.mentions) && version.mentions.length <= 20 && Array.isArray(version.files), 'comment_content');
            for (const id of version.files) { const file = get('attachment', id); check(file.kind === 'comment' && file.record === comment.id, 'comment_file'); }
            check(all('audit').some(event => event.action === version.action && event.comment === comment.id && event.record === comment.record && event.version === version.version && same(event.snapshot, version)), 'comment_audit');
        }
    }
    for (const notice of all('commentNotice')) {
        get('comment', notice.comment);
        check(typeof notice.recipient === 'string' && typeof notice.mentionedBy === 'string' && typeof notice.mentionedByName === 'string' && Number.isFinite(Date.parse(notice.at)), 'comment_notice');
    }
}
