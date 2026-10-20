import type { SourceLine } from './quote-reading-source';
import { date, minor, requireThat, text, type Data } from './types';

export const agreementReadingFields = ['parties', 'currency', 'valueMinor', 'firstOfferMinor', 'startDate', 'endDate', 'autoRenew', 'noticeDays', 'paymentTerms'] as const;
export type AgreementReadingField = typeof agreementReadingFields[number];
export type AgreementField = { value: string | number | boolean | null; confidence: number; source: Data | null };
export const missingAgreementField = (): AgreementField => ({ value: null, confidence: 0, source: null });

/** Corrections use domain values: money is integer minor units, dates are ISO days. */
export function normalizeAgreementField(name: AgreementReadingField, value: unknown): AgreementField['value'] {
    if (value === null) return null;
    if (name === 'valueMinor' || name === 'firstOfferMinor') return minor(value, name);
    if (name === 'autoRenew') { requireThat(typeof value === 'boolean', 'Auto renewal must be true or false'); return value; }
    if (name === 'noticeDays') { requireThat(Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 3650, 'Notice days must be an integer from 0 to 3650'); return Number(value); }
    if (name === 'startDate' || name === 'endDate') return date(value, name);
    const normalized = text(value, name);
    if (name === 'currency') requireThat(/^[A-Z]{3}$/.test(normalized), 'Use an uppercase ISO currency code');
    return normalized;
}

function sourceDay(value: string): string | null {
    let candidate = value.trim();
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const words = candidate.match(/^(?:(\d{1,2})\s+([A-Za-z]+)|([A-Za-z]+)\s+(\d{1,2}),?)\s+(\d{4})$/);
    if (words) { const month = months.findIndex(m => m === (words[2] ?? words[3]).toLowerCase()); if (month < 0) return null; candidate = `${words[5]}-${String(month + 1).padStart(2, '0')}-${(words[1] ?? words[4]).padStart(2, '0')}`; }
    try { return date(candidate); } catch { return null; }
}
function sourceMoney(value: string, currency: string | null): number | null {
    const match = value.match(/^(?:([A-Z]{3})\s*)?([$€£])?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:\s+([A-Z]{3}))?$/);
    if (!match || match[1] && match[4] && match[1] !== match[4]) return null;
    const explicit = match[1] ?? match[4];
    if (explicit && currency && explicit !== currency) return null;
    if (match[2] === '€' && currency !== 'EUR' || match[2] === '£' && currency !== 'GBP' || match[2] === '$' && (!currency || !['USD','CAD','AUD','NZD','SGD','HKD'].includes(currency))) return null;
    const [whole, fraction = ''] = match[3].replaceAll(',', '').split('.');
    const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    return result <= 1000000000000n ? Number(result) : null;
}
const labels: Record<AgreementReadingField, RegExp> = {
    parties: /^(?:parties|contracting parties)\s*[:=]\s*(.+)$/i,
    currency: /^(?:(?:agreement|contract)\s+)?currency\s*[:=]\s*([A-Z]{3})$/i,
    valueMinor: /^(?:(?:agreement|contract|awarded|award)\s+(?:value|price)|total (?:agreement|contract) value)\s*[:=]\s*(.+)$/i,
    firstOfferMinor: /^(?:(?:first|initial|original)\s+offer(?:\s+(?:value|price))?|first[- ]offer price)\s*[:=]\s*(.+)$/i,
    startDate: /^(?:(?:agreement|contract)\s+)?(?:start|effective|commencement) date\s*[:=]\s*(.+)$/i,
    endDate: /^(?:(?:agreement|contract)\s+)?(?:end|expiry|expiration|termination) date\s*[:=]\s*(.+)$/i,
    autoRenew: /^(?:auto[- ]?renew(?:al)?|automatic renewal)\s*[:=]\s*(yes|no|true|false)$/i,
    noticeDays: /^(?:(?:termination|renewal|non[- ]renewal)\s+)?notice(?:\s+period)?(?:\s*\(days\)|\s+days)?\s*[:=]\s*(\d+)(?:\s+(?:calendar\s+)?days)?$/i,
    paymentTerms: /^payment terms\s*[:=]\s*(.+)$/i,
};

/** Only explicitly labelled terms are proposed; contradictions remain missing for owner review. */
export function parseAgreementFields(rows: SourceLine[], attachment: string): Data {
    const fields: Data = Object.fromEntries(agreementReadingFields.map(name => [name, missingAgreementField()]));
    const warnings: string[] = [];
    const candidates = Object.fromEntries(agreementReadingFields.map(name => [name, rows.flatMap(row => { const match = row.text.match(labels[name]); return match ? [{ row, raw: match[1] }] : []; })])) as Record<AgreementReadingField, { row: SourceLine; raw: string }[]>;
    for (const name of ['currency', ...agreementReadingFields.filter(n => n !== 'currency')] as AgreementReadingField[]) {
        const found: AgreementField[] = [];
        for (const { row, raw } of candidates[name]) {
            let value: AgreementField['value'] = raw.trim();
            if (name === 'currency') value = raw.toUpperCase();
            else if (name === 'valueMinor' || name === 'firstOfferMinor') value = sourceMoney(raw, fields.currency.value);
            else if (name === 'startDate' || name === 'endDate') value = sourceDay(raw);
            else if (name === 'autoRenew') value = /^(yes|true)$/i.test(raw);
            else if (name === 'noticeDays') value = Number(raw);
            if (value === null) { warnings.push(`Unrecognized ${name} on page ${row.page}; correct it before confirmation.`); continue; }
            try { value = normalizeAgreementField(name, value); } catch { warnings.push(`Invalid ${name} on page ${row.page}; correct it before confirmation.`); continue; }
            found.push({ value, confidence: .97, source: { attachment, page: row.page, line: row.line, excerpt: row.text, method: 'explicit agreement term label' } });
        }
        if (found.length && new Set(found.map(f => JSON.stringify(f.value))).size === 1 && found.length === candidates[name].length) fields[name] = found[0];
        else if (found.length) warnings.push(`Conflicting or unreadable ${name} labels; no value was chosen.`);
    }
    return { ...fields, warnings };
}
