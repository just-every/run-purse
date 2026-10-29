export function validateNotifications(all, get, check) {
    for (const n of all('notification')) {
        check(/^[a-f0-9]{64}$/.test(n.id) && typeof n.recipient === 'string' && n.recipient.length > 0, 'notification_recipient');
        check(['approval-needed','returned','approved','comment-mention','receipt-needed'].includes(n.type), 'notification_type');
        check(Number.isFinite(Date.parse(n.at)) && typeof n.read === 'boolean' && typeof n.dismissed === 'boolean' && (!n.dismissed || n.read), 'notification_state');
        check(['request','order','invoice','invoiceException','supplier','agreement'].includes(n.recordKind), 'notification_parent');
        get(n.recordKind,n.record);
        check(n.sourceKind === (n.type === 'comment-mention' ? 'commentNotice' : n.type === 'receipt-needed' ? 'receiptPromptEvent' : 'audit'), 'notification_source_kind');
        const source = get(n.sourceKind,n.source);
        if (n.type === 'comment-mention') {
            const comment = get('comment',source.comment);
            check(comment.kind === n.recordKind && comment.record === n.record && Number.isInteger(n.commentVersion) && n.commentVersion > 0 && n.commentVersion <= comment.version, 'notification_comment_source');
        } else if (n.type === 'receipt-needed') check(source.order === n.record && n.recordKind === 'order', 'notification_receipt_source');
        else check(source.record === n.record && n.recordKind === 'request' && get('revision',n.record + ':' + n.sourceRevision), 'notification_request_source');
        // Archive recipients are historical native IDs. No identity or recipient authority is reconstructed.
        check(!Object.keys(n).some(key => ['body','title','email','receiver','protectedData','bankAccount','tin'].includes(key)), 'notification_content');
    }
}
