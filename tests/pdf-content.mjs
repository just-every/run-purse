import {PDFDocument,PDFName,PDFArray,decodePDFRawStream} from 'pdf-lib';
const decoded=stream=>Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
// Read emitted PDF text through its font character maps, independent of the
// document view model. This also checks real page/font resources and streams.
export async function pdfContent(bytes){
 const pdf=await PDFDocument.load(bytes),pages=[],imageColors=[];let images=0;
 for(const page of pdf.getPages()){
  const resources=page.node.Resources(),fonts=resources.lookup(PDFName.of('Font')),maps=new Map();
  for(const [name,ref]of fonts?.entries()||[]){const font=pdf.context.lookup(ref),unicode=font.lookup(PDFName.of('ToUnicode'));const map=new Map();if(unicode){for(const m of decoded(unicode).matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)){const hex=m[2];map.set(m[1].toUpperCase(),String.fromCharCode(...hex.match(/.{4}/g).map(x=>parseInt(x,16))));}}maps.set(name.toString().slice(1),map);}
  const xobjects=resources.lookup(PDFName.of('XObject'));for(const[,ref]of xobjects?.entries()||[])if(pdf.context.lookup(ref).dict.get(PDFName.of('Subtype'))?.toString()==='/Image'){images++;imageColors.push(Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString('hex'));}
  const contents=page.node.Contents(),streams=contents instanceof PDFArray?contents.asArray().map(ref=>pdf.context.lookup(ref)):[contents];let text='',current;
  for(const stream of streams.filter(Boolean))for(const m of decoded(stream).matchAll(/\/(\S+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj/g)){
   if(m[1])current=maps.get(m[1]);else{const hex=m[2].toUpperCase();text+=(current?.size?hex.match(/.{4}/g).map(x=>current.get(x)||'').join(''):Buffer.from(hex,'hex').toString('latin1'))+'\n';}
  }
  pages.push(text);
 }
 return {pdf,pages,text:pages.join('\n'),images,imageColors};
}
