import { coasterSource, coasterTravelReport } from './travel-coaster';
import { parseTravelCsv } from './travel-export-format.mjs';
import { requireThat, text, type Data } from './types';

export async function travelExpenseImport(input: Data, approvalReference: string, travelerEmail: string): Promise<{ report: Data; source: Data; bytes: Uint8Array; sha256: string; reportFingerprint: string; name: string; mediaType: string }> {
    const provider = input.provider ?? 'coaster';
    let bytes: Uint8Array;
    if (input.originalBase64 !== undefined) {
        requireThat(typeof input.originalBase64 === 'string' && input.originalBase64.length <= 1333336 && input.originalBase64.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(input.originalBase64), 'Upload a valid original of up to 1 MB');
        let raw: string;
        try { raw = atob(input.originalBase64); } catch { requireThat(false, 'Upload a valid base64 original'); }
        requireThat(btoa(raw!) === input.originalBase64, 'Upload a canonical base64 original');
        bytes = Uint8Array.from(raw!, character => character.charCodeAt(0));
    } else {
        requireThat(typeof input.original === 'string', 'Upload the exact report original'); bytes = new TextEncoder().encode(input.original);
    }
    requireThat(bytes.length > 0 && bytes.length <= 1000000, 'Upload a report original of up to 1 MB');
    let original: string;
    try { original = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { requireThat(false, 'Upload a UTF-8 report original'); }
    const sha256 = await hash(bytes);
    if (provider === 'coaster') {
        const report = coasterTravelReport(original!, approvalReference, travelerEmail), source = coasterSource(input.sourceUrl, report.id);
        return { report, source: { ...source, provider, sourceBasis: 'Manually imported native Coaster report; original retained for review' }, bytes, sha256, reportFingerprint: sha256, name: `coaster-report-${report.id}.json`, mediaType: 'application/json' };
    }
    let report: Data;
    try { report = parseTravelCsv(original!, provider, input.sourceReview, input.columns, approvalReference, travelerEmail); }
    catch (error) { requireThat(false, (error as Error).message, 409); }
    const source = { provider, sourceOrigin: provider + ':' + report!.sourceReview.sourceAccount, sourceAccount: report!.sourceReview.sourceAccount,
        sourceBasis: 'Manually uploaded provider CSV with explicitly reviewed report metadata and independent final approval; provider identity is not independently verified' };
    const reportFingerprint = await hash(new TextEncoder().encode(JSON.stringify({ sha256, provider, report: report! })));
    return { report: report!, source, bytes, sha256, reportFingerprint, name: text(input.sourceName, 'Original export filename', 200), mediaType: 'text/csv' };
}
async function hash(bytes: Uint8Array) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
