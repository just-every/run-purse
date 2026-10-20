import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';
import { invoiceText } from './invoice-reading-fixtures.mjs';

export const pdfPhrase='Obsidian satellite harmonization evidence';
export const bankNumber='736290184652';
export async function searchPurchasing(h) {
 const cmd=h.command;await cmd('business',{name:'Canyon Field Services',currencies:['USD','AUD'],locations:['Denver'],costCentres:['Operations','Marketing'],projects:['Safety','Fitout']});
 const requester=await h.member('requester@example.test',['requester']),other=await h.member('other@example.test',['requester']),approver=await h.member('approver@example.test',['approver']),buyer=await h.member('buyer@example.test',['buyer']),receiver=await h.member('receiver@example.test',['receiver']);
 const supplier=await cmd('supplier',{name:'Canyon Field Supply',dba:'Smith, Jones & Co.',status:'preferred',reason:'Known field supplier',contacts:[{name:'Jordan',email:'invoices@canyon.example.test'}],matching:{bankRouting:'021000021',bankAccount:bankNumber}},buyer);
 await cmd('policy',{name:'Field authority',currency:'USD',category:'*',project:'*',approver:'approver@example.test',limitMinor:2000000,budgetMinor:4000000});
 const input={title:'Antenna equipment request',supplier:supplier.id,currency:'USD',needDate:'2026-11-30',location:'Denver',costCentre:'Operations',terms:'Net 30',poDetails:{notes:'Calibration work at the northern depot'},lines:[{description:'Precision field inspection kit',quantity:'1',unitAmount:'1234.56',category:'Equipment',project:'Safety'}]};
 const request=await cmd('request',input,requester),outside=await cmd('request',{...input,title:'Marketing private camera purchase',costCentre:'Marketing'},other);
 await cmd('submit',{id:request.id,revision:1},requester);await cmd('decision',{id:request.id,revision:1,decision:'approved',reason:'Field allowance confirmed'},approver);const order=await cmd('convert',{id:request.id,revision:1},buyer);await cmd('issue',{id:order.id,revision:1,reason:'Authorized supplier PO issued'},buyer);
 const received=await cmd('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'1',reason:'Calibrated kit received'});
 const invoice=await cmd('invoice',{order:order.id,reference:'VENDOR-2026-0889',source:'Supplier invoice received',invoiceDate:'2026-10-19',allocations:[{line:order.lines[0].id,quantity:'1',amountMinor:123456}]},buyer);
 const pdf=await PDFDocument.create(),page=pdf.addPage([650,790]),font=await pdf.embedFont(StandardFonts.Helvetica);const body=invoiceText({po:order.number,reference:'SOURCE-2026-0889'})+'\n'+pdfPhrase+'\nBank account: '+bankNumber;body.split('\n').forEach((line,index)=>page.drawText(line,{x:20,y:760-index*22,size:10,font}));
 const source=await cmd('invoice-source',{order:order.id,document:{name:'source-invoice.pdf',mediaType:'application/pdf',base64:Buffer.from(await pdf.save()).toString('base64')}},buyer),reading=await cmd('invoice-extract',{source:source.id},buyer);assert.equal(reading.status,'review',reading.reason);
 const catalogue=await cmd('catalogue',{description:'Restricted field instrument',supplier:supplier.id,currency:'USD',unitAmount:'50.00',category:'Equipment',approved:true,access:{departments:['Field']}},buyer);
 const csv=await readFile(new URL('../public/fixtures/procurify-shape.csv',import.meta.url),'utf8'),mapping={columns:{},decimal:'.',date:'YYYY-MM-DD',statuses:{active:'active',approved:'historical-approved',issued:'historical-issued',received:'historical-received'}};
 const preview=await h.send('/api/purse/import/preview',{csv,filename:'historical.csv',mapping},h.owner);assert.equal(preview.status,200,JSON.stringify(preview.value));const imported=await h.send('/api/purse/import/commit',{csv,filename:'historical.csv',mapping,fingerprint:preview.value.plan.fingerprint},h.owner);assert.equal(imported.status,200,JSON.stringify(imported.value));
 return {requester,other,approver,buyer,receiver,supplier,request,outside,order,invoice,reading,source,received,catalogue};
}

/** Scale fixture in the actual D1 database: projection triggers run for every real row. No application responses or storage are faked. */
export async function addSearchScale(h,count=100000) {
 const current=await h.db.prepare('SELECT COUNT(*) n FROM p_records').first(),amount=Math.max(0,count-current.n);
 const statement=h.db.prepare("INSERT INTO p_records(business,kind,id,revision,value) VALUES('main','supplier',?,?,?)");
 for(let start=0;start<amount;start+=500){const batch=[];for(let i=start;i<Math.min(start+500,amount);i++){const id='scale-'+String(i).padStart(6,'0');batch.push(statement.bind(id,id,JSON.stringify({id,name:'Scale supplier '+i,dba:'',contacts:[],status:'pending_review',reason:'Synthetic scale fixture',contractRef:'',renewal:'',documents:[]})));}await h.db.batch(batch);}
 assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM p_records').first()).n,count);
}
export async function prepareSearchArchive(path,{scale=true}={}) {
 const h=await harness();try{const fixture=await searchPurchasing(h);for(const role of ['requester','approver','buyer','receiver'])await h.command('member',{email:role+'@dev.localhost',name:'Dev '+role,roles:[role],active:true});if(scale)await addSearchScale(h);const service=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability});await exportArchive(service,path,[]);return fixture;}finally{await h.close();}
}
