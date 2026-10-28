import { createHash } from 'node:crypto';
import { canonicalSupplier } from './supplier-identity';
import { all, audit, can, date, get, put, requireThat, text, uid, type Actor, type Data, type State } from './types';

const documentTypes = ['insurance', 'w9', 'license', 'security-review', 'agreement'];
const calendar = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

function localDate(timestamp: number): string {
    const parts = calendar.formatToParts(timestamp);
    const part = (type: string) => parts.find(p => p.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

// Arithmetic is on date-only values, so DST never shortens or lengthens a compliance day.
const dayNumber = (value: string) => Date.parse(value + 'T00:00:00Z') / 86400000;
const addDays = (value: string, days: number) => new Date((dayNumber(value) + days) * 86400000).toISOString().slice(0, 10);

function expiry(value: unknown): string { return date(value, 'Document expiry'); }

function attachment(s: State, supplier: string, value: unknown): string {
    const id = text(value, 'Supplier attachment', 200), file = get(s, 'attachment', id);
    requireThat(file.kind === 'supplier' && file.record === supplier && file.privateSupplierDocument === true, 'Use private compliance evidence belonging to this supplier', 409);
    return id;
}

function metadata(b: Data): Data {
    requireThat(documentTypes.includes(b.type), 'Choose insurance, W-9, license, security review or agreement');
    requireThat(typeof b.required === 'boolean', 'Required document must be true or false');
    requireThat(Array.isArray(b.reminderDays) && b.reminderDays.every((days: unknown) => Number.isSafeInteger(days) && Number(days) >= 0 && Number(days) <= 365), 'Reminder days must be whole numbers from 0 through 365');
    requireThat(b.refreshEveryDays == null || (Number.isSafeInteger(b.refreshEveryDays) && b.refreshEveryDays > 0 && b.refreshEveryDays <= 3650), 'Refresh cycle must be a positive whole number up to 3650 days');
    return { type: b.type, required: b.required, expires: expiry(b.expires),
        reminderDays: [...new Set<number>(b.reminderDays)], refreshEveryDays: b.refreshEveryDays ?? null };
}

function history(previous: Data | undefined): Data[] {
    if (!previous) return [];
    const { history: prior = [], ...snapshot } = previous;
    return [...structuredClone(prior), structuredClone(snapshot)];
}

/** Supplier uploads are pending evidence; only a buyer command changes the accepted document. */
export function supplierDocuments(s: State, a: Actor, op: string, b: Data): Data | undefined {
    if (!['supplier-document', 'review-supplier-document'].includes(op)) return;
    can(s, a, 'buyer');
    const previous = b.id ? get(s, 'supplierDocument', text(b.id, 'Document ID', 200)) : undefined;
    requireThat(op !== 'review-supplier-document' || previous, 'Choose a supplier document to review');
    requireThat(b.version === (previous?.version ?? 0), 'Supplier document changed; reload', 409);
    const supplier = get(s, 'supplier', previous?.supplier ?? text(b.supplier, 'Supplier', 200));
    requireThat(b.supplier == null || b.supplier === supplier.id, 'A supplier document cannot move to another supplier', 409);
    const now = new Date().toISOString(), id = previous?.id ?? uid();
    const values = op === 'supplier-document' ? metadata(b) : { expires: expiry(b.expires) };
    const file = attachment(s, supplier.id, b.attachment);
    let submission: Data | undefined;
    if (b.submission != null) {
        requireThat(op === 'review-supplier-document', 'Review the supplier submission before accepting it');
        submission = get(s, 'supplierDocumentSubmission', text(b.submission, 'Submission ID', 200));
        requireThat(submission.document === id && submission.status === 'pending', 'Supplier submission changed or already reviewed; reload', 409);
        requireThat(submission.attachment === file, 'Review must use the submitted attachment', 409);
    }
    const reviewed = !previous || op === 'review-supplier-document' || file !== previous.attachment || values.expires !== previous.expires;
    const review = reviewed ? { actor: a.id, at: now, attachment: file, expires: values.expires, submission: submission?.id ?? null } : previous.review;
    const result: Data = { ...previous, ...values, supplier: supplier.id, attachment: file, version: (previous?.version ?? 0) + 1,
        createdBy: previous?.createdBy ?? a.id, createdAt: previous?.createdAt ?? now, updatedBy: a.id, updatedAt: now,
        reviewedBy: reviewed ? a.id : previous!.reviewedBy, reviewedAt: reviewed ? now : previous!.reviewedAt,
        review, history: history(previous) };
    put(s, 'supplierDocument', id, result);
    if (submission) put(s, 'supplierDocumentSubmission', submission.id, { ...submission, status: 'reviewed', reviewedBy: a.id,
        reviewedAt: now, review: { ...review, documentVersion: result.version } });
    audit(s, a, op, id, { supplier: supplier.id, version: result.version, attachment: file, expires: result.expires, submission: submission?.id ?? null });
    return get(s, 'supplierDocument', id);
}

/** Expiry is inclusive in New York; a pending upload never clears a lapse or restarts a cycle. */
export function supplierDocumentStatus(s: State, document: Data, now = Date.now()): Data {
    const today = localDate(now), expires = document.expires || null;
    const daysUntilExpiry = expires ? dayNumber(expires) - dayNumber(today) : null;
    const missingExpiry = !expires, lapsed = (daysUntilExpiry !== null && daysUntilExpiry < 0) || (Boolean(document.required) && missingExpiry);
    const refreshDueDate = document.refreshEveryDays && document.reviewedAt
        ? addDays(localDate(Date.parse(document.reviewedAt)), document.refreshEveryDays) : null;
    const daysUntilRefresh = refreshDueDate ? dayNumber(refreshDueDate) - dayNumber(today) : null;
    const pendingSubmissions = all(s, 'supplierDocumentSubmission').filter(row => row.document === document.id && row.status === 'pending');
    return { today, expires, daysUntilExpiry, missingExpiry, lapsed, required: Boolean(document.required),
        refreshDueDate, daysUntilRefresh, refreshDue: daysUntilRefresh !== null && daysUntilRefresh <= 0,
        reminderDaysDue: daysUntilExpiry === null || daysUntilExpiry < 0 ? [] : (document.reminderDays ?? []).filter((days: number) => daysUntilExpiry <= days),
        pendingReview: pendingSubmissions.length > 0, pendingSubmissions };
}

/** A required lapse holds new POs without changing historical evidence. */
export function lapsedSupplierDocuments(s: State, supplierId: string, now = Date.now()): Data[] {
    const supplier = canonicalSupplier(s, supplierId);
    return all(s, 'supplierDocument').filter(document => document.required && canonicalSupplier(s, document.supplier) === supplier
        && supplierDocumentStatus(s, document, now).lapsed);
}

/** A value-free binding to the buyer-reviewed original; withdrawn bytes remain history. */
export function supplierDocumentOriginal(s: State, document: Data) {
    const file = get(s, 'attachment', document.attachment);
    return { document: document.id, documentVersion: document.version, sourceSupplier: document.supplier, attachment: file.id,
        sha256: file.erasure ? file.sha256 : createHash('sha256').update(Uint8Array.from(atob(file.base64), char => char.charCodeAt(0))).digest('hex'),
        available: !file.erasure && file.privateSupplierDocument === true && file.kind === 'supplier' && file.record === document.supplier
            && document.review?.attachment === file.id && Boolean(document.reviewedBy) };
}
