import { purchasingSearchText } from './search-text';
import { agreementReadingFields, missingAgreementField, normalizeAgreementField, parseAgreementFields, type AgreementReadingField } from './agreement-reading-fields';
import { quoteSourceDescriptor } from './quote-reading-proposal';
import { readQuoteSource } from './quote-reading-source';
import { all, audit, can, get, put, requireThat, uid, type Actor, type Data, type State } from './types';

function event(s: State, a: Actor, reading: Data, action: string, detail: Data = {}) {
    const id = uid();
    put(s, 'agreementReadingEvent', id, { agreement: reading.agreement, agreementVersion: reading.agreementVersion, reading: reading.id, attachment: reading.attachment, version: reading.version, action, actor: a.id, at: new Date().toISOString(), snapshot: structuredClone(reading), ...detail });
    audit(s, a, action, reading.agreement, { reading: reading.id, attachment: reading.attachment, agreementVersion: reading.agreementVersion, version: reading.version });
}
function currentSource(s: State, reading: Data) {
    const attachment = get(s, 'attachment', reading.attachment);
    requireThat(attachment.kind === 'agreement' && attachment.record === reading.agreement, 'Source attachment is outside this agreement', 403);
    requireThat(s.get('attachment:' + attachment.id)?.revision === reading.attachmentRevision, 'Source attachment changed; extract again', 409);
    return attachment;
}
export function visibleAgreementReadings(s: State, a: Actor): Data {
    can(s, a, 'buyer');
    return { agreementReading: all(s, 'agreementReading'), agreementReadingEvent: all(s, 'agreementReadingEvent') };
}
export async function agreementReading(s: State, a: Actor, op: string, b: Data): Promise<Data | undefined> {
    if (!['agreement-extract', 'agreement-reading-edit'].includes(op)) return;
    can(s, a, 'owner');
    if (op === 'agreement-extract') {
        const agreement = get(s, 'agreement', b.agreement), attachment = get(s, 'attachment', b.attachment);
        requireThat(b.version === agreement.version, 'Agreement changed; reload before extracting', 409);
        requireThat(attachment.kind === 'agreement' && attachment.record === agreement.id, 'Source attachment is outside this agreement', 403);
        const attachmentRevision = s.get('attachment:' + attachment.id)!.revision;
        const reading: Data = { id: uid(), agreement: agreement.id, agreementVersion: agreement.version, attachment: attachment.id, attachmentRevision, sourceName: attachment.name,
            sourceDescriptor: await quoteSourceDescriptor(attachment, attachmentRevision), version: 1, status: 'review', parser: 'deterministic labelled agreement PDF parser', actor: a.id, at: new Date().toISOString(),
            ...Object.fromEntries(agreementReadingFields.map(name => [name, missingAgreementField()])), warnings: [] };
        try {
            requireThat(attachment.mediaType.toLowerCase().split(';')[0] === 'application/pdf' || /\.pdf$/i.test(attachment.name), 'Agreement extraction requires a PDF original');
            const rows = await readQuoteSource(attachment);
            Object.assign(reading, parseAgreementFields(rows, attachment.id)); reading.searchText=purchasingSearchText(rows);
            requireThat(agreementReadingFields.some(name => reading[name].value !== null), 'No recognizable labelled agreement terms; correct the PDF source and extract again');
        } catch (error) { reading.status = 'unsupported'; reading.reason = (error as Error).message; }
        put(s, 'agreementReading', reading.id, reading); event(s, a, reading, op); return reading;
    }
    const reading = structuredClone(get(s, 'agreementReading', b.id)), agreement = get(s, 'agreement', reading.agreement);
    requireThat(reading.agreementVersion === agreement.version, 'Reading belongs to an older agreement version; extract again', 409);
    requireThat(reading.version === b.version && reading.status === 'review', 'Agreement review changed or cannot be edited', 409);
    currentSource(s, reading);
    requireThat(Array.isArray(b.changes) && b.changes.length > 0 && b.changes.length <= agreementReadingFields.length, 'Provide 1–9 agreement field corrections');
    const changes: Data[] = [], seen = new Set<string>();
    for (const change of b.changes) {
        requireThat(agreementReadingFields.includes(change.field) && !seen.has(change.field), 'Correct each agreement field at most once'); seen.add(change.field);
        const name = change.field as AgreementReadingField, value = normalizeAgreementField(name, change.value), before = reading[name];
        if (before.value === value) continue;
        reading[name] = { value, confidence: value === null ? 0 : 1, source: { attachment: reading.attachment, page: before.source?.page ?? null, method: 'human correction', actor: a.id, at: new Date().toISOString(), original: structuredClone(before.source) } };
        changes.push({ field: name, before: structuredClone(before), after: structuredClone(reading[name]) });
    }
    requireThat(changes.length, 'No field correction supplied'); reading.version++;
    put(s, 'agreementReading', reading.id, reading); event(s, a, reading, op, { changes }); return reading;
}

/** Called after agreement validation, in the same command transaction as the new confirmed revision. */
export function confirmAgreementReading(s: State, a: Actor, b: Data, previous: Data | undefined): Data | null {
    can(s, a, 'owner');
    if (b.reading == null) return null;
    requireThat(previous && b.confirmed === true && b.version === previous.version, 'An existing current agreement and explicit owner confirmation are required', 409);
    const reading = structuredClone(get(s, 'agreementReading', b.reading.id));
    if(reading.status==='confirmed' && previous.reading?.id===reading.id && previous.reading?.version===b.reading.version){
        currentSource(s,reading);for(const name of agreementReadingFields)requireThat(normalizeAgreementField(name,b[name]??null)===reading[name].value,'Changed source terms require a fresh PDF review',409);
        return structuredClone(previous.reading);
    }
    requireThat(reading.agreement === previous.id && reading.agreementVersion === previous.version, 'Reading belongs to another agreement or an older version', 409);
    requireThat(reading.status === 'review' && reading.version === b.reading.version, 'Agreement review changed or was already confirmed', 409);
    currentSource(s, reading);
    for (const name of agreementReadingFields) {
        const value = normalizeAgreementField(name, b[name] ?? null);
        requireThat(name === 'firstOfferMinor' || reading[name].value !== null, `Correct missing ${name} in the reading before confirmation`);
        requireThat(value === reading[name].value, `Confirmed ${name} differs from the reviewed reading; correct the reading first`, 409);
    }
    reading.version++; reading.status = 'confirmed'; reading.confirmedAgreementVersion = previous.version + 1; reading.confirmedBy = a.id; reading.confirmedAt = new Date().toISOString();
    put(s, 'agreementReading', reading.id, reading); event(s, a, reading, 'agreement-reading-confirm', { reason: b.reason });
    return { id: reading.id, version: reading.version, attachment: reading.attachment, sha256: reading.sourceDescriptor.sha256, agreementVersion: reading.agreementVersion };
}
