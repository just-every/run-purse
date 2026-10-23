import type { Bindings } from '../auth.server';
import { parseQuoteFields } from './quote-reading-fields';
import { readQuoteSource } from './quote-reading-source';
import { purchasingSearchText } from './search-text';
import { requireThat, type Data } from './types';

/** Whitelisted purchasing facts only; never project a supplier or protected-field mask. */
export const quoteAgentText = (value: unknown) => typeof value === 'string'
    ? purchasingSearchText(value.split(/\r?\n/).map(text => ({ text }))) : null;
export const quoteAgentLine = (line: Data): Data => ({ id: line.id, sourceLine: line.sourceLine,
    description: quoteAgentText(line.description), quantity: line.quantity, q: line.q, unit: quoteAgentText(line.unit),
    partNumber: quoteAgentText(line.partNumber), unitMinor: line.unitMinor, totalMinor: line.totalMinor });
export function quoteAgentResponse(response: Data): Data {
    return { id: response.id, rfq: response.rfq, supplier: response.supplier, sequence: response.sequence,
        offerSequence: response.offerSequence, currency: response.currency, at: response.at,
        lines: response.lines.map(quoteAgentLine), freightMinor: response.freightMinor, taxMinor: response.taxMinor,
        totalMinor: response.totalMinor, leadTime: quoteAgentText(response.leadTime), validity: quoteAgentText(response.validity),
        conditions: quoteAgentText(response.conditions), answers: (response.answers ?? []).map(quoteAgentText),
        files: (response.files ?? []).map((file: Data) => ({ id: file.id, name: quoteAgentText(file.name),
            mediaType: file.mediaType, sha256: file.sha256, size: file.size,
            url: `/api/purse/rfq-original/${response.id}/${file.id}` })) };
}
export async function readAgentOriginal(env: Bindings | undefined, response: Data, file: Data): Promise<Data> {
    const source = { response: response.id, file: file.id, name: quoteAgentText(file.name), mediaType: file.mediaType,
        sha256: file.sha256, size: file.size, url: `/api/purse/rfq-original/${response.id}/${file.id}` };
    if (file.erasure) return { source, status: 'unavailable', reason: 'Original removed by erasure; retained supplier response remains evidence.' };
    let bytes: Uint8Array;
    if (file.key) {
        requireThat(env?.ORIGINALS, 'Original storage unavailable', 503);
        const original = await env.ORIGINALS.get(file.key);
        requireThat(original, 'Exact supplier original unavailable', 503);
        bytes = new Uint8Array(await original.arrayBuffer());
    } else bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(n => n.toString(16).padStart(2, '0')).join('');
    requireThat(bytes.length === file.size && digest === file.sha256, 'Supplier original integrity check failed', 409);
    // Original bytes stay in custody. Protected-labelled lines and identifiers do not enter agent context.
    try {
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        const rows = (await readQuoteSource({ id: file.id, name: file.name, mediaType: file.mediaType, base64: btoa(binary) }))
            .map(row => ({ ...row, text: quoteAgentText(row.text) ?? '' })).filter(row => row.text.trim());
        const fields = parseQuoteFields(rows, file.id);
        requireThat(fields.lines.length <= 100 && [...['currency', 'freightAmount', 'taxAmount', 'leadTime', 'validity'].map(key => fields[key]), ...fields.lines.flatMap((line: Data) => ['description', 'quantity', 'unitAmount', 'unit'].map(key => line[key]))].every(field => field.value === null || field.value.length <= 2000), 'Native quote reading exceeds its limits');
        const terms = rows.filter(row => /^(?:terms|conditions)\s*[:=]/i.test(row.text));
        return { source, status: 'read', readingInput: rows, parser: 'native labelled quote reader v1', fields,
            terms: terms.map(row => ({ value: row.text.replace(/^(?:terms|conditions)\s*[:=]\s*/i, ''),
                source: { attachment: file.id, page: row.page, line: row.line, excerpt: row.text } })) };
    } catch {
        // No invented reading, alternate parser or model claim. Unsupported bytes remain retained and flagged.
        return { source, status: 'unsupported', reason: 'Original has no supported native text reading; buyer review of the original is required.' };
    }
}
