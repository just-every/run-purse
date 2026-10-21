import test from 'node:test'
import assert from 'node:assert/strict'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import {harness} from './purse-harness.mjs'
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs'

test('CONTRACT-001 REPORT-003 confirmed agreement prices realize exact approved invoice savings, source history and amendment caps through public doors',async t=>{
 const h=await harness();t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'Canyon Services',currencies:['USD','CAD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']});
 const requester=await h.member('requester@example.test',['requester']),buyer=await h.member('buyer@example.test',['buyer']),approver=await h.member('approver@example.test',['approver']);
 const supplier=await cmd('supplier',{name:'Canyon Agreement Equipment',status:'preferred',reason:'Recorded supplier'});
 for(const currency of ['USD','CAD'])await cmd('policy',{name:currency+' authority',currency,category:'*',project:'*',approver:'approver@example.test',limitMinor:3000000,budgetMinor:9000000});
 const item={description:'Safety set',quantity:'10',unit:'each',partNumber:'SET-1',unitMinor:90000,category:'Equipment',project:'Safety'};
 const draft={title:'Agreement safety sets',supplier:supplier.id,currency:'USD',needDate:'2026-11-30',location:'Denver',costCentre:'Operations',terms:'Net 30',freightMinor:0,taxMinor:0,lines:[item]};
 const base={version:0,confirmed:true,name:'Safety equipment',reference:'AGR-SAVINGS',supplier:supplier.id,currency:'USD',parties:'Canyon Services and Canyon Equipment',startDate:'2026-01-01',endDate:'2027-01-30',autoRenew:true,noticeDays:60,paymentTerms:'Net 30',reminderDays:[30,7],remindersEnabled:true,reason:'Owner checked original agreement',clm:null,signature:null,valueMinor:900000,firstOfferMinor:1000000,firstOfferSource:'Original first supplier offer: ten SET-1 at USD 1,000 each',awardSource:'Signed agreement price schedule: ten SET-1 at USD 900 each',priceLines:[{...item,firstUnitMinor:100000,awardedUnitMinor:90000}]};
 await cmd('agreement',{...base,firstOfferSource:''},h.owner,400);
 let agreement=await cmd('agreement',base);
 const pdf=await PDFDocument.create(),page=pdf.addPage(),font=await pdf.embedFont(StandardFonts.Helvetica);
 const labels=['Parties: '+base.parties,'Currency: USD','Agreement value: USD 9,000.00','First offer: USD 10,000.00','Start date: 2026-01-01','End date: 2027-01-30','Auto renewal: yes','Notice days: 60','Payment terms: Net 30'];
 labels.forEach((line,i)=>page.drawText(line,{x:40,y:750-i*30,size:12,font}));const bytes=Buffer.from(await pdf.save());
 const attachment=await cmd('attachment',{kind:'agreement',record:agreement.id,name:'signed-safety-agreement.pdf',mediaType:'application/pdf',base64:bytes.toString('base64')});
 const reading=await cmd('agreement-extract',{agreement:agreement.id,version:1,attachment:attachment.id});assert.equal(reading.status,'review');
 agreement=await cmd('agreement',{...base,id:agreement.id,version:1,reading:{id:reading.id,version:reading.version}});
 const request=await cmd('request',draft,requester),input={agreement:agreement.id,agreementVersion:2,request:request.id,revision:1,reason:'Buyer selected confirmed contract prices',lines:[{requestLine:request.lines[0].id,agreementLine:0,firstUnitMinor:100000,awardedUnitMinor:90000}]};
 await cmd('agreement-award',input,'',401);for(const cookie of [requester,approver])await cmd('agreement-award',input,cookie,403);
 await cmd('agreement-award',{...input,agreementVersion:99},buyer,409);
 for(const change of [{firstUnitMinor:100001},{awardedUnitMinor:89999},{agreementLine:1},{requestLine:'another-request'}])await cmd('agreement-award',{...input,lines:[{...input.lines[0],...change}]},buyer,400);
 const other=await cmd('supplier',{name:'Unrelated contractor',status:'active',reason:'Separate supplier'});
 const unrelated=await cmd('request',{...draft,supplier:other.id},requester);await cmd('agreement-award',{...input,request:unrelated.id,lines:[{...input.lines[0],requestLine:unrelated.lines[0].id}]},buyer,400);
 const award=await cmd('agreement-award',input,buyer);await cmd('agreement-award',input,buyer,409);
 const report=async()=>{const r=await h.send('/api/purse/performance-report',undefined,buyer);assert.equal(r.status,200,JSON.stringify(r.value));return r.value.savings};
 assert.equal((await report()).totals.length,0,'An owner-confirmed contract and buyer award still require request approval');
 const first=await cmd('quote',{...draft,request:request.id,source:'First quote source',lines:[{...item,unitMinor:100000}]},requester),winner=await cmd('quote',{...draft,request:request.id,source:'Winning quote source'},requester);
 await cmd('quote-award',{request:request.id,revision:1,firstQuote:first.id,awardedQuote:winner.id,reason:'Duplicate savings attempt',lines:[{requestLine:request.lines[0].id,firstLine:first.lines[0].id,awardedLine:winner.lines[0].id}]},buyer,409);
 async function approve(r){await cmd('submit',{id:r.id,revision:r.revision},requester);await cmd('decision',{id:r.id,revision:r.revision,decision:'approved',reason:'Reviewed price and authority'},approver)}
 async function issue(r){const o=await cmd('convert',{id:r.id,revision:r.revision},buyer);await cmd('issue',{id:o.id,revision:r.revision,reason:'Issued approved revision'},buyer);return o}
 await approve(request);let savings=await report();assert.deepEqual(savings.totals,[{currency:'USD',negotiatedMinor:100000,realizedMinor:0}]);
 const row=savings.rows[0];assert.equal(row.award,award.id);assert.equal(row.agreement,agreement.id);assert.equal(row.agreementVersion,2);assert.deepEqual(row.reading,agreement.reading);assert.equal(row.firstOfferSource,base.firstOfferSource);assert.equal(row.awardSource,base.awardSource);assert.equal(row.agreementLine,0);
 agreement=await cmd('agreement',{...base,id:agreement.id,version:2,name:'Renamed contract',firstOfferSource:'Later confirmation source',awardSource:'Later price source',reason:'Later owner correction'});
 assert.equal((await report()).rows[0].firstOfferSource,base.firstOfferSource,'Later agreement corrections never rewrite the exact awarded source');
 const original=await h.send('/api/purse/download/attachment/'+row.reading.attachment,undefined,buyer);assert.equal(original.status,200);assert.equal(Buffer.from(await (await h.mf.dispatchFetch(h.origin+'/api/purse/download/attachment/'+attachment.id,{headers:{cookie:buyer}})).arrayBuffer()).equals(bytes),true);
 assert.equal((await h.send('/api/purse/download/attachment/'+attachment.id,undefined,requester)).status,403);
 const order=await issue(request);await cmd('receipt',{order:order.id,line:order.lines[0].id,event:'receive',quantity:'6',reason:'Six accepted'});
 const invoice=await cmd('invoice',{order:order.id,reference:'AGREEMENT-SIX',source:'Original six-set invoice',allocations:[{line:order.lines[0].id,quantity:'6',amountMinor:540000}],remit:{bankRouting:'123456789',bankAccount:'1234567890'}},buyer);
 assert.equal((await report()).totals[0].realizedMinor,0);
 await cmd('payable-terms',{invoice:invoice.id,version:0,invoiceDate:'2026-10-19',term:'Net 30',reason:'Original invoice terms'},buyer);
 await cmd('approve-payable',{invoice:invoice.id,version:1,reason:'Still held'},buyer,409);
 for(const flag of invoice.flags)await cmd('invoice-risk-review',{invoice:invoice.id,version:1,flag:flag.id,reason:'Buyer checked original remit evidence'},buyer);
 await cmd('approve-payable',{invoice:invoice.id,version:1,reason:'Cash planning checked'},buyer);
 savings=await report();assert.equal(savings.totals[0].realizedMinor,60000,'Sixty percent of USD 1,000 is USD 600');assert.equal(savings.realizedRows[0].invoice,invoice.id);assert.equal(savings.realizedRows[0].agreementVersion,2);assert.deepEqual(savings.realizedRows[0].reading,row.reading);
 await cmd('receipt',{order:order.id,line:order.lines[0].id,event:'return',quantity:'1',reason:'One returned'});assert.equal((await report()).totals[0].realizedMinor,50000);
 // An approved quote award replaces the contract figure; invoice history retains its original source.
 const amended=await cmd('amend',{...draft,id:request.id,revision:1,lines:[{...item,id:request.lines[0].id,unitMinor:95000}],reason:'Revised supplier offer'},buyer);
 const q1=await cmd('quote',{...draft,request:request.id,source:'New first offer',lines:[{...item,unitMinor:110000}]},requester),q2=await cmd('quote',{...draft,request:request.id,source:'New awarded offer',lines:[{...item,unitMinor:95000}]},requester);
 const quoteInput={request:request.id,revision:2,firstQuote:q1.id,awardedQuote:q2.id,reason:'New quote replaces agreement award',lines:[{requestLine:amended.lines[0].id,firstLine:q1.lines[0].id,awardedLine:q2.lines[0].id}]};
 await cmd('quote-award',quoteInput,buyer);await cmd('agreement-award',{...input,revision:2,agreementVersion:3},buyer,409);
 assert.equal((await report()).totals[0].negotiatedMinor,100000,'Unapproved amendment does not replace approved award');
 await approve(amended);savings=await report();assert.equal(savings.rows.length,1);assert.equal(savings.totals[0].negotiatedMinor,150000);assert.equal(savings.rows[0].firstQuote,q1.id);
 const amendedOrder=await issue(amended);await cmd('receipt',{order:amendedOrder.id,line:amended.lines[0].id,event:'receive',quantity:'5',reason:'Five more accepted'});
 const second=await cmd('invoice',{order:amendedOrder.id,reference:'AMENDMENT-FOUR',source:'Amendment invoice',allocations:[{line:amended.lines[0].id,quantity:'4',amountMinor:380000}]},buyer);
 await cmd('payable-terms',{invoice:second.id,version:0,invoiceDate:'2026-10-20',term:'Net 30',reason:'Invoice terms'},buyer);await cmd('approve-payable',{invoice:second.id,version:1,reason:'Cash planning checked'},buyer);
 assert.equal((await report()).totals[0].realizedMinor,120000);
 await cmd('receipt',{order:amendedOrder.id,line:amended.lines[0].id,event:'return',quantity:'1',reason:'Return across amendment family'});savings=await report();assert.equal(savings.totals[0].realizedMinor,105000);assert.equal(savings.realizedRows.reduce((n,r)=>n+r.quantity,0),9,'Invoices share the current accepted cap across issued revisions');
 // Signed savings and currency separation remain explicit.
 const cad=await cmd('request',{...draft,currency:'CAD'},requester),cadAgreement=await cmd('agreement',{...base,currency:'CAD',firstOfferMinor:800000,priceLines:[{...item,firstUnitMinor:80000,awardedUnitMinor:90000}]});
 await cmd('agreement-award',{...input,request:cad.id,agreement:cadAgreement.id,agreementVersion:1,lines:[{...input.lines[0],requestLine:cad.lines[0].id,firstUnitMinor:80000}]},buyer);await approve(cad);
 assert.deepEqual((await report()).totals,[{currency:'CAD',negotiatedMinor:-100000,realizedMinor:0},{currency:'USD',negotiatedMinor:150000,realizedMinor:105000}]);
 assert.equal((await h.send('/api/purse/performance-report',undefined,'')).status,401);assert.equal((await h.send('/api/purse/performance-report',undefined,requester)).status,403);assert.equal((await h.state(requester)).data.agreementAward.length,0);
 // Later original uploads can reopen a risk hold even after cash-planning approval.
 const duplicateBytes=Buffer.from('Same supplier invoice original bytes').toString('base64');
 for(const id of [invoice.id,second.id,invoice.id])await cmd('attachment',{kind:'invoice',record:id,name:'invoice-original.txt',mediaType:'text/plain',base64:duplicateBytes},buyer);
 assert.equal((await report()).totals.find(r=>r.currency==='USD').realizedMinor,0,'New unresolved duplicate-document flags hold previously approved invoice savings');
 for(const id of [invoice.id,second.id]){let current=(await h.state(buyer)).data.invoice.find(i=>i.id===id);for(const flag of current.flags.filter(f=>!current.riskReviews.some(r=>r.flag===f.id))){current=await cmd('invoice-risk-review',{invoice:id,version:current.riskVersion,flag:flag.id,reason:'Buyer reviewed newly attached invoice original'},buyer);}}
 assert.equal((await report()).totals.find(r=>r.currency==='USD').realizedMinor,105000);
 const records=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(records),true);
 for(const field of ['firstOfferSource','reading','lines']){const corrupt=structuredClone(records),record=corrupt.find(r=>r.kind==='agreementAward'&&r.id===award.id),value=JSON.parse(record.value);if(field==='lines')value.lines[0].firstUnitMinor++;else value[field]=field==='reading'?null:'Forged source';record.value=JSON.stringify(value);assert.throws(()=>validatePurchasingArchive(corrupt),/purse_agreement_award/)}
});
