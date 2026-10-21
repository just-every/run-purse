import { publicEvidence } from './invoice-evidence-history';
import type { Data } from './types';
export function openInvoiceFlags(invoice: Data): Data[] {
    const reviewed = new Set((invoice.riskReviews ?? []).map((r: Data) => r.flag));
    return (invoice.flags ?? []).filter((flag: Data) => !reviewed.has(flag.id));
}

export function publicInvoice(invoice: Data): Data { return publicEvidence(invoice); }
