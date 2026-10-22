import { createHash } from 'node:crypto';
import { validateSendResult } from '../../src/modules/mail/src/core/validation.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
/** Historical evidence restores, installation-local bearer authority never does. */
export function validateOrderSends(all, get, check) {
    const audits = all('audit'), seen = new Set();
    for (const event of all('orderSend')) {
        const order = get('order', event.order), revision = get('revision', order.request + ':' + order.revision);
        check(!seen.has(order.id) && event.id === 'order-send:' + order.id && !order.imported && !order.adoption && order.issuedAt && (revision.amends || order.cancellation), 'order_send_source'); seen.add(order.id);
        check(event.request === order.request && event.supplier === order.supplier && event.number === order.number && event.revision === order.revision && /^(?:Change order [1-9]\d*|Approved cancellation)$/.test(event.changeLabel), 'order_send_revision');
        check(nonempty(event.actor) && nonempty(event.email) && nonempty(event.reason) && nonempty(event.recipient) && timestamp(event.at) && Date.parse(event.at) >= Date.parse(order.issuedAt) && timestamp(event.expiresAt) && Date.parse(event.expiresAt) > Date.parse(event.at) && Date.parse(event.expiresAt) - Date.parse(event.at) <= 7 * 86400000, 'order_send_custody');
        check(['uncertain','accepted','rejected','rate_limited','suppressed','unavailable'].includes(event.status), 'order_send_status');
        if (event.outcomeAt) check(timestamp(event.outcomeAt) && Date.parse(event.outcomeAt) >= Date.parse(event.at), 'order_send_outcome');
        if (event.delivery) {
            try { validateSendResult(event.delivery, event.delivery.provider); } catch { check(false,'order_send_delivery'); }
            check(event.status === (event.delivery.status === 'development' ? 'suppressed' : event.delivery.status), 'order_send_delivery_status');
        }
        const file = event.pdf;
        check(file && nonempty(file.name) && /^[a-f0-9]{64}$/.test(file.sha256) && Number.isSafeInteger(file.size) && file.size > 0 && event.content && typeof event.content.title === 'string' && Array.isArray(event.content.sections) && event.content.sections.every(section => typeof section.heading === 'string' && Array.isArray(section.lines) && section.lines.every(line => typeof line === 'string')) && Array.isArray(event.content.attachments), 'order_send_document');
        if (event.erasure) check(file.erasure && file.base64 === '' && event.content.attachments.every(original => original.erasure && original.base64 === ''), 'order_send_erased_original');
        else {
            const bytes = Buffer.from(file.base64, 'base64');
            check(bytes.length === file.size && bytes.subarray(0,5).toString() === '%PDF-' && digest(bytes) === file.sha256, 'order_send_pdf_digest');
            check(digest(JSON.stringify(event.content)) === event.contentSha256, 'order_send_content_digest');
            check(event.content.title === `${order.documentProfile?.legalName || 'Legal entity: Not recorded'} · ${order.number}`, 'order_send_identity');
            check(equal(event.content.attachments, [order.documentProfile?.termsFile,order.documentProfile?.certificate].filter(file => file && !file.erasure)), 'order_send_originals');
            check(event.content.sections.some(section => section.heading === event.changeLabel), 'order_send_number');
        }
        check(audits.some(audit => audit.action === 'order-change-send-claimed' && audit.record === order.id && audit.send === event.id && audit.actor === event.actor && audit.email === event.email && audit.recipient === event.recipient && audit.revision === event.revision && audit.reason === event.reason && audit.pdfSha256 === file.sha256 && audit.contentSha256 === event.contentSha256 && audit.at === event.at), 'order_send_claim_audit');
        if (event.outcomeAt) check(audits.some(audit => audit.action === 'order-change-send-outcome' && audit.record === order.id && audit.send === event.id && audit.status === event.status && audit.pdfSha256 === file.sha256 && audit.at === event.outcomeAt), 'order_send_outcome_audit');
        if (event.revokedAt) check(timestamp(event.revokedAt) && audits.some(audit => audit.action === 'order-change-link-revoked' && audit.record === order.id && audit.send === event.id && audit.at === event.revokedAt), 'order_send_revoke_audit');
        if (event.acknowledgment) check(equal(event.acknowledgment, get('orderAcknowledgment', event.id)), 'order_acknowledgment_link');
    }
    for (const acknowledgment of all('orderAcknowledgment')) {
        const event = get('orderSend', acknowledgment.send);
        check(acknowledgment.id === event.id && acknowledgment.order === event.order && acknowledgment.request === event.request && acknowledgment.revision === event.revision && acknowledgment.changeLabel === event.changeLabel && acknowledgment.pdfSha256 === event.pdf.sha256 && acknowledgment.actor === 'supplier-link' && acknowledgment.identityVerified === false && nonempty(acknowledgment.name) && timestamp(acknowledgment.at) && Date.parse(acknowledgment.at) >= Date.parse(event.at) && Date.parse(acknowledgment.at) < Date.parse(event.expiresAt) && equal(event.acknowledgment,acknowledgment), 'order_acknowledgment_revision');
        check(audits.some(audit => audit.action === 'order-change-acknowledged' && audit.record === event.order && audit.send === event.id && audit.actor === 'supplier-link' && audit.name === acknowledgment.name && audit.identityVerified === false && audit.revision === event.revision && audit.pdfSha256 === event.pdf.sha256 && audit.at === acknowledgment.at), 'order_acknowledgment_audit');
    }
}
