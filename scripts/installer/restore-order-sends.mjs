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
        if(event.invoiceConsentHistory){check(Array.isArray(event.invoiceConsentHistory)&&event.invoiceConsentHistory.length>0&&equal(event.invoiceConsent,event.invoiceConsentHistory.at(-1))&&event.invoiceSubmission===event.invoiceConsent.enabled,'order_invoice_consent');for(const [index,entry]of event.invoiceConsentHistory.entries())check(entry.version===index+1&&typeof entry.enabled==='boolean'&&entry.owner===true&&nonempty(entry.actor)&&Number.isSafeInteger(entry.operatorVersion)&&entry.operatorVersion>0&&nonempty(entry.reason)&&timestamp(entry.at)&&entry.revision===event.revision&&entry.pdfSha256===event.pdf.sha256&&audits.some(e=>e.action==='order-invoice-consent'&&e.send===event.id&&e.version===entry.version&&e.actor===entry.actor&&e.enabled===entry.enabled&&e.at===entry.at),'order_invoice_consent_history');}
        else check(event.invoiceSubmission!==true&&!event.invoiceConsent,'order_invoice_consent');
        const order = get('order', event.order), revision = get('revision', order.request + ':' + order.revision);
        check(!seen.has(order.id) && event.id === 'order-send:' + order.id && !order.imported && !order.adoption && order.issuedAt, 'order_send_source'); seen.add(order.id);
        check(event.request === order.request && event.supplier === order.supplier && event.number === order.number && event.revision === order.revision && (revision.amends || order.cancellation ? /^(?:Change order [1-9]\d*|Approved cancellation)$/.test(event.changeLabel) && event.mode !== 'initial' : event.mode === 'initial' && event.changeLabel === 'Purchase order'), 'order_send_revision');
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
            check(event.mode === 'initial' ? !event.content.sections.some(section => /^Change order \d+$/.test(section.heading)) : event.content.sections.some(section => section.heading === event.changeLabel), 'order_send_number');
        }
        check(audits.some(audit => audit.action === (event.mode === 'initial' ? 'order-send-claimed' : 'order-change-send-claimed') && audit.record === order.id && audit.send === event.id && audit.actor === event.actor && audit.email === event.email && audit.recipient === event.recipient && audit.revision === event.revision && audit.reason === event.reason && audit.pdfSha256 === file.sha256 && audit.contentSha256 === event.contentSha256 && audit.at === event.at), 'order_send_claim_audit');
        if (event.outcomeAt) check(audits.some(audit => audit.action === (event.mode === 'initial' ? 'order-send-outcome' : 'order-change-send-outcome') && audit.record === order.id && audit.send === event.id && audit.status === event.status && audit.pdfSha256 === file.sha256 && audit.at === event.outcomeAt), 'order_send_outcome_audit');
        if (event.revokedAt) check(timestamp(event.revokedAt) && audits.some(audit => audit.action === (event.mode === 'initial' ? 'order-link-revoked' : 'order-change-link-revoked') && audit.record === order.id && audit.send === event.id && audit.at === event.revokedAt), 'order_send_revoke_audit');
        validateResponses(event, order, all, get, check);
        if (event.acknowledgment) check(equal(event.acknowledgment, get('orderAcknowledgment', event.id)), 'order_acknowledgment_link');
    }
    for (const response of all('orderSupplierResponse')) {
        const event = get('orderSend', response.send), order = get('order', event.order);
        check(event.mode === 'initial' || /^Change order [1-9]\d*$/.test(event.changeLabel) && !order.cancellation && !order.supplierGroup && !order.recurring && !order.recurringSeries && !order.poDetails?.blanket && (!order.purchaseType || order.purchaseType === 'goods') && order.lines.every(line => !line.service && (!line.supplier || line.supplier === order.supplier)), 'order_response_send');
    }
    for (const acknowledgment of all('orderAcknowledgment')) {
        const event = get('orderSend', acknowledgment.send);
        check(acknowledgment.id === event.id && acknowledgment.order === event.order && acknowledgment.request === event.request && acknowledgment.revision === event.revision && acknowledgment.changeLabel === event.changeLabel && acknowledgment.pdfSha256 === event.pdf.sha256 && acknowledgment.actor === 'supplier-link' && acknowledgment.identityVerified === false && nonempty(acknowledgment.name) && timestamp(acknowledgment.at) && Date.parse(acknowledgment.at) >= Date.parse(event.at) && Date.parse(acknowledgment.at) < Date.parse(event.expiresAt) && equal(event.acknowledgment,acknowledgment), 'order_acknowledgment_revision');
        check(audits.some(audit => audit.action === (event.mode === 'initial' ? 'order-acknowledged' : 'order-change-acknowledged') && audit.record === event.order && audit.send === event.id && audit.actor === 'supplier-link' && audit.name === acknowledgment.name && audit.identityVerified === false && audit.revision === event.revision && audit.pdfSha256 === event.pdf.sha256 && audit.at === acknowledgment.at), 'order_acknowledgment_audit');
    }
}

function validateResponses(event, order, all, get, check) {
    const responses = all('orderSupplierResponse').filter(response => response.send === event.id).sort((left,right) => left.version-right.version);
    check(responses.length ? equal(event.response,responses.at(-1)) : !event.response, 'order_response_latest');
    for (const [index,response] of responses.entries()) {
        check(response.id === event.id+':'+(index+1) && response.version===index+1 && response.order===order.id && response.request===event.request && response.revision===event.revision && response.pdfSha256===event.pdf.sha256 && response.actor==='supplier-link' && response.identityVerified===false && nonempty(response.name) && timestamp(response.at) && Date.parse(response.at)>=Date.parse(event.at) && Date.parse(response.at)<Date.parse(event.expiresAt), 'order_response_revision');
        check(['accept','change','reject'].includes(response.decision) && (response.decision==='reject' ? response.promisedDate===null : typeof response.promisedDate==='string' && /^\d{4}-\d{2}-\d{2}$/.test(response.promisedDate) && Number.isFinite(Date.parse(response.promisedDate)) && new Date(response.promisedDate).toISOString().slice(0,10)===response.promisedDate) && (response.note===null || nonempty(response.note) && response.note.length<=2000), 'order_response_values');
        check(Array.isArray(response.lines) && response.lines.length<=order.lines.length && new Set(response.lines.map(line=>line.line)).size===response.lines.length && (response.decision==='change' || response.lines.length===0), 'order_response_lines');
        for (const line of response.lines) {
            const source=order.lines.find(source=>source.id===line.line);
            check(source && source.description===line.description && source.quantity===line.originalQuantity && source.q===line.originalQ && source.unitMinor===line.originalUnitMinor && typeof line.quantity==='string' && /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(line.quantity) && Number(line.quantity.split('.')[0])*1000+Number((line.quantity.split('.')[1]??'').padEnd(3,'0'))===line.q && line.q>0 && Number.isSafeInteger(line.unitMinor) && line.unitMinor>=0 && line.unitMinor<=1e12 && (line.q!==line.originalQ || line.unitMinor!==line.originalUnitMinor), 'order_response_source_line');
        }
        check(all('audit').some(audit=>audit.action==='order-supplier-response' && audit.record===order.id && audit.send===event.id && audit.response===response.id && audit.decision===response.decision && audit.promisedDate===response.promisedDate && audit.actor==='supplier-link' && audit.name===response.name && audit.identityVerified===false && audit.revision===response.revision && audit.pdfSha256===response.pdfSha256 && audit.at===response.at), 'order_response_audit');
        if (response.promisedDate) check(get('supplierOrderEvidence',order.id).history.some(entry=>entry.response===response.id && entry.promisedDate===response.promisedDate && entry.acknowledgedAt===response.at && entry.actor==='supplier-link' && entry.revision===event.revision), 'order_response_promise');
    }
    const adopted=new Set();
    for(const adoption of event.responseAdoptions??[]) {
        const response=get('orderSupplierResponse',adoption.response), draft=get('revision',adoption.request+':'+adoption.revision);
        check(!adopted.has(response.id) && response.send===event.id && response.decision==='change' && adoption.request===event.request && adoption.revision>event.revision && draft.amends===event.order && nonempty(adoption.actor) && nonempty(adoption.email) && nonempty(adoption.reason) && timestamp(adoption.at) && Date.parse(adoption.at)>=Date.parse(response.at), 'order_response_adoption');adopted.add(response.id);
        check(all('audit').some(audit=>audit.action==='order-response-adopted' && audit.record===event.order && audit.send===event.id && audit.response===response.id && audit.amendmentRevision===adoption.revision && audit.actor===adoption.actor && audit.at===adoption.at), 'order_response_adoption_audit');
    }
}
