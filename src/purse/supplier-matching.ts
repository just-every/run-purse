import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index';
import { all, text, requireThat, type Data, type State } from './types';

export const normalizedSupplierText = (value: unknown) => typeof value === 'string' ? value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '';
const phone = (value: unknown) => { const digits = typeof value === 'string' ? value.replace(/\D/g, '') : ''; return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits; };
const domains = (supplier: Data) => [...new Set((supplier.contacts ?? []).map((contact: Data) => typeof contact.email === 'string' ? contact.email.trim().toLowerCase().split('@')[1] : '').filter(Boolean))];

/** Possible matches are evidence for a buyer's review, never proof of identity. */
export function supplierMatches(s: State, input: Data, others = all(s, 'supplier')) {
    const names = [input.name, input.dba].map(normalizedSupplierText).filter(Boolean);
    const emailDomains = domains(input), address = normalizedSupplierText(input.address), telephone = phone(input.phone);
    return others.filter(other => other.id !== input.id).flatMap(other => {
        const reasons: string[] = [];
        if ([other.name, other.dba].map(normalizedSupplierText).some(n => n && names.includes(n))) reasons.push('legal name / DBA');
        if (domains(other).some(domain => emailDomains.includes(domain))) reasons.push('email domain');
        if (address && normalizedSupplierText(other.address) === address) reasons.push('address');
        if (input.matching?.tin && input.matching.tin === other.matching?.tin) reasons.push('TIN (matching-only)');
        if (input.matching?.bank && input.matching.bank === other.matching?.bank) reasons.push('bank account (matching-only)');
        if (telephone && phone(other.phone) === telephone) reasons.push('phone');
        return reasons.length ? [{ id: other.id, name: other.name, status: other.status, mergedInto: other.mergedInto ?? null, reasons }] : [];
    });
}

export function supplierPublicProfile(input: Data, previous?: Data) {
    const optional = (field: string, max = 2000) => {
        const value = input[field] ?? previous?.[field] ?? '';
        requireThat(typeof value === 'string' && value.length <= max, field + ' must be text');
        return value.trim();
    };
    requireThat(input.contacts === undefined || Array.isArray(input.contacts), 'Contacts must be a list');
    const contacts = (input.contacts ?? previous?.contacts ?? []).map((c: Data) => ({ name: text(c.name, 'Contact name'), email: text(c.email, 'Contact email') }));
    return { name: text(input.name, 'Supplier name'), dba: optional('dba', 200), address: optional('address'), phone: optional('phone', 100), contacts };
}
export function duplicateReview(s: State, profile: Data) {
    const matches = supplierMatches(s, profile);
    const versions = matches.map(m => [m.id, s.get('supplier:' + m.id)?.revision]);
    return { matches, fingerprint: sha256(canonicalJson({ profile: { ...profile, id: profile.id ?? null }, versions })) };
}
