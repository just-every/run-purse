import { evidenceLabel } from './invoice-evidence-labels';
import type { Data } from './types';
export function openInvoiceFlags(invoice: Data): Data[] {
    const reviewed = new Set((invoice.riskReviews ?? []).map((r: Data) => r.flag));
    return (invoice.flags ?? []).filter((flag: Data) => !reviewed.has(flag.id));
}

export function publicInvoice(invoice: Data): Data { return publicEvidence(invoice); }

export function publicEvidence(invoice: Data) {
    const {evidenceHash,evidence,...value}=invoice;
    return {...value,...(evidenceHash?{evidenceStatus:{representation:evidence?.representation??'legacy-root-v1',state:evidence?.state??'unmigrated',label:evidenceLabel(evidence)}}:{})};
}
