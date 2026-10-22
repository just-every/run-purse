import fontData from '../assets/po-outfit.ttf?inline';
import { poContent } from './po-content';
import { renderPoPdf } from './po-pdf';
import { type Data, type State } from './types';

export const orderBytes = (base64: string) => Uint8Array.from(atob(base64), char => char.charCodeAt(0));
export function orderBase64(bytes: Uint8Array) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
}
export const orderDigest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(byte => byte.toString(16).padStart(2, '0')).join('');
/** A single frozen supplier face. Later promises, directory/profile edits and
 * receiving status cannot change a sent PDF or its attached original bytes. */
export async function freezeOrderSend(state: State, order: Data) {
    const content = poContent(state, order), font = orderBytes(fontData.split(',')[1]);
    const bytes = await renderPoPdf(content, font);
    return { content, pdf: { name: order.number + '-revision-' + order.revision + '.pdf', base64: orderBase64(bytes), sha256: await orderDigest(bytes), size: bytes.length } };
}
