import { purchasingSearchText } from './search-text';
import { proposedQuoteReading, quoteReadingInstructions, quoteSourceDescriptor } from './quote-reading-proposal';
import { all, audit, get, put, requireThat, roles, text, uid, type Actor, type Data, type State } from './types';
import { requests } from './requests';
import { readQuoteSource } from './quote-reading-source';
import { parseQuoteFields, type QuoteField } from './quote-reading-fields';
const headers = ['currency', 'freightAmount', 'taxAmount', 'leadTime', 'validity'];
const itemFields = ['description', 'quantity', 'unitAmount', 'unit'];
function scope(s: State, a: Actor, request: Data) {
    const capabilities = roles(s, a);
    requireThat(capabilities.includes('buyer') || capabilities.includes('requester') && (request.requester === a.id || request.requesterEmail === a.email), 'Only the current requester or buyer may review this quote', 403);
}
function event(s: State, a: Actor, reading: Data, action: string, detail: Data = {}) {
    const id = uid(); put(s, 'quoteReadingEvent', id, { request: reading.request, reading: reading.id, revision: reading.revision, attachment: reading.attachment, version: reading.version, action, actor: a.id, at: new Date().toISOString(), ...detail });
    audit(s, a, action, reading.request, { reading: reading.id, attachment: reading.attachment, revision: reading.revision, version: reading.version });
}
export function visibleQuoteReadings(s: State, requestIds: Set<string>) {
    return { quoteReading: all(s, 'quoteReading').filter(r => requestIds.has(r.request)), quoteReadingEvent: all(s, 'quoteReadingEvent').filter(r => requestIds.has(r.request)) };
}
export async function quoteReading(s: State, a: Actor, op: string, b: Data): Promise<Data | undefined> {
    if (!['quote-extract', 'quote-reading-instructions', 'quote-reading-propose', 'quote-reading-edit', 'quote-reading-confirm'].includes(op)) return;
    const prior = ['quote-extract', 'quote-reading-instructions', 'quote-reading-propose'].includes(op) ? null : get(s, 'quoteReading', b.id);
    const request = get(s, 'request', prior?.request ?? b.request); scope(s, a, request);
    requireThat(b.request === request.id && b.revision === request.revision && (!prior || prior.revision === request.revision), 'Quote reading belongs to a stale request revision', 409);
    requireThat(!request.imported && request.status === 'draft', 'Quote reading only changes the current native draft; submitted or approved requests are refused', 409);
    const attachment = get(s, 'attachment', prior?.attachment ?? b.attachment ?? b.source?.attachment);
    requireThat(attachment.kind === 'request' && attachment.record === request.id, 'Source attachment is outside this request', 403);
    const attachmentRevision = s.get('attachment:' + attachment.id)!.revision;
    if (prior) {
        requireThat(prior.version === b.version && prior.status === 'review', 'Quote review changed or was already confirmed', 409);
        requireThat(prior.attachmentRevision === attachmentRevision, 'Source attachment changed; extract again', 409);
    }
    const sourceDescriptor = await quoteSourceDescriptor(attachment, attachmentRevision);
    if (prior?.sourceDescriptor) requireThat(prior.sourceDescriptor.sha256 === sourceDescriptor.sha256, 'Source bytes changed; prepare a fresh reading', 409);
    if (op === 'quote-reading-instructions') return quoteReadingInstructions(request, sourceDescriptor);
    if (op === 'quote-reading-propose') { const reading = proposedQuoteReading(b, request, sourceDescriptor, a.id); put(s, 'quoteReading', reading.id, reading); event(s, a, reading, op, { snapshot: structuredClone(reading) }); return reading; }
    if (op === 'quote-extract') {
        const id = uid(), reading: Data = { id, request: request.id, revision: request.revision, attachment: attachment.id, attachmentRevision, sourceDescriptor, sourceName: attachment.name, version: 1, status: 'review', parser: 'deterministic labelled quote parser', actor: a.id, at: new Date().toISOString(), lines: [] };
        let source;
        try { source = await readQuoteSource(attachment); } catch (error) { reading.status = 'unsupported'; reading.reason = (error as Error).message; }
        if (source) { Object.assign(reading, parseQuoteFields(source, attachment.id)); reading.sourceText = source; reading.searchText = purchasingSearchText(source); const oversized = reading.lines.length > 100 || [...headers.map(key => reading[key]), ...reading.lines.flatMap((line: Data) => itemFields.map(key => line[key]))].some(field => typeof field.value === 'string' && field.value.length > 2000); if (oversized) { reading.status = 'unsupported'; reading.reason = 'Quote exceeds 100 items or 2,000 characters in a field; the whole extraction was refused without truncation.'; reading.lines = []; } if (!reading.lines.length && !oversized) { reading.status = 'unsupported'; reading.reason = 'No recognizable item lines. Supply a text quote with item/quantity/unit-price labels or a labelled table; no revision was changed.'; } }
        put(s, 'quoteReading', id, reading); event(s, a, reading, 'quote-extract', { snapshot: structuredClone(reading) }); return reading;
    }
    const reading = structuredClone(prior!);
    if (op === 'quote-reading-edit') {
        requireThat(Array.isArray(b.changes) && b.changes.length > 0 && b.changes.length <= 500, 'Provide 1–500 field corrections');
        const changes: Data[] = [];
        for (const change of b.changes) {
            const target = change.line ? reading.lines.find((l: Data) => l.id === change.line) : reading;
            requireThat(target && (change.line ? itemFields : headers).includes(change.field), 'Correction field is outside this quote');
            requireThat(change.value === null || typeof change.value === 'string' && change.value.length <= 2000, 'Correction must be text or missing');
            const value = change.value?.trim() || null, before: QuoteField = target[change.field];
            if (before.value === value) continue;
            target[change.field] = { value, confidence: value === null ? 0 : 1, source: { attachment: attachment.id, method: 'human correction', actor: a.id, at: new Date().toISOString(), original: before.source } };
            changes.push({ line: change.line ?? null, field: change.field, before: structuredClone(before), after: structuredClone(target[change.field]) });
        }
        requireThat(changes.length, 'No field correction supplied'); reading.version++;
        put(s, 'quoteReading', reading.id, reading); event(s, a, reading, op, { changes }); return reading;
    }
    requireThat(Array.isArray(reading.lines) && reading.lines.length > 0 && reading.lines.length <= 100, 'Confirm 1–100 extracted lines');
    const required = (value: QuoteField, label: string) => text(value?.value, label);
    requireThat(required(reading.currency, 'Quote currency') === request.currency, 'Quote currency must match the request; revise its currency separately');
    const freightAmount = required(reading.freightAmount, 'Freight: enter an explicit amount, including zero'), taxAmount = required(reading.taxAmount, 'Tax: enter an explicit amount, including zero');
    const leadTime = required(reading.leadTime, 'Lead time: correct the missing supplier term'), validity = required(reading.validity, 'Validity: correct the missing supplier term');
    requireThat(Array.isArray(b.lines) && b.lines.length === reading.lines.length && new Set(b.lines.map((l: Data) => l.id)).size === reading.lines.length, 'Map every extracted line once');
    const used = new Set<string>(), revised = structuredClone(request.lines), coding: Data[] = [];
    for (const line of reading.lines) {
        const mapping = b.lines.find((l: Data) => l.id === line.id); requireThat(mapping, 'Map every extracted line');
        let original: Data | undefined;
        if (mapping.requestLine) { original = request.lines.find((l: Data) => l.id === mapping.requestLine); requireThat(original && !used.has(original.id), 'Map to a unique line of this request'); used.add(original.id); }
        const next: Data = { ...(original ?? {}), description: required(line.description, 'Item description'), quantity: required(line.quantity, 'Item quantity'), unitAmount: required(line.unitAmount, 'Unit price'), unit: line.unit.value ?? original?.unit ?? text(mapping.unit, 'New line unit'), category: original?.category ?? text(mapping.category, 'New line category'), project: original?.project ?? text(mapping.project, 'New line project') };
        delete next.unitMinor; delete next.totalMinor; delete next.q;
        if (original) revised[revised.findIndex((l: Data) => l.id === original!.id)] = next; else revised.push(next);
        coding.push({ mapping: { quoteLine: line.id, requestLine: original?.id ?? null }, original });
    }
    // Use the existing request command for all purchasing validation and revision creation.
    for (const line of revised) line.lineTaxMinor = null;
    const input: Data = { ...request, id: request.id, revision: request.revision, lines: revised, freightAmount, taxAmount, reason: text(b.reason, 'Confirmation reason') };
    delete input.freightMinor; delete input.taxMinor;
    const updated = requests(s, a, 'amend', input)!;
    // Preserve coding extensions on unchanged/mapped source lines that the domain line normalizer does not yet know.
    updated.lines = updated.lines.map((line: Data) => ({ ...(request.lines.find((old: Data) => old.id === line.id) ?? {}), ...line }));
    const quoteTerms = { leadTime, validity, reading: reading.id, attachment: attachment.id, sourceRevision: request.revision };
    updated.quoteTerms = [...(request.quoteTerms ?? []), quoteTerms];
    put(s, 'request', updated.id, updated); put(s, 'revision', updated.id + ':' + updated.revision, { ...updated, request: updated.id });
    reading.version++; reading.status = 'confirmed'; reading.confirmedRevision = updated.revision; reading.confirmedBy = a.id; reading.confirmedAt = new Date().toISOString();
    put(s, 'quoteReading', reading.id, reading); event(s, a, reading, op, { confirmedRevision: updated.revision, reason: b.reason, mappings: coding.map(c => c.mapping), snapshot: structuredClone(reading) });
    return { ...reading, requestRevision: updated.revision };
}
