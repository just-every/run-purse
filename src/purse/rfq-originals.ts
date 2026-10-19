import type { Bindings } from '../auth.server';
import { Fault, requireThat, text, uid, type Data } from './types';

export const RFQ_FILE_BYTES = 10_000_000;
export const RFQ_BODY_BYTES = 40_500_000; // Three base64-encoded originals plus bounded quotation fields.
export const rfqOriginalKey = (response: string, file: string) => `rfq/${response}/${file}`;

/** Keep bytes outside D1; only immutable metadata enters the purchasing record. */
export async function retainRfqOriginals(env: Bindings, response: string, input: unknown) {
    requireThat(Array.isArray(input) && input.length <= 3, 'Provide up to three original files');
    const files: Data[] = [];
    try {
        for (const file of input) {
            requireThat(file && typeof file === 'object', 'Invalid original file');
            const name = text(file.name, 'Original filename', 200), mediaType = text(file.mediaType, 'Original media type', 150);
            let bytes: Uint8Array<ArrayBuffer>;
            if (file.upload instanceof File) {
                requireThat(file.upload.size > 0 && file.upload.size <= RFQ_FILE_BYTES, 'Each original file must be at most 10 MB');
                bytes = new Uint8Array(await file.upload.arrayBuffer());
            } else {
                requireThat(typeof file.base64 === 'string' && file.base64.length <= 4 * Math.ceil(RFQ_FILE_BYTES / 3), 'Each original file must be at most 10 MB');
                let binary: string; try { binary = atob(file.base64); } catch { throw new Fault(400, 'Invalid file bytes'); }
                requireThat(binary.length > 0 && binary.length <= RFQ_FILE_BYTES, 'Each original file must be at most 10 MB');
                bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
            }
            const id = uid(), key = rfqOriginalKey(response, id);
            const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
            await env.ORIGINALS.put(key, bytes, { customMetadata: { sha256 }, httpMetadata: { contentType: 'application/octet-stream' } });
            files.push({ id, key, name, mediaType, size: bytes.length, sha256 });
        }
        return files;
    } catch (error) {
        await env.ORIGINALS.delete(files.map(file => file.key));
        throw error;
    }
}

export async function rfqOriginalBytes(env: Bindings, file: Data) {
    // Pre-R2 response history retains its original inline custody representation.
    if (!file.key) return Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
    const object = await env.ORIGINALS.get(file.key);
    requireThat(object && object.size === file.size, 'Original file unavailable', 503);
    return object.body;
}
