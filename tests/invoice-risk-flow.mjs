
import assert from 'node:assert/strict'
import {createHmac,createHash} from 'node:crypto'
import {legacyHash} from '../src/purse/invoice-evidence-crypto.mjs'
import portability from '../scripts/installer/portability.mjs'
import {PDFDocument} from 'pdf-lib'
import {harness} from './purse-harness.mjs'

export async function invoice_riskFlow(){
{
 // INVOICE-003, AP-003 and REPORT-003 native source facts flag near duplicates, repeated PDFs, remit changes and lookalike senders; reasoned review gates planning on every document door
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const h=await harness({protectedKey:createHash('sha256').update('synthetic-purse-1').digest('hex')});t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'Canyon Field Services',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']});
 const requester=await h.member('requester@example.test',['requester']),approver=await h.member('approver@example.test',['approver']),buyer=await h.member('buyer@example.test',['buyer']);
 const bankRouting='021000021',bankAccount='736290184652';
 const supplier=await cmd('supplier',{name:'Canyon Supply',status:'preferred',reason:'Known supplier',contacts:[{name:'Jordan',email:'sales@canyon.example.test'}],matching:{bankRouting,bankAccount}},buyer);
 await cmd('policy',{name:'Safety budget',currency:'USD',category:'*',project:'*',approver:'approver@example.test',limitMinor:1000000,budgetMinor:1000000});
 const r=await cmd('request',{title:'Safety equipment',supplier:supplier.id,currency:'USD',needDate:'2026-11-30',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Safety kit',quantity:'10',unitMinor:1000,category:'Equipment',project:'Safety'}]},requester);const first=await cmd('quote',{...r,request:r.id,source:'Initial source offer',lines:r.lines.map(l=>({...l,unitMinor:1100}))},requester),winner=await cmd('quote',{...r,request:r.id,source:'Awarded source offer'},requester);await cmd('quote-award',{request:r.id,revision:1,firstQuote:first.id,awardedQuote:winner.id,reason:'Buyer recorded supplier reduction',lines:[{requestLine:r.lines[0].id,firstLine:first.lines[0].id,awardedLine:winner.lines[0].id}]},buyer);await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Approved'},approver);const o=await cmd('convert',{id:r.id,revision:1},buyer);await cmd('issue',{id:o.id,revision:1,reason:'Approved terms issued'},buyer);await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'10',reason:'Ten accepted'});
 const pdf=await PDFDocument.create();pdf.addPage().drawText('Canyon Supply invoice CS-100. Two safety kits. USD 20.00.');const bytes=Buffer.from(await pdf.save()),document={name:'CS-100.pdf',mediaType:'application/pdf',base64:bytes.toString('base64')};
 const protectedValues={tin:'987659731',bankRouting,bankAccount};const protectedMeta=await h.send('/api/purse/supplier-protected/'+supplier.id,undefined,h.owner);assert.equal((await h.send('/api/purse/supplier-protected/'+supplier.id+'/store',{revision:protectedMeta.value.revision,values:protectedValues,reason:'synthetic-purse-2',evidence:'synthetic-purse-3'},h.owner)).status,200);
 const input={order:o.id,reference:'CS-100',source:'Original supplier PDF',invoiceDate:'2026-10-19',senderEmail:'sales@canyon.example.test',remit:{bankRouting,bankAccount},document,allocations:[{line:o.lines[0].id,quantity:'2',amountMinor:2000}]};
 const original=await cmd('invoice',input,buyer);assert.deepEqual(original.flags,[]);assert.equal(original.remit.verified,false);assert.equal(original.sender.authentication,'unverified');assert.equal(original.remit.comparison,'matched');
 assert.equal((await cmd('invoice',input,buyer)).id,original.id,'Exact resent reference is idempotent, no second financial record');
 const changedEvidence={...input,remit:{bankRouting,bankAccount:'836290184653'}};await cmd('invoice',changedEvidence,buyer,409);
 const a=(await h.state()).data.attachment.find(a=>a.record===original.id);const downloaded=await h.mf.dispatchFetch(h.origin+'/api/purse/download/attachment/'+a.id,{headers:{cookie:buyer}});assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
 async function terms(i){return cmd('payable-terms',{invoice:i.id,version:0,invoiceDate:i.invoiceDate,term:'Net 30',reason:'Supplier dated invoice'},buyer)}
 async function approve(i,status=200){const p=(await h.state(buyer)).data.payable.find(p=>p.invoice===i.id);return cmd('approve-payable',{invoice:i.id,version:p.version,reason:'Evidence and receipt checked'},buyer,status)}
 async function reviewAll(i){for(const flag of i.flags){const current=(await h.state(buyer)).data.invoice.find(v=>v.id===i.id);await cmd('invoice-risk-review',{invoice:i.id,flag:flag.id,version:current.riskVersion,reason:'Separate supported invoice; original documents and PO reviewed'},buyer)}}
 async function performance(){const response=await h.send('/api/purse/performance-report',undefined,buyer);assert.equal(response.status,200);return response.value}
 await terms(original);await approve(original);assert.equal((await performance()).savings.realizedRows.find(row=>row.invoice===original.id).savingsMinor,200);
 await cmd('supplier',{...supplier,contacts:[{name:'New contact',email:'new@procurement.example.test'}]},buyer);
 const cases=[
  ['near-duplicate',{senderEmail:'sales@canyon.example.test',reference:'CS-100a',invoiceDate:'2026-10-19',allocations:input.allocations}],
  ['duplicate-document',{reference:'CS-101',invoiceDate:'2026-10-19',document,allocations:[{line:o.lines[0].id,quantity:'1',amountMinor:1000}]}],
  ['remit-mismatch',{reference:'CS-102',invoiceDate:'2026-10-20',remit:changedEvidence.remit,allocations:[{line:o.lines[0].id,quantity:'1',amountMinor:1000}]}],
  ['sender-domain',{reference:'CS-103',invoiceDate:'2026-10-21',senderEmail:'sales@cany0n.example.test',allocations:[{line:o.lines[0].id,quantity:'1',amountMinor:1000}]}],
 ];
 for(const [code,b] of cases){const i=await cmd('invoice',{order:o.id,source:'Supplier evidence '+b.reference,...b},buyer);assert.ok(i.flags.some(f=>f.code===code),code);if(code==='near-duplicate')assert.equal(i.sender.comparison,'matched','Sender checks retain the issued PO contact after a directory change');await terms(i);await approve(i,409);const flag=i.flags.find(f=>f.code===code),before=(await h.state()).data;await cmd('invoice-risk-review',{invoice:i.id,flag:flag.id,version:i.riskVersion-1,reason:'Stale'},buyer,409);await cmd('invoice-risk-review',{invoice:i.id,flag:flag.id,version:i.riskVersion,reason:'Forged'},requester,403);await cmd('invoice-risk-review',{invoice:i.id,flag:flag.id,version:i.riskVersion,reason:'Signed out'},'',401);assert.deepEqual((await h.state()).data,before);await reviewAll(i);await approve(i);const current=(await h.state(buyer)).data.invoice.find(v=>v.id===i.id);await cmd('invoice-risk-review',{invoice:i.id,flag:flag.id,version:current.riskVersion,reason:'Repeated disposition'},buyer,409);}
 // A later attachment can put an already-approved invoice back on hold without erasing its historical approval.
 await cmd('attachment',{kind:'invoice',record:original.id,...document,name:'invoice-files/'+document.name,mediaType:'application/pdf; charset=binary',base64:document.base64.match(/.{1,64}/g).join('\n')},buyer);
 let state=(await h.state(buyer)).data,late=state.invoice.find(i=>i.id===original.id);assert.ok(late.flags.some(f=>f.code==='duplicate-document'));assert.ok(!state.cashRequirements.bills.some(b=>b.invoice===original.id));assert.ok(state.payable.find(p=>p.invoice===original.id).approvedAt);const heldReport=await performance();assert.ok(!heldReport.savings.realizedRows.some(row=>row.invoice===original.id),'REPORT-003 excludes a late risk hold');assert.equal(heldReport.invoiceExceptionRate.numerator,1,'REPORT-003 counts the flagged invoice once');
 await reviewAll(late);assert.ok((await h.state(buyer)).data.cashRequirements.bills.some(b=>b.invoice===original.id));assert.equal((await performance()).savings.realizedRows.find(row=>row.invoice===original.id).savingsMinor,200,'REPORT-003 restores exact source-backed savings');assert.equal((await performance()).invoiceExceptionRate.numerator,0);
 const over=await cmd('invoice',{order:o.id,reference:'CS-104',source:'Exceeds remaining PO',invoiceDate:'2026-10-22',allocations:[{line:o.lines[0].id,quantity:'4',amountMinor:4000}]},buyer);assert.ok(over.flags.some(f=>f.code==='po-balance'));await terms(over);await reviewAll(over);await approve(over,409,'Risk review cannot bypass matching discrepancies');
 // Renewed authority changes the face value once; older invoices still consume it.
 const amended=await cmd('amend',{...r,id:r.id,revision:1,reason:'Add ten kits',lines:[{...r.lines[0],quantity:'20'}]},buyer);await cmd('submit',{id:r.id,revision:2},requester);await cmd('decision',{id:r.id,revision:2,decision:'approved',reason:'Expanded safety budget'},approver);const replacement=await cmd('convert',{id:r.id,revision:2},buyer);await cmd('issue',{id:replacement.id,revision:2,reason:'Renewed scope issued'},buyer);await cmd('receipt',{order:replacement.id,line:replacement.lines[0].id,event:'receive',quantity:'10',reason:'Ten more accepted'});
 const remaining=await cmd('invoice',{order:replacement.id,reference:'CS-105',source:'Remaining amended scope',invoiceDate:'2026-10-23',allocations:[{line:replacement.lines[0].id,quantity:'9',amountMinor:9000}]},buyer);assert.equal(remaining.balance.faceMinor,20000);assert.equal(remaining.balance.billedMinor,11000);assert.ok(!remaining.flags.some(f=>f.code==='po-balance'));assert.equal(remaining.balance.remainingMinor,9000);
 const excess=await cmd('invoice',{order:replacement.id,reference:'CS-106',source:'Beyond amended total',invoiceDate:'2026-10-24',allocations:[{line:replacement.lines[0].id,quantity:'1',amountMinor:1000}]},buyer);assert.ok(excess.flags.some(f=>f.code==='po-balance'));
 const noBank=await cmd('supplier',{name:'Supplier without bank baseline',status:'active',reason:'New supplier'}),nr=await cmd('request',{...r,supplier:noBank.id,title:'Separate supplier purchase',id:undefined,lines:[{description:'Other kit',quantity:'1',unitMinor:1000,category:'Equipment',project:'Safety'}]},requester);await cmd('submit',{id:nr.id,revision:1},requester);await cmd('decision',{id:nr.id,revision:1,decision:'approved',reason:'Separate supplier approved'},approver);const no=await cmd('convert',{id:nr.id,revision:1},buyer);await cmd('issue',{id:no.id,revision:1,reason:'Separate terms issued'},buyer);
 const held=await cmd('invoice',{order:no.id,reference:'NB-1',source:'Unverified bank source',remit:{bankRouting,bankAccount},senderEmail:'sales@unrelated.example.test',allocations:[{line:no.lines[0].id,quantity:'1',amountMinor:1000}]},buyer);assert.ok(held.flags.some(f=>f.code==='remit-baseline-missing'));assert.ok(held.flags.some(f=>f.code==='sender-domain'));await terms(held);await approve(held,409);
 const beforeInvalid=(await h.state()).data;await cmd('invoice',{...input,reference:'BAD-DATE',invoiceDate:'2026-02-30'},buyer,400);await cmd('invoice',{...input,reference:'BAD-FILE',document:{...document,base64:'broken'}},buyer,400);assert.deepEqual((await h.state()).data,beforeInvalid);
 const stored=(await h.db.prepare("SELECT kind,value FROM p_records WHERE kind IN ('invoice','audit')").all()).results;for(const row of stored){assert.ok(!row.value.includes(bankAccount));assert.ok(!row.value.includes(changedEvidence.remit.bankAccount));assert.ok(!row.value.includes(bankRouting));}
 state=(await h.state(buyer)).data;const reviewAudit=await h.send('/api/purse/audit?subject='+original.id,undefined,h.owner);assert.equal(reviewAudit.status,200);assert.ok(reviewAudit.value.events.some(e=>e.action==='invoice-risk-review'&&e.record===original.id));assert.equal((await h.send('/api/purse/audit',undefined,buyer)).status,403);assert.ok(!JSON.stringify(state).includes(bankAccount));assert.ok(state.invoice.every(i=>!Object.hasOwn(i,'evidenceHash')));
 const excluded=[];
 for(const path of ['/api/purse/audit','/api/purse/audit.csv','/api/purse/accounting','/api/purse/search?q=Safety','/api/purse/download/order/'+o.id]){const response=await h.send(path,undefined,h.owner);assert.equal(response.status,200);excluded.push(JSON.stringify(response.value));}
 const pdfResponse=await h.mf.dispatchFetch(h.origin+'/api/purse/order-pdf/'+o.id,{headers:{cookie:h.owner}});assert.equal(pdfResponse.status,200);const pdfBytes=await pdfResponse.arrayBuffer();const {getDocumentProxy,extractText}=await import('unpdf');const pdfText=await extractText(await getDocumentProxy(new Uint8Array(pdfBytes)),{mergePages:true});excluded.push(pdfText.text);
 const preparation=await cmd('prepare',{workflow:'exception',fields:{source:'Safety supply evidence'},references:[{kind:'supplier',id:supplier.id},{kind:'order',id:o.id},{kind:'invoice',id:original.id}],draft:'Human purchasing summary'},buyer);excluded.push(JSON.stringify(preparation),(await h.send('/api/purse/download/agentRun/'+preparation.id,undefined,buyer)).value,JSON.stringify(h.messages));
 const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;
 // UUIDs and the original-document digest are public source identities. A random
 // digit run inside one is not a disclosed bank/TIN suffix. Exempt exact values
 // proven by their stored identity field or the original bytes, never digit patterns.
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const publicOpaque=new Set([createHash('sha256').update(bytes).digest('hex')]),privateFingerprints=new Set();
 const collectIds=value=>{if(!value||typeof value!=='object')return;for(const [field,item]of Object.entries(value)){if(field==='id'&&typeof item==='string'&&uuid.test(item))publicOpaque.add(item);else if(item&&typeof item==='object')collectIds(item);}};
 for(const row of rows){
  for(const value of [row.id,row.revision])if(uuid.test(value))publicOpaque.add(value);
  const value=JSON.parse(row.value);collectIds(value);
  if(row.kind==='supplier')for(const fingerprint of Object.values(value.matching??{}))if(typeof fingerprint==='string')privateFingerprints.add(fingerprint);
  if(row.kind==='invoice')for(const fingerprint of [value.evidenceHash,value.evidence?.bankBinding])if(typeof fingerprint==='string')privateFingerprints.add(fingerprint);
 }
 for(const operator of (await h.db.prepare('SELECT id FROM oa_operators').all()).results)if(uuid.test(operator.id))publicOpaque.add(operator.id);
 assert.ok(privateFingerprints.size>0,'Stored matching/evidence fingerprints must be checked');
 for(const [index,output]of excluded.entries()){
  for(const fingerprint of privateFingerprints)assert.ok(!output.includes(fingerprint),'Private matching/evidence fingerprint in public output '+index);
  for(const value of [...Object.values(protectedValues),changedEvidence.remit.bankAccount])assert.ok(!output.includes(value),'Full protected value in public output '+index);
  let semantic=output;for(const identity of publicOpaque)semantic=semantic.replaceAll(identity,'[public source identity]');
  for(const value of Object.values(protectedValues))assert.ok(!semantic.includes(value.slice(-4)),'Protected suffix in public output '+index+' outside proven source identities');
 }

 // Upgrade fixtures reproduce the original v1 wire representation, including lost bank input.
 const root=JSON.parse((await h.db.prepare("SELECT value FROM p_records WHERE kind='supplierMatchingKey'").first()).value).secret;
 const beforeMigration=(await h.db.prepare("SELECT * FROM p_records WHERE kind='invoice'").all()).results;
 const legacyRefs=['CS-100','CS-100a','CS-102','NB-1','CS-103'];
 const legacy=[];
 for(const row of beforeMigration){const i=JSON.parse(row.value);if(!legacyRefs.includes(i.reference))continue;
  // matchingInputs uses HMAC over raw normalized routing:account, rather than JSON.
  const account=i.reference==='CS-102'?changedEvidence.remit.bankAccount:bankAccount;
  const fingerprint=i.remit.supplied?createHmac('sha256',Buffer.from(root,'hex')).update('bank:'+bankRouting+':'+account).digest('hex'):null;
  i.evidenceHash=legacyHash(root,i,fingerprint);delete i.evidence;
  if(i.reference==='CS-103')i.evidenceHash='0'.repeat(64);
  legacy.push(i);await h.db.prepare("UPDATE p_records SET value=? WHERE kind='invoice' AND id=?").bind(JSON.stringify(i),i.id).run();
 }
 const legacyStatus=()=>h.send('/api/purse/invoice-evidence',undefined,h.owner);
 let meta=await legacyStatus();assert.equal(meta.value.pending.length,5);
 const migration=await h.send('/api/purse/invoice-evidence/migrate',{revision:meta.value.revision},h.owner);assert.equal(migration.status,200,JSON.stringify(migration.value));
 assert.deepEqual(migration.value.counts,{'attested-at-migration':2,'unavailable-source':2,'did-not-verify':1});
 let migrated=(await h.state()).data.invoice;
 assert.equal(migrated.find(i=>i.reference==='CS-103').evidenceStatus.state,'did-not-verify');
 assert.equal(migrated.find(i=>i.reference==='CS-102').evidenceStatus.state,'unavailable-source');
 assert.match(migrated.find(i=>i.reference==='CS-100').evidenceStatus.label,/Later checks verify this migration record/);
 const target=legacy.find(i=>i.reference==='CS-102'),reentry={invoice:target.id,reason:'synthetic-purse-1',evidence:'synthetic-purse-2',remit:changedEvidence.remit};
 const reenter=async(body,cookie=h.owner)=>{const current=await legacyStatus();return h.send('/api/purse/invoice-evidence/reenter',{revision:current.value.revision,...reentry,...body},cookie)};
 assert.equal((await reenter({},buyer)).status,403);assert.equal((await reenter({},requester)).status,403);assert.equal((await reenter({},'')).status,401);
 assert.equal((await reenter({})).status,403,'Current native step-up required');
 const step=await h.send('/auth/step-up',{action:'export'},h.owner);assert.equal(step.status,202);
 const message=[...h.messages].reverse().find(m=>m.to.includes('owner@example.test'));
 const token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
 assert.equal((await h.send('/auth/confirm',{token},h.owner)).status,303);
 const beforeMismatch=JSON.parse((await h.db.prepare("SELECT value FROM p_records WHERE kind='invoice' AND id=?").bind(target.id).first()).value);
 const mismatch=await reenter({remit:{bankRouting,bankAccount}});assert.equal(mismatch.status,200);assert.equal(mismatch.value.matched,false);
 assert.deepEqual(JSON.parse((await h.db.prepare("SELECT value FROM p_records WHERE kind='invoice' AND id=?").bind(target.id).first()).value),beforeMismatch);
 assert.equal((await reenter({revision:-1})).status,409);
 const verified=await reenter({});assert.equal(verified.status,200,JSON.stringify(verified.value));assert.equal(verified.value.state,'verified-by-reentry');
 const afterRows=(await h.db.prepare('SELECT * FROM p_records').all()).results;

 for(const original of legacy){assert.equal(JSON.parse(afterRows.find(r=>r.kind==='invoice'&&r.id===original.id).value).evidenceHash,original.evidenceHash,'Migration preserves original hash bytes');}
 const exported=afterRows.map(row=>portability.exportRow('p_records',structuredClone(row))),archiveBytes=JSON.stringify(exported);
 assert.ok(!archiveBytes.includes(root));assert.ok(!archiveBytes.includes(bankRouting));assert.ok(!archiveBytes.includes(bankAccount));
 const supplierMatching=JSON.parse(afterRows.find(r=>r.kind==='supplier'&&r.id===supplier.id).value).matching;
 assert.ok(!archiveBytes.includes(supplierMatching.bank));

 const redactedRoot=exported.find(r=>r.kind==='supplierMatchingKey');await h.db.prepare("UPDATE p_records SET value=? WHERE kind='supplierMatchingKey'").bind(redactedRoot.value).run();
 assert.equal((await reenter({})).status,503,'Default restore cannot verify legacy bank input without the old root');
 const persisted=JSON.stringify((await h.db.prepare("SELECT value FROM p_records WHERE kind IN ('invoice','audit','invoiceEvidenceMigration')").all()).results);
 for(const sensitive of [bankRouting,bankAccount,changedEvidence.remit.bankAccount,supplierMatching.bank])assert.ok(!persisted.includes(sensitive));

 } finally {for(const close of cleanups.reverse())await close();}
}
{
 // Legacy archive import migrates retained evidence without rewriting hashes, and tampered evidence refuses atomically through the archive door
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 const {legacyHistoryFixture}=await import('./invoice-history-fixture.mjs');
 const {createPortability}=await import('@runeditrun/rer/modules/portability');
 const {exportArchive,importArchive}=await import('@runeditrun/rer/internal/modules/portability/files.mjs');
 const {makePart,ContentVerifier,ArchiveVerifier}=await import('@runeditrun/rer/modules/portability/format');
 const {records,rows}=await import('./browser-archive.mjs');const {writeFile}=await import('node:fs/promises');const {join}=await import('node:path');
 const h=await harness();t.after(()=>h.close());const f=await legacyHistoryFixture(h);
 const bad=f.invoices.find(i=>i.reference==='Hash did not verify');await h.db.prepare("DELETE FROM p_records WHERE kind='invoice' AND id=?").bind(bad.id).run();await h.db.prepare("DELETE FROM p_records WHERE kind='invoiceEvidenceKey'").run();
 const before=(await h.db.prepare("SELECT id,value FROM p_records WHERE kind='invoice'").all()).results.map(r=>({id:r.id,hash:JSON.parse(r.value).evidenceHash}));
 const archive=join(h.dir,'legacy.rer');await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:{...portability,exportRow:undefined}}),archive,[]);
 const target=await harness({empty:true});t.after(()=>target.close());const service=await createPortability({db:target.db,buckets:{ORIGINALS:target.originals},policy:portability});
 async function tamper(source,path,mutate){const input=await records(source);mutate(rows(input));const content=new ContentVerifier(input[0]),wire=new ArchiveVerifier(input[0]);for(let i=1;i<input.length-1;i++){input[i]=await makePart(input[i].index,input[i].items);wire.add(input[i]);for(const item of input[i].items)content.add(item);}input.at(-1).contentHash=content.digest();input.at(-1).archiveHash=wire.digest();await writeFile(path,input.map(JSON.stringify).join('\n')+'\n',{mode:0o600});}
 const broken=join(h.dir,'legacy-broken.rer');await tamper(archive,broken,items=>{const item=items.find(r=>r.table==='p_records'&&r.row.kind==='invoice'&&JSON.parse(r.row.value).reference==='No bank input'),i=JSON.parse(item.row.value);i.evidenceHash='0'.repeat(64);item.row.value=JSON.stringify(i);});
 await assert.rejects(()=>importArchive(service,broken,[]),/invoice_evidence_unverified/);assert.equal((await target.db.prepare('SELECT COUNT(*) n FROM p_records').first()).n,0);
 await importArchive(service,archive,[]);const migrated=(await target.db.prepare("SELECT * FROM p_records").all()).results;
 for(const original of before){const i=JSON.parse(migrated.find(r=>r.kind==='invoice'&&r.id===original.id).value);assert.equal(i.evidenceHash,original.hash);assert.ok(['attested-at-migration','unavailable-source'].includes(i.evidence.state));}
 const clean=join(h.dir,'default.rer');await exportArchive(service,clean,[]);const defaultRows=rows(await records(clean));assert.ok(!JSON.stringify(defaultRows).includes(JSON.parse((await h.db.prepare("SELECT value FROM p_records WHERE kind='supplierMatchingKey'").first()).value).secret));
 const empty=await harness({empty:true});t.after(()=>empty.close());const emptyService=await createPortability({db:empty.db,buckets:{ORIGINALS:empty.originals},policy:portability});
 for(const [name,change]of [['hash',i=>i.evidenceHash='1'.repeat(64)],['state',i=>i.evidence.state='verified-by-reentry'],['bank',i=>i.bankAccount='9876543215678']]){
  const changed=join(h.dir,name+'.rer');await tamper(clean,changed,items=>{const item=items.find(r=>r.table==='p_records'&&r.row.kind==='invoice'),i=JSON.parse(item.row.value);change(i);item.row.value=JSON.stringify(i);});await assert.rejects(()=>importArchive(emptyService,changed,[]),/invoice_evidence_/);assert.equal((await empty.db.prepare('SELECT COUNT(*) n FROM p_records').first()).n,0,'A refused '+name+' archive publishes no domain row');
 }
 await importArchive(emptyService,clean,[]);

 } finally {for(const close of cleanups.reverse())await close();}
}
}
