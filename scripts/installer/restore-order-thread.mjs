import { validateSendResult } from '../../src/modules/mail/src/core/validation.mjs';

const string = (value, max = 2000) => typeof value === 'string' && value.length <= max;
const text = (value, max = 2000) => string(value, max) && value.trim().length > 0;
const timestamp = value => string(value, 40) && Number.isFinite(Date.parse(value));
const address = value => text(value, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
/** Historical messages retain exact PO lineage; route hashes confer no restored authority. */
export function validateOrderThreads(all, get, check) {
    const providerIds = new Set(), keys = new Set(), audits = all('audit');
    for (const message of all('orderThreadMessage')) {
        const order = get('order', message.order);
        check(!order.imported && !order.adoption && timestamp(order.issuedAt) && message.request === order.request && message.supplier === order.supplier && message.number === order.number && message.revision === order.revision, 'order_thread_source');
        check(['outbound', 'inbound'].includes(message.direction) && string(message.subject) && string(message.body, 20_000 + 500_000) && timestamp(message.at) && Date.parse(message.at) >= Date.parse(order.issuedAt) && text(message.actor) && address(message.email), 'order_thread_message');
        check(message.replyTo === undefined && message.alias === undefined && message.token === undefined && message.routeHash === undefined && message.to === undefined, 'order_thread_portable_authority');
        check(Array.isArray(message.files) && message.files.length <= 3, 'order_thread_files');
        if (message.direction === 'outbound') {
            check(message.thread === message.id && message.id.startsWith('order-thread:' + order.id + ':') && address(message.recipient) && text(message.reason) && message.files.length === 0 && message.original === undefined && timestamp(message.replyExpiresAt) && Date.parse(message.replyExpiresAt) - Date.parse(message.at) === 30 * 86400000, 'order_thread_send');
            check(['accepted', 'rejected', 'uncertain', 'suppressed', 'unavailable', 'rate_limited'].includes(message.status), 'order_thread_outcome');
            if (message.outcomeAt) check(timestamp(message.outcomeAt) && Date.parse(message.outcomeAt) >= Date.parse(message.at) && audits.some(event => event.action === 'order-thread-send-outcome' && event.record === order.id && event.message === message.id && event.revision === message.revision && event.actor === message.actor && event.status === message.status && event.at === message.outcomeAt), 'order_thread_outcome_audit');
            if (message.delivery) {
                try { validateSendResult(message.delivery, message.delivery.provider); } catch { check(false, 'order_thread_delivery'); }
                check(message.status === (message.delivery.status === 'development' ? 'suppressed' : message.delivery.status), 'order_thread_delivery_status');
            }
            check(audits.some(event => event.action === 'order-thread-send-claimed' && event.record === order.id && event.message === message.id && event.actor === message.actor && event.email === message.email && event.recipient === message.recipient && event.revision === message.revision && event.reason === message.reason && event.at === message.at), 'order_thread_claim_audit');
            if (message.replyRevokedAt) check(timestamp(message.replyRevokedAt) && audits.some(event => event.action === 'order-thread-reply-route-revoked' && event.record === order.id && event.message === message.id && event.at === message.replyRevokedAt), 'order_thread_revoke_audit');
            continue;
        }
        const thread = get('orderThreadMessage', message.thread);
        check(thread.direction === 'outbound' && thread.order === message.order && thread.revision === message.revision && Date.parse(message.at) >= Date.parse(thread.at), 'order_thread_reply');
        check(message.provider === 'resend' && /^[a-zA-Z0-9_-]{1,128}$/.test(message.providerEmailId) && message.id === 'order-thread-inbound:resend:' + message.providerEmailId && !providerIds.has(message.providerEmailId), 'order_thread_provider'); providerIds.add(message.providerEmailId);
        check(message.actor === 'supplier-email' && message.senderVerified === false && message.providerSender === message.email && message.providerSender === thread.recipient && message.status === 'received' && message.recipient === null && message.originalFormat === 'provider-api-json' && message.original?.id === 'original', 'order_thread_sender');
        check((message.sourceText === null || string(message.sourceText, 500_000)) && (message.sourceHtml === null || string(message.sourceHtml, 500_000)) && (message.messageId === null || string(message.messageId)), 'order_thread_source_text');
        let total = 0;
        for (const file of [message.original, ...message.files]) {
            check(text(file.id, 200) && text(file.name) && string(file.mediaType, 150) && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(file.mediaType) && /^[a-f0-9]{64}$/.test(file.sha256) && file.key === `order-thread/${message.id}/${file.id}` && !keys.has(file.key) && file.base64 === undefined && Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= (file.id === 'original' ? 2_000_000 : 10_000_000), 'order_thread_original');
            keys.add(file.key); if (file.id !== 'original') total += file.size;
        }
        check(total <= 30_000_000, 'order_thread_attachment_total');
        check(audits.some(event => event.action === 'order-thread-reply-received' && event.record === order.id && event.message === message.id && event.thread === thread.id && event.revision === message.revision && event.providerEmailId === message.providerEmailId && event.originalSha256 === message.original.sha256 && event.actor === 'supplier-email' && event.identityVerified === false && event.at === message.at), 'order_thread_reply_audit');
    }
}

/** Call from portability.validateStaged with the actual archive object manifest and receipts. */
export function validateOrderThreadObjects(rows, receipts, manifest, check) {
    const messages = rows.filter(row => row.kind === 'orderThreadMessage').map(row => JSON.parse(row.value));
    for (const message of messages.filter(message => message.direction === 'inbound')) {
        for (const file of [message.original, ...message.files]) if (!file.erasure) {
            const object = manifest.objects.find(object => object.bucket === 'ORIGINALS' && object.key === file.key);
            check(object && object.size === file.size && object.sha256 === file.sha256, 'order_thread_original_inventory');
        }
        check(receipts.some(receipt => receipt.provider === 'resend' && receipt.email_id === message.providerEmailId && receipt.message === message.id && receipt.thread === message.thread && receipt.status === 'stored'), 'order_thread_receipt');
    }
    for (const receipt of receipts) {
        check(receipt.provider === 'resend' && /^[a-zA-Z0-9_-]{1,128}$/.test(receipt.email_id) && receipt.message === 'order-thread-inbound:resend:' + receipt.email_id && text(receipt.thread) && timestamp(receipt.created_at) && ['claimed', 'stored', 'uncertain'].includes(receipt.status), 'order_thread_receipt_shape');
        if (receipt.status === 'stored') check(messages.some(message => message.id === receipt.message && message.thread === receipt.thread && message.providerEmailId === receipt.email_id), 'order_thread_stored_receipt');
    }
}
