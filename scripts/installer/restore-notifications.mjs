export function validateNotifications(all, get, check) {
    const recipient = r => check(typeof r.recipient === 'string' && r.recipient.length > 0, 'notification_recipient');
    const time = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    for (const p of all('notificationPreference')) {
        recipient(p); check(/^[a-f0-9]{64}$/.test(p.id) && Number.isInteger(p.version) && p.version > 0, 'notification_preference');
        check(['in-app','email','slack','teams','push'].includes(p.channel) && ['immediate','daily'].includes(p.cadence), 'notification_channel');
        try { new Intl.DateTimeFormat('en-US',{timeZone:p.timezone}).format(0); } catch { check(false,'notification_timezone'); }
        check(typeof p.quiet === 'boolean' && typeof p.weekends === 'boolean' && time(p.quietStart) && time(p.quietEnd) && p.quietStart !== p.quietEnd && time(p.digestAt),'notification_quiet');
    }
    for (const p of all('notificationUrgency')) check(p.id === p.type && typeof p.urgent === 'boolean' && Number.isInteger(p.version) && p.version > 0,'notification_urgency');
    for (const d of all('notificationDelivery')) {
        recipient(d); const n=get('notification',d.notification);
        check(n.recipient === d.recipient && /^[a-f0-9]{64}$/.test(d.id) && /^[a-f0-9]{64}$/.test(d.batch),'notification_delivery');
        check(['in-app','email','slack','teams','push'].includes(d.channel) && ['immediate','daily'].includes(d.cadence) && ['uncertain','accepted','rejected','suppressed','available','unavailable'].includes(d.status), 'notification_outcome');
        check(Number.isFinite(Date.parse(d.at)) && Number.isInteger(d.preferenceVersion) && d.preferenceVersion > 0 && Number.isInteger(d.count) && d.count >= 0 && typeof d.code === 'string','notification_delivery_state');
    }
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
