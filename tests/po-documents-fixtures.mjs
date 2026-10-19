import {PDFDocument,StandardFonts} from 'pdf-lib'
export async function termsPdf(text){const p=await PDFDocument.create(),f=await p.embedFont(StandardFonts.Helvetica);p.addPage([612,792]).drawText(text,{x:48,y:700,font:f,size:14});return Buffer.from(await p.save()).toString('base64')}
