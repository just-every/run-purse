import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';

export type PoPdfContent = {
  title: string;
  subtitle?: string;
  logo?: { base64: string; mediaType: 'image/png' | 'image/jpeg' };
  sections: { heading: string; lines: string[] }[];
  attachments?: { name: string; base64: string }[];
};

const PAGE = { width: 612, height: 792, margin: 48 };
const WIDTH = PAGE.width - PAGE.margin * 2;
const HEIGHT = PAGE.height - PAGE.margin * 2;
const ink = rgb(0.12, 0.16, 0.21);
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// The supplied font is authoritative: unsupported text must fail visibly rather
// than becoming a missing-glyph box or being replaced with ASCII.
function textWrapper(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (text: string, size: number, width: number): string[] => {
    const normalized = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    for (const character of normalized) {
      if (character !== '\n' && !supported.has(character.codePointAt(0)!)) {
        throw new Error(`PO font cannot render U+${character.codePointAt(0)!.toString(16).toUpperCase()}. Supply an approved font containing this character.`);
      }
    }
    const result: string[] = [];
    const fits = (value: string) => font.widthOfTextAtSize(value, size) <= width;
    for (const paragraph of normalized.split('\n')) {
      let line = '';
      for (const token of paragraph.match(/\s+|\S+/gu) ?? []) {
        if (fits(line + token)) {
          line += token;
          continue;
        }
        if (line.trim()) {
          result.push(line.trimEnd());
          line = '';
        }
        const word = token.trimStart();
        if (fits(word)) {
          line = word;
          continue;
        }
        for (const { segment } of graphemes.segment(word)) {
          if (!fits(segment)) throw new Error('PO text contains a glyph wider than the page');
          if (!fits(line + segment)) {
            result.push(line);
            line = '';
          }
          line += segment;
        }
      }
      result.push(line.trimEnd());
    }
    return result;
  };
}

/** Render a view model only; callers own access control and content selection. */
export async function renderPoPdf(content: PoPdfContent, fontBytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const wrap = textWrapper(font);
  pdf.setTitle(content.title);
  pdf.setCreator('Purse');
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  const ensure = (height: number) => {
    if (y - height < PAGE.margin) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };
  const draw = (line: string, size: number, leading: number) => {
    ensure(leading);
    if (line) page.drawText(line, {
      x: PAGE.margin, y: y - font.heightAtSize(size, { descender: false }),
      size, font, color: ink,
    });
    y -= leading;
  };

  const firstPage = page;
  let logoHeight = 0;
  let headerWidth = WIDTH;
  if (content.logo) {
    const logo = content.logo.mediaType === 'image/png'
      ? await pdf.embedPng(content.logo.base64)
      : await pdf.embedJpg(content.logo.base64);
    const scale = Math.min(110 / logo.width, 64 / logo.height);
    const width = logo.width * scale;
    logoHeight = logo.height * scale;
    headerWidth -= 130;
    page.drawImage(logo, {
      x: PAGE.width - PAGE.margin - width,
      y: y - logoHeight, width, height: logoHeight,
    });
  }
  for (const line of wrap(content.title, 23, headerWidth)) draw(line, 23, 30);
  if (content.subtitle) {
    y -= 5;
    for (const line of wrap(content.subtitle, 11, headerWidth)) draw(line, 11, 16);
  }
  if (page === firstPage) y = Math.min(y, PAGE.height - PAGE.margin - logoHeight);
  y -= 24;

  for (const section of content.sections) {
    const heading = wrap(section.heading, 14, WIDTH);
    const body = section.lines.flatMap(line => wrap(line, 11, WIDTH));
    // Keep short sections, particularly totals, together. Oversized sections
    // still paginate with their heading attached to the first body line.
    ensure(Math.min(HEIGHT, heading.length * 20 + 7 + body.length * 16));
    heading.forEach((line, index) => {
      ensure(20 + (index === heading.length - 1 && body.length ? 23 : 0));
      draw(line, 14, 20);
    });
    y -= 7;
    for (const line of body) draw(line, 11, 16);
    y -= 18;
  }

  for (const attachment of content.attachments ?? []) {
    // Copying pages leaves the source bytes untouched; embedding also preserves
    // the original file, including signatures and document-level metadata.
    const source = await PDFDocument.load(attachment.base64);
    for (const copied of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(copied);
    await pdf.attach(attachment.base64, attachment.name, { mimeType: 'application/pdf' });
  }
  return pdf.save();
}
