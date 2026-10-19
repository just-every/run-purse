import { requireThat, text, type Data } from './types';
/** Structured readings are postal/payment facts, never a second bank-data store. */
export function invoiceReadingText(value: unknown, label: string): string {
    const result = text(value, label, 2000);
    requireThat(!/\b(?:routing|(?:bank\s*)?account|TIN|SSN)\s*(?:number|no\.?|#)?\s*[:=]?\s*\d[\d -]{3,}/i.test(result)
        && !/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/.test(result), 'Remove bank/TIN details from structured fields and quotations; use the private original and transient bank comparison inputs');
    return result;
}
export function postalRemit(value: unknown): string {
    const result = invoiceReadingText(value, 'Remit payee and postal address');
    requireThat(!/\d{8,}/.test(result), 'Remit fields accept payee/postal address only; bank digits belong only in transient comparison inputs');
    return result;
}
export function invoiceField(input: Data, attachment: string, label: string, postal = false): Data {
    requireThat(input && Object.keys(input).every(key => ['value','confidence','page','excerpt'].includes(key)), label + ' contains unsupported structured fields');
    requireThat(Number.isFinite(input.confidence) && input.confidence >= 0 && input.confidence <= 1, label + ' requires confidence from zero to one');
    if (input.value === null) { requireThat(input.confidence === 0 && input.page === null && input.excerpt === null, 'Missing fields require zero confidence and null source'); return { value: null, confidence: 0, source: null }; }
    const value = postal ? postalRemit(input.value) : invoiceReadingText(input.value, label);
    const excerpt = invoiceReadingText(input.excerpt, label + ' source quotation');
    requireThat(Number.isSafeInteger(input.page) && input.page > 0 && input.page <= 10000, 'Every supplied value requires a source page');
    // Remit quotations can contain nearby bank details, so keep only the original/page link.
    return { value, confidence: input.confidence, source: { attachment, page: input.page, ...(postal ? {} : { excerpt }), method: 'externally prepared invoice quotation (unverified)' } };
}
