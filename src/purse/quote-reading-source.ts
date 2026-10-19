import { getDocumentProxy } from 'unpdf';
import { requireThat, type Data } from './types';
export type SourceLine = { text: string; page: number; line: number };
const decode = (bytes: Uint8Array, charset = 'utf-8') => {
    try { return new TextDecoder(charset, { fatal: true }).decode(bytes); }
    catch { throw new Error(`Email/text charset ${charset} is unsupported or its bytes are invalid; supply a readable UTF-8 quote`); }
};
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', dollar: '$', pound: '£', euro: '€', yen: '¥', ndash: '–', mdash: '—', copy: '©', reg: '®', times: '×' };
function htmlText(html: string): string {
    // Treat HTML solely as inert source text; never parse into a live DOM or evaluate it.
    return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<(?:script|style|head)\b[^>]*>[\s\S]*$/gi, '')
        .replace(/<(?:br|hr)\b[^>]*\/?\s*>/gi, '\n').replace(/<\/(?:td|th)\s*>\s*<(?:td|th)\b[^>]*>/gi, ' | ')
        .replace(/<\/?(?:p|div|tr|table|h[1-6]|li|ul|ol|section|article|blockquote)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '')
        .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (original, name: string) => {
            if (name[0] !== '#') return entities[name.toLowerCase()] ?? original;
            const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
            return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : original;
        }).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
type EmailText = { plain: string; html: string };
function emailParts(raw: string, depth = 0): EmailText {
    requireThat(depth < 12, 'Email MIME nesting exceeds 12 levels');
    const split = raw.search(/\r?\n\r?\n/); requireThat(split >= 0, 'Email has no MIME header/body separator');
    const headers = raw.slice(0, split).replace(/\r?\n[ \t]+/g, ' '), body = raw.slice(split).replace(/^\r?\n\r?\n/, '');
    const type = headers.match(/^Content-Type:\s*([^\r\n]+)/im)?.[1] ?? 'text/plain';
    if (/^Content-Disposition:\s*attachment/im.test(headers)) return { plain: '', html: '' };
    if (/^multipart\//i.test(type)) {
        const boundary = type.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i); requireThat(boundary, 'Email multipart boundary is missing');
        const parts = body.split('--' + (boundary[1] ?? boundary[2])).slice(1).filter(part => !part.startsWith('--')).map(part => emailParts(part.replace(/^\r?\n/, ''), depth + 1));
        return { plain: parts.map(p => p.plain).filter(Boolean).join('\n'), html: parts.map(p => p.html).filter(Boolean).join('\n') };
    }
    if (!/^text\/(?:plain|html)(?:\s*;|\s*$)/i.test(type)) return { plain: '', html: '' };
    const transfer = headers.match(/^Content-Transfer-Encoding:\s*([^\r\n]+)/im)?.[1].trim().toLowerCase();
    let bytes: Uint8Array;
    if (transfer === 'base64') { try { bytes = Uint8Array.from(atob(body.replace(/\s/g, '')), c => c.charCodeAt(0)); } catch { throw new Error('Invalid base64 email body'); } }
    else if (transfer === 'quoted-printable') { const unfolded = body.replace(/=\r?\n/g, ''); const values: number[] = []; for (let i = 0; i < unfolded.length; i++) { if (unfolded[i] === '=' && /^[\da-f]{2}$/i.test(unfolded.slice(i + 1, i + 3))) { values.push(parseInt(unfolded.slice(i + 1, i + 3), 16)); i += 2; } else values.push(unfolded.charCodeAt(i)); } bytes = new Uint8Array(values); }
    else { requireThat(!transfer || ['7bit', '8bit', 'binary'].includes(transfer), 'Unsupported email content-transfer encoding'); bytes = Uint8Array.from(body, c => c.charCodeAt(0)); }
    const value = decode(bytes, type.match(/charset\s*=\s*"?([^";\s]+)/i)?.[1]);
    return /^text\/html/i.test(type) ? { plain: '', html: htmlText(value) } : { plain: value.trim(), html: '' };
}
function emailBody(raw: string): string { const parts = emailParts(raw); return parts.plain || parts.html; }
export async function readQuoteSource(attachment: Data): Promise<SourceLine[]> {
    const bytes = Uint8Array.from(atob(attachment.base64), c => c.charCodeAt(0));
    const type = attachment.mediaType.toLowerCase().split(';')[0];
    const out: SourceLine[] = [];
    if (type === 'application/pdf' || /\.pdf$/i.test(attachment.name)) {
        requireThat(decode(bytes.slice(0, 5)) === '%PDF-', 'The attachment is not a PDF');
        const options = { isEvalSupported: false, useSystemFonts: false, disableFontFace: true };
        const pdf = await getDocumentProxy(bytes, options);
        try {
            requireThat(pdf.numPages <= 50, 'Quote PDFs accept at most 50 pages');
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                const page = await pdf.getPage(pageNumber), content = await page.getTextContent();
                const rows: { y: number; cells: { x: number; end: number; text: string }[] }[] = [];
                for (const item of content.items) { if (!('str' in item) || !item.str.trim()) continue; const y = item.transform[5], x = item.transform[4]; let row = rows.find(r => Math.abs(r.y - y) < 3); if (!row) { row = { y, cells: [] }; rows.push(row); } row.cells.push({ x, end: x + item.width, text: item.str }); }
                rows.sort((a, b) => b.y - a.y).forEach((r, i) => { r.cells.sort((a, b) => a.x - b.x); let value = ''; r.cells.forEach((cell, index) => { value += (index ? (cell.x - r.cells[index - 1].end > 7 ? '  ' : ' ') : '') + cell.text; }); out.push({ text: value.trim(), page: pageNumber, line: i + 1 }); });
                requireThat(out.reduce((n, l) => n + l.text.length, 0) <= 500000, 'Quote text exceeds 500,000 characters');
            }
        } finally { await pdf.cleanup(); }
    } else {
        requireThat(['text/plain', 'message/rfc822'].includes(type) || /\.(txt|eml)$/i.test(attachment.name), 'Use a text PDF, plain text or an .eml email');
        const raw = type === 'message/rfc822' || /\.eml$/i.test(attachment.name) ? emailBody(Array.from(bytes, c => String.fromCharCode(c)).join('')) : decode(bytes, attachment.mediaType.match(/charset\s*=\s*"?([^";\s]+)/i)?.[1]);
        requireThat(raw.length <= 500000, 'Quote text exceeds 500,000 characters');
        raw.split(/\r?\n/).forEach((value, i) => { if (value.trim()) out.push({ text: value.trim(), page: 1, line: i + 1 }); });
    }
    requireThat(out.some(l => /[\p{L}\p{N}]/u.test(l.text)), 'No readable text: scanned/image-only quotes need OCR or a text quote before extraction');
    return out;
}
