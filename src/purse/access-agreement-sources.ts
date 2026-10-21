import { allowed } from './access';
import { agreementSpend } from './agreements';
import { all, type Actor, type Data, type State } from './types';

/** An award grants performance provenance for its exact retained agreement version.
 * It never grants the live register, other versions, or unrelated originals.
 */
export function performanceAgreementSources(s: State, a: Actor) {
    const versions = new Map<string, Set<number>>(), readingVersions = new Map<string, number>(), attachments = new Set<string>();
    const awards: Data[] = [];
    for (const award of all(s, 'agreementAward')) {
        if (!allowed(s, a, 'performance.read', award)) continue;
        const agreement = s.get('agreement:' + award.agreement)?.value;
        const version = agreement?.history?.find((value: Data) => value.version === award.agreementVersion);
        if (!version) continue;
        const selected = versions.get(award.agreement) ?? new Set<number>(); selected.add(award.agreementVersion); versions.set(award.agreement, selected);
        awards.push(award);
        const reference = award.reading;
        if (!reference || !version.reading || !['id', 'version', 'attachment', 'sha256', 'agreementVersion']
            .every(field => reference[field] === version.reading[field])) continue;
        const reading = s.get('agreementReading:' + reference.id)?.value, attachment = s.get('attachment:' + reference.attachment);
        if (!reading || reading.agreement !== award.agreement || reading.version !== reference.version || reading.status !== 'confirmed'
            || reading.attachment !== reference.attachment || reading.sourceDescriptor?.sha256 !== reference.sha256
            || !attachment || attachment.value.kind !== 'agreement' || attachment.value.record !== award.agreement
            || reading.sourceDescriptor?.attachmentRevision !== attachment.revision) continue;
        readingVersions.set(reading.id, reading.version); attachments.add(reference.attachment);
    }
    return { awards, versions, readingVersions, attachments };
}

export function scopedAgreementEvidence(s: State, a: Actor) {
    const selected = performanceAgreementSources(s, a);
    const invoiceEvidence = all(s, 'agreementInvoice').filter(link => {
        const invoice = s.get('invoice:' + link.invoice)?.value;
        return selected.versions.get(link.agreement)?.has(link.agreementVersion)
            && invoice && invoice.order === link.order && allowed(s, a, 'invoice.read', invoice);
    });
    const evidenceIds = new Set(invoiceEvidence.map(link => link.id));
    const spendState: State = new Map([...s].filter(([, row]) => row.kind !== 'agreementInvoice' || evidenceIds.has(row.id)));
    const agreements = all(s, 'agreement').filter(agreement => selected.versions.has(agreement.id)).map(agreement => {
        const history = agreement.history.filter((version: Data) => selected.versions.get(agreement.id)!.has(version.version));
        const latest = [...history].sort((first: Data, second: Data) => second.version - first.version)[0];
        return { ...latest, id: agreement.id, history, spend: agreementSpend(spendState, agreement.id),
            scopeBasis: 'Exact awarded agreement versions within your performance scope', readOnlySource: true };
    });
    return { agreement: agreements, agreementInvoice: invoiceEvidence, agreementReminder: [], agreementAward: selected.awards,
        agreementReading: all(s, 'agreementReading').filter(reading => selected.readingVersions.has(reading.id) && selected.readingVersions.get(reading.id) === reading.version),
        agreementReadingEvent: all(s, 'agreementReadingEvent').filter(event => selected.readingVersions.has(event.reading) && selected.readingVersions.get(event.reading) === event.version) };
}
