import fontData from '../assets/po-outfit.ttf?inline';
import { renderPoPdf } from './po-pdf';
import { poContent } from './po-content';
import { get, type Actor, type State } from './types';
import { recordScope } from './documents';
export async function poDocument(s: State, a: Actor, id: string) {
    const order = get(s, 'order', id); recordScope(s, a, 'order', order);
    const font = Uint8Array.from(atob(fontData.split(',')[1]), c => c.charCodeAt(0));
    const bytes = await renderPoPdf(poContent(s, order), font);
    return new Response(bytes as BodyInit, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${order.number.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf"` } });
}
