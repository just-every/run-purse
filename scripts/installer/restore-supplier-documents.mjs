import { validateSendResult } from '../../src/modules/mail/src/core/validation.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 2000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)
    && date(value.slice(0, 10)) && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60
    && (value.endsWith('Z') || Number(value.slice(-5, -3)) < 24 && Number(value.slice(-2)) < 60) && Number.isFinite(Date.parse(value));

/** Validate the staged graph before restore writes any supplier compliance evidence. */
export function validateSupplierDocuments(all, get, check) {
    const attachment = (id, supplier) => {
        check(text(id, 200), 'supplier_document_attachment');
        const file = get('attachment', id);
        check(file.kind === 'supplier' && file.record === supplier && file.privateSupplierDocument === true, 'supplier_document_attachment');
    };
    const expiry = value => check(date(value), 'supplier_document_expiry');
    const versions = new Map();
    for (const document of all('supplierDocument')) {
        check(object(document) && text(document.id, 200) && text(document.supplier, 200), 'supplier_document');
        get('supplier', document.supplier);
        check(Number.isSafeInteger(document.version) && document.version > 0 && Array.isArray(document.history)
            && document.history.length === document.version - 1, 'supplier_document_history');
        const entries = [...document.history, document];
        versions.set(document.id, entries);
        for (const [index, entry] of entries.entries()) {
            check(object(entry) && entry.id === document.id && entry.supplier === document.supplier && entry.version === index + 1
                && (entry === document || !Object.hasOwn(entry, 'history')), 'supplier_document_history');
            check(['insurance', 'w9', 'license', 'security-review', 'agreement'].includes(entry.type) && typeof entry.required === 'boolean', 'supplier_document_metadata');
            expiry(entry.expires, entry.required);
            attachment(entry.attachment, document.supplier);
            check(Array.isArray(entry.reminderDays) && entry.reminderDays.length <= 366 && new Set(entry.reminderDays).size === entry.reminderDays.length
                && entry.reminderDays.every(days => Number.isSafeInteger(days) && days >= 0 && days <= 365), 'supplier_document_reminders');
            check(entry.refreshEveryDays === null || Number.isSafeInteger(entry.refreshEveryDays) && entry.refreshEveryDays > 0 && entry.refreshEveryDays <= 3650, 'supplier_document_refresh');
            check(text(entry.createdBy) && text(entry.updatedBy) && text(entry.reviewedBy) && timestamp(entry.createdAt) && timestamp(entry.updatedAt) && timestamp(entry.reviewedAt)
                && entry.createdBy === document.createdBy && entry.createdAt === document.createdAt
                && Date.parse(entry.createdAt) <= Date.parse(entry.reviewedAt) && Date.parse(entry.reviewedAt) <= Date.parse(entry.updatedAt)
                && (!index || Date.parse(entries[index - 1].updatedAt) <= Date.parse(entry.updatedAt)), 'supplier_document_timestamps');
            const review = entry.review;
            check(object(review) && review.actor === entry.reviewedBy && review.at === entry.reviewedAt
                && review.attachment === entry.attachment && review.expires === entry.expires, 'supplier_document_review');
            if (review.submission !== null) {
                check(text(review.submission, 200), 'supplier_document_submission_review');
                const submission = get('supplierDocumentSubmission', review.submission);
                check(submission.document === document.id && submission.attachment === entry.attachment && submission.status === 'reviewed'
                    && submission.reviewedBy === entry.reviewedBy && submission.reviewedAt === entry.reviewedAt
                    && submission.review?.documentVersion <= entry.version, 'supplier_document_submission_review');
            }
        }
    }
    for (const submission of all('supplierDocumentSubmission')) {
        check(object(submission) && text(submission.id, 200) && text(submission.document, 200), 'supplier_document_submission');
        const document = get('supplierDocument', submission.document);
        attachment(submission.attachment, document.supplier);
        check(timestamp(submission.submittedAt) && ['pending', 'reviewed'].includes(submission.status), 'supplier_document_submission');
        if (submission.status === 'pending') {
            check(submission.reviewedAt == null && submission.reviewedBy == null && submission.review == null, 'supplier_document_pending_review');
            continue;
        }
        const review = submission.review;
        check(object(review) && Number.isSafeInteger(review.documentVersion) && review.documentVersion > 0
            && text(submission.reviewedBy) && timestamp(submission.reviewedAt) && Date.parse(submission.submittedAt) <= Date.parse(submission.reviewedAt), 'supplier_document_submission_review');
        const accepted = versions.get(document.id)?.[review.documentVersion - 1];
        check(accepted && accepted.attachment === submission.attachment && accepted.expires === review.expires
            && accepted.reviewedBy === submission.reviewedBy && accepted.reviewedAt === submission.reviewedAt
            && accepted.review.submission === submission.id && review.submission === submission.id && review.actor === submission.reviewedBy
            && review.at === submission.reviewedAt && review.attachment === submission.attachment, 'supplier_document_submission_review');
    }
    for (const reminder of all('supplierDocumentReminder')) {
        check(object(reminder) && text(reminder.document, 200) && Number.isSafeInteger(reminder.documentVersion) && reminder.documentVersion > 0, 'supplier_document_reminder');
        const document = get('supplierDocument', reminder.document), entry = versions.get(document.id)?.[reminder.documentVersion - 1];
        check(entry && reminder.supplier === document.supplier && reminder.expires === entry.expires && timestamp(reminder.createdAt), 'supplier_document_reminder_version');
        get('supplier', reminder.supplier);
        check(reminder.reason === 'cycle' ? entry.refreshEveryDays !== null : typeof reminder.reason === 'string'
            && (/^manual-[a-f0-9-]{36}$/.test(reminder.reason) || entry.reminderDays.some(days => reminder.reason === `expiry-${days}`)), 'supplier_document_reminder_reason');
        check(reminder.id === `${document.id}:${reminder.documentVersion}:${reminder.reason}` && Array.isArray(reminder.outcomes) && reminder.outcomes.length <= 2, 'supplier_document_reminder_outcomes');
        const targets = new Set();
        for (const outcome of reminder.outcomes) {
            check(object(outcome) && ['supplier', 'owner'].includes(outcome.target) && !targets.has(outcome.target)
                && typeof outcome.recipient === 'string' && outcome.recipient.length <= 2000, 'supplier_document_reminder_outcome');
            targets.add(outcome.target);
            const { target, recipient, at, ...result } = outcome;
            if (outcome.status === 'unavailable' || outcome.status === 'uncertain' && outcome.provider === undefined) {
                check(Object.keys(result).length === 1 && (outcome.status === 'unavailable' ? at === undefined : text(recipient) && timestamp(at)), 'supplier_document_reminder_outcome');
                continue;
            }
            check(text(recipient) && timestamp(at) && (result.providerMessageId === null || text(result.providerMessageId, 1024))
                && (result.recipientResults === undefined || Array.isArray(result.recipientResults) && result.recipientResults.length <= 1), 'supplier_document_reminder_outcome');
            try { validateSendResult(result, result.provider); } catch { check(false, 'supplier_document_reminder_provider'); }
        }
    }
}
