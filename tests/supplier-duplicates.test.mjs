import test from 'node:test'
import assert from 'node:assert/strict'
import {harness} from './purse-harness.mjs'

test('SUPPLIER-003 duplicate matching, redacted CSV custody and history-preserving merge through authenticated public doors', async t=>{
 const h=await harness();t.after(()=>h.close());const {command:cmd,state,send}=h
 await cmd('business',{name:'Summit Operations',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Office']})
 const buyer=await h.member('buyer@example.test',['buyer']),requester=await h.member('requester@example.test',['requester'])
 const original=await cmd('supplier',{name:'Summit Office, Inc.',dba:'Mountain Supply',address:'100 Market St., Denver CO',phone:'+1 (303) 555-0182',contacts:[{name:'Alex',email:'orders@summit-office.example'}],status:'active',reason:'Approved office supplier',matching:{tin:'12-3456789',bankRouting:'021000021',bankAccount:'000123456789'}},buyer)
 assert.deepEqual(original.matchingOnly,{tin:true,bank:true});assert.equal(original.matching,undefined)
 assert.deepEqual((await state(buyer)).data.supplier.find(s=>s.id===original.id).matchingOnly,{tin:true,bank:true},'SUPPLIER-003 native state preserves matching-only flags after protected masks are projected')
 const input={name:'SUMMIT OFFICE INC',dba:'Different DBA',address:'100 Market St Denver, CO',phone:'303-555-0182',contacts:[{name:'Riley',email:'sales@summit-office.example'}],status:'active',reason:'New supplier pending duplicate review'}
 const before=(await state()).data
 const review=await cmd('supplier-duplicates',input,buyer)
 assert.deepEqual(review.matches.map(m=>[m.id,m.reasons]),[[original.id,['legal name / DBA','email domain','address','phone']]])
 assert.deepEqual((await state()).data,before,'Checking duplicates creates no supplier or domain record')
 await cmd('supplier',input,buyer,409)
 await cmd('supplier',{...input,duplicateFingerprint:review.fingerprint,duplicateReason:' '},buyer,400)
 assert.deepEqual((await state()).data,before)
 await cmd('supplier-duplicates',input,requester,403)
 assert.equal((await send('/api/purse/command/supplier-duplicates',input)).status,401)
 const dbaReview=await cmd('supplier-duplicates',{name:'Mountain Supply',contacts:[]},buyer)
 assert.ok(dbaReview.matches.some(m=>m.id===original.id&&m.reasons.includes('legal name / DBA')))
 await cmd('supplier',{...original,phone:'303-555-0199'},buyer)
 await cmd('supplier',{...input,duplicateFingerprint:review.fingerprint,duplicateReason:'Reviewed independent supplier'},buyer,409)
 const updated=await cmd('supplier-duplicates',input,buyer)
 const separate=await cmd('supplier',{...input,duplicateFingerprint:updated.fingerprint,duplicateReason:'Separate legal supplier sharing a purchasing service'},buyer)
 assert.ok(separate.duplicateReview.matches.some(m=>m.id===original.id));assert.equal(separate.duplicateReview.reason,'Separate legal supplier sharing a purchasing service')
 const csv='kind,sourceId,name,status,dba,email,address,phone\nsupplier,move-1,Summit Office Inc,active,Mountain Supply,sales@summit-office.example,100 Market St Denver CO,3035550199\nsupplier,move-2,Mountain Supply,active,,contact@other.example,,\n'
 const mapping={columns:{},decimal:'.',date:'YYYY-MM-DD',statuses:{active:'active'}}
 const preview=await send('/api/purse/import/preview',{csv,mapping},h.owner)
 assert.equal(preview.status,200,JSON.stringify(preview.value))
 assert.equal(preview.value.report.supplierDuplicates.length,2)
 assert.ok(preview.value.report.supplierDuplicates[0].matches.some(m=>m.id===original.id))
 assert.ok(preview.value.report.supplierDuplicates[1].matches.some(m=>m.id==='procurify:supplier:move-1'))
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM ik_jobs').first()).n,0)
 const committed=await send('/api/purse/import/commit',{csv,mapping,fingerprint:preview.value.plan.fingerprint},h.owner)
 assert.equal(committed.status,200,JSON.stringify(committed.value))
 const status=await send('/api/purse/import/status',{id:committed.value.job.id,mappingVersion:committed.value.job.mappingVersion},h.owner)
 assert.equal(Buffer.from(status.value.originals[0].original.base64,'base64').toString(),csv)
 assert.ok((await state()).data.supplier.find(s=>s.sourceId==='move-1').duplicateCheck.matches.some(m=>m.id===original.id))
 const identityReview=await cmd('supplier-duplicates',{name:'Different legal name for matching review',matching:{tin:'123456789',bankRouting:'021000021',bankAccount:'000123456789'}},buyer)
 assert.ok(identityReview.matches.some(m=>m.id===original.id&&m.reasons.includes('TIN (matching-only)')&&m.reasons.includes('bank account (matching-only)')))
 const sensitiveCsv='kind,sourceId,name,status,TIN,Bank Routing,Bank Account,description\r\nsupplier,private-1,Unique imported legal name,active,"12-3456789",021000021,000123456789,"Two-line\nquotation, unchanged"\r\n'
 const sensitivePreview=await send('/api/purse/import/preview',{csv:sensitiveCsv,filename:'private-suppliers.csv',mapping},h.owner)
 assert.equal(sensitivePreview.status,200,JSON.stringify(sensitivePreview.value))
 assert.deepEqual(sensitivePreview.value.report.supplierRedaction.redactedColumns,['TIN','Bank Routing','Bank Account'])
 assert.ok(sensitivePreview.value.report.supplierDuplicates[0].matches.some(m=>m.id===original.id&&m.reasons.includes('TIN (matching-only)')))
 for(const value of ['12-3456789','000123456789'])assert.ok(!JSON.stringify(sensitivePreview.value).includes(value),'Import preview never returns sensitive input values')
 const privateCommit=await send('/api/purse/import/commit',{csv:sensitiveCsv,filename:'private-suppliers.csv',mapping,fingerprint:sensitivePreview.value.plan.fingerprint},h.owner)
 assert.equal(privateCommit.status,200,JSON.stringify(privateCommit.value))
 const privateStatus=await send('/api/purse/import/status',{id:privateCommit.value.job.id,mappingVersion:privateCommit.value.job.mappingVersion},h.owner)
 const originals=privateStatus.value.originals.map(o=>({name:o.name,bytes:Buffer.from(o.original.base64,'base64').toString()}))
 const retained=originals.find(o=>o.name==='private-suppliers.csv').bytes
 assert.equal(retained,sensitiveCsv.replace('"12-3456789"','"[REDACTED]"').replace('021000021','[REDACTED]').replace('000123456789','[REDACTED]'))
 const custody=JSON.parse(originals.find(o=>o.name.endsWith('.custody.json')).bytes)
 const {createHash}=await import('node:crypto')
 assert.equal(custody.originalSha256,createHash('sha256').update(sensitiveCsv).digest('hex'))
 assert.equal(custody.retainedSha256,createHash('sha256').update(retained).digest('hex'))
 assert.ok(!JSON.stringify((await state(requester)).data).includes(custody.originalSha256),'Original sensitive-file digest stays in owner-bound import custody')
 assert.equal((await state(buyer)).data.supplier.find(s=>s.sourceId==='private-1').matching,undefined)
 const tables=(await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_*'").all()).results
 for(const {name} of tables){const stored=JSON.stringify((await h.db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all()).results);for(const raw of ['12-3456789','000123456789'])assert.ok(!stored.includes(raw),'No raw matching-only identity is retained in database rows or import custody')}

 const approver=await h.member('approver@example.test',['approver']),receiver=await h.member('receiver@example.test',['receiver'])
 await cmd('policy',{name:'Office buying',currency:'USD',category:'Office',project:'Office',approver:'approver@example.test',limitMinor:1000000,budgetMinor:5000000})
 const draft=supplier=>({title:'Office furniture',supplier,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Office chair',quantity:'4',unitMinor:10000,category:'Office',project:'Office'}]})
 const approve=async r=>{await cmd('submit',{id:r.id,revision:r.revision},requester);return cmd('decision',{id:r.id,revision:r.revision,decision:'approved',reason:'Facilities budget approved'},approver)}
 const purchase=async supplier=>{const r=await approve(await cmd('request',draft(supplier),requester)),o=await cmd('convert',{id:r.id,revision:r.revision},buyer);await cmd('issue',{id:o.id,revision:o.revision,reason:'Issued through existing supplier channel'},buyer);await cmd('receipt',{order:o.id,line:o.lines[0].id,event:'receive',quantity:'2',reason:'Chairs inspected and accepted'},receiver);const invoice=await cmd('invoice',{order:o.id,reference:'INV-'+o.id,source:'Supplier invoice PDF',allocations:[{line:o.lines[0].id,quantity:'1',amountMinor:10000}]},buyer);return {order:o,invoice}}
 const targetPurchase=await purchase(original.id),sourcePurchase=await purchase(separate.id)
 const pending=await approve(await cmd('request',draft(separate.id),requester))
 const sourceFile=await cmd('attachment',{kind:'supplier',record:separate.id,name:'operating-company.txt',base64:Buffer.from('Buyer-reviewed incorporation evidence').toString('base64')},buyer)
 const mergeInput={source:separate.id,target:original.id}
 await cmd('preview-supplier-merge',mergeInput,requester,403)
 let merge=await cmd('preview-supplier-merge',mergeInput,buyer)
 assert.equal(merge.links.order.length,2);assert.equal(merge.links.invoice.length,2)
 await cmd('supplier',{...original,status:'blocked',reason:'Resolve hold before merge'},buyer)
 await cmd('merge-suppliers',{...mergeInput,fingerprint:merge.fingerprint,reason:'Duplicate supplier confirmed'},buyer,409)
 await cmd('supplier',{...original,status:'active',reason:'Hold resolved with evidence'},buyer)
 await cmd('merge-suppliers',{...mergeInput,fingerprint:merge.fingerprint,reason:'Duplicate supplier confirmed'},buyer,409)
 merge=await cmd('preview-supplier-merge',mergeInput,buyer)
 const prior=(await state()).data,sourceOrder=prior.order.find(o=>o.id===sourcePurchase.order.id),targetOrder=prior.order.find(o=>o.id===targetPurchase.order.id)
 await cmd('merge-suppliers',{...mergeInput,fingerprint:merge.fingerprint,reason:' '},buyer,400)
 const merged=await cmd('merge-suppliers',{...mergeInput,fingerprint:merge.fingerprint,reason:'Buyer confirmed both operating names refer to the same supplier'},buyer)
 const after=(await state()).data
 assert.equal(after.supplier.find(s=>s.id===separate.id).mergedInto,original.id)
 assert.deepEqual(after.order.find(o=>o.id===sourceOrder.id),sourceOrder);assert.deepEqual(after.order.find(o=>o.id===targetOrder.id),targetOrder)
 assert.deepEqual(after.invoice.find(i=>i.id===sourcePurchase.invoice.id),prior.invoice.find(i=>i.id===sourcePurchase.invoice.id))
 const family=after.supplierFamilies.find(f=>f.supplier===original.id)
 assert.deepEqual(new Set(family.members.map(s=>s.id)),new Set([original.id,separate.id]))
 assert.equal(family.orders.length,2);assert.equal(family.invoices.length,2);assert.ok(family.attachments.some(f=>f.id===sourceFile.id));assert.ok(family.merges.some(m=>m.id===merged.id))
 assert.equal(after.supplierScorecards.find(c=>c.supplier===original.id).invoiceAccuracy.total,2)
 assert.ok(!after.supplierScorecards.some(c=>c.supplier===separate.id),'Merged histories do not create a second aggregate scorecard')
 await cmd('request',draft(separate.id),requester,409)
 await cmd('convert',{id:pending.id,revision:pending.revision},buyer,409)
 await cmd('supplier',{...separate,status:'active',reason:'Cannot reactivate alias'},buyer,409)
 await cmd('merge-suppliers',{...mergeInput,fingerprint:merge.fingerprint,reason:'Repeated merge'},buyer,409)
 await cmd('invoice',{order:targetOrder.id,reference:sourcePurchase.invoice.reference,source:'Supplier invoice PDF',allocations:[{line:targetOrder.lines[0].id,quantity:'1',amountMinor:10000}]},buyer,409)
 await cmd('receipt',{order:sourceOrder.id,line:sourceOrder.lines[0].id,event:'receive',quantity:'1',reason:'Original PO remains receivable after merge'},receiver)
 const closedAlias=await cmd('close-order',{id:sourceOrder.id,version:0,reason:'Original issued balance reviewed after merge'},buyer)
 assert.equal(closedAlias.status,'closed')
 const reopenedAlias=await cmd('reopen-order',{id:sourceOrder.id,version:closedAlias.closureVersion,reason:'Reopen existing issued obligation under surviving supplier holds'},buyer)
 assert.equal(reopenedAlias.status,'issued');assert.equal(reopenedAlias.supplier,separate.id)
 const issueAfterMerge=await cmd('supplier-issue',{supplier:original.id,order:sourceOrder.id,category:'billing',description:'Buyer follows original invoice on the surviving supplier'},buyer)
 assert.equal(issueAfterMerge.supplier,separate.id)
 const revised=await cmd('amend',{...draft(original.id),id:pending.id,revision:pending.revision,reason:'Choose surviving supplier after merge'},requester)
 assert.equal(revised.status,'draft');await approve(revised)
 const issuedDoc=await send('/api/purse/download/order/'+sourceOrder.id,undefined,buyer)
 assert.match(issuedDoc.value,new RegExp(separate.name));assert.ok(!issuedDoc.value.includes('000123456789'))

 const importedPrivate=(await state()).data.supplier.find(s=>s.sourceId==='private-1')
 const activatedPrivate=await cmd('screen-supplier',{id:importedPrivate.id},buyer)
 assert.equal(activatedPrivate.sourceId,'private-1');assert.deepEqual(activatedPrivate.sourceRedaction,importedPrivate.sourceRedaction)
 const importMerge=await cmd('preview-supplier-merge',{source:activatedPrivate.id,target:original.id},buyer)
 await cmd('merge-suppliers',{source:activatedPrivate.id,target:original.id,fingerprint:importMerge.fingerprint,reason:'Imported operating name matched the reviewed supplier identity'},buyer)
 const retainedPrivate=await send('/api/purse/import/status',{id:privateCommit.value.job.id,mappingVersion:privateCommit.value.job.mappingVersion},h.owner)
 assert.deepEqual(retainedPrivate.value.originals,privateStatus.value.originals,'Merge retains redacted originals and original-file custody digests')

})

test('SECURITY-001 encrypted owner storage, native reveal, role masks, atomic matching and safe refusal through public HTTP',async t=>{
 const {createHash,createDecipheriv}=await import('node:crypto');
 const syntheticKey=createHash('sha256').update('synthetic-security-storage-key').digest('hex');
 const h=await harness({protectedKey:syntheticKey});t.after(()=>h.close());
 await h.command('business',{name:'Synthetic protected business',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Office']});
 const buyer=await h.member('synthetic-security-buyer@example.test',['buyer']);
 const requester=await h.member('synthetic-security-requester@example.test',['requester']);
 const approver=await h.member('synthetic-security-approver@example.test',['approver']);
 const receiver=await h.member('synthetic-security-receiver@example.test',['receiver']);
 const supplier=await h.command('supplier',{name:'Synthetic protected supplier',status:'active',reason:'Synthetic storage acceptance'},buyer);
 const base='/api/purse/supplier-protected/'+supplier.id;
 const values={tin:'987651234',bankRouting:'123456789',bankAccount:'9876543215678'};
 const metadata=async(cookie=h.owner)=>{const r=await h.send(base,undefined,cookie);assert.equal(r.status,200,JSON.stringify(r.value));return r.value};
 const body=async(extra={})=>({revision:(await metadata()).revision,values,reason:'Synthetic private reason',evidence:'synthetic-source-reference',...extra});
 const snapshot=async()=>({product:(await h.db.prepare("SELECT * FROM p_records WHERE kind!='audit' ORDER BY kind,id").all()).results,ciphertext:(await h.db.prepare('SELECT * FROM p_supplier_protected ORDER BY supplier,field').all()).results});
 const refusalCount=async()=>(await h.db.prepare("SELECT COUNT(*) AS n FROM p_records WHERE kind='audit' AND json_extract(value,'$.action')='protected-refused'").first()).n;
 const refused=async(input,cookie,status=400,operation='store')=>{const before=await snapshot(),count=await refusalCount();const r=await h.send(base+'/'+operation,input,cookie);assert.equal(r.status,status,JSON.stringify(r.value));assert.deepEqual(await snapshot(),before);assert.equal(await refusalCount(),count+1,'Each refusal, including a revision conflict, appends its own safe event');assert.equal(r.headers.get('cache-control'),'no-store');for(const value of Object.values(values))assert.ok(!JSON.stringify(r.value).includes(value));return r};
 await refused(await body(),buyer,403);
 await refused(await body({reason:''}),h.owner);
 await refused(await body({evidence:''}),h.owner);
 await refused(await body({values:{tin:values.tin,unknown:values.bankAccount}}),h.owner);
 await refused(await body({values:{bankAccount:values.bankAccount}}),h.owner);
 await refused(await body({values:{tin:'invalid '+values.tin}}),h.owner);
 const initial=await metadata();assert.equal(initial.bankStatus,'Not recorded');const tinOnly=await h.send(base+'/store',await body({values:{tin:values.tin}}),h.owner);assert.equal(tinOnly.status,200);assert.equal(tinOnly.value.bankStatus,'Not recorded','TIN storage does not claim recorded bank details');assert.equal((await metadata()).bankStatus,'Not recorded');
 const firstBody=await body(),stored=await h.send(base+'/store',firstBody,h.owner);assert.equal(stored.status,200,JSON.stringify(stored.value));assert.deepEqual(stored.value.stored,Object.keys(values));assert.equal(stored.value.bankStatus,'Recorded, not verified – not active for payment');
 const records=(await h.db.prepare('SELECT * FROM p_records').all()).results;
 for(const row of records)for(const value of Object.values(values))assert.ok(!JSON.stringify(row).includes(value),'No protected plaintext in ordinary product records');
 const encrypted=(await h.db.prepare('SELECT * FROM p_supplier_protected ORDER BY field').all()).results;assert.equal(encrypted.length,3);
 for(const row of encrypted){for(const value of Object.values(values))assert.ok(!JSON.stringify(row).includes(value));const dec=createDecipheriv('aes-256-gcm',Buffer.from(syntheticKey,'hex'),Buffer.from(row.nonce,'base64'));dec.setAAD(Buffer.from(JSON.stringify(['main',supplier.id,row.field,row.key_id])));dec.setAuthTag(Buffer.from(row.tag,'base64'));const plain=JSON.parse(Buffer.concat([dec.update(Buffer.from(row.ciphertext,'base64')),dec.final()]).toString());assert.equal(plain.value,values[row.field]);assert.equal(plain.evidence,'synthetic-source-reference');}
 assert.deepEqual((await metadata()).masks,{tin:'••••1234',bankAccount:'••••5678',bankRouting:'••••6789'});assert.deepEqual((await h.state()).data.supplier.find(s=>s.id===supplier.id).protectedData,(await metadata()).masks);
 assert.deepEqual((await metadata(buyer)).masks,(await metadata()).masks);
 for(const who of [requester,approver,receiver])assert.deepEqual((await metadata(who)).masks,{tin:'On file',bankAccount:'On file'});
 const matching=await h.command('supplier-duplicates',{name:'Synthetic different supplier',matching:values},buyer);assert.ok(matching.matches.some(m=>m.id===supplier.id&&m.reasons.includes('TIN (matching-only)')&&m.reasons.includes('bank account (matching-only)')));
 const reveal=async(field='tin')=>({revision:(await metadata()).revision,field,reason:'Synthetic authorized reveal'});
 await refused(await reveal(),h.owner,403,'reveal');
 for(const who of [buyer,requester,approver,receiver])await refused(await reveal(),who,403,'reveal');
 // Complete actual native email reauthentication in the requesting session.
 const step=await h.send('/auth/step-up',{action:'export'},h.owner);assert.equal(step.status,202,JSON.stringify(step.value));
 const message=[...h.messages].reverse().find(m=>m.to.includes('owner@example.test'));
 const token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
 assert.equal((await h.send('/auth/confirm',{token},h.owner)).status,303);
 for(const field of Object.keys(values)){const r=await h.send(base+'/reveal',await reveal(field),h.owner);assert.equal(r.status,200,JSON.stringify(r.value));assert.equal(r.value.value,values[field]);assert.equal(r.headers.get('cache-control'),'no-store');}
 await refused({...await reveal(),field:'all'},h.owner,400,'reveal');
 await refused({...await reveal(),reason:''},h.owner,400,'reveal');
 const stale=await body();await h.command('supplier',{...supplier,reason:'Synthetic current revision change'},buyer);await refused(stale,h.owner,409);
 const concurrent=await body({values:{tin:'987659876'}}),beforeRace=await snapshot();const race=await Promise.all([h.send(base+'/store',concurrent,h.owner),h.send(base+'/store',concurrent,h.owner)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.notDeepEqual(await snapshot(),beforeRace);
 const raceInput=await reveal();const settlement=await Promise.all([h.send(base+'/reveal',raceInput,h.owner),h.send(base+'/store',{...raceInput,values:{tin:values.tin},evidence:'synthetic-race-source'},h.owner)]);assert.deepEqual(settlement.map(r=>r.status).sort(),[200,409]);
 // Native revision-fenced refusal must not reveal a value under expired proof.
 await h.db.prepare('UPDATE oa_step_up_challenges SET consumed_at=? WHERE consumed_at IS NOT NULL').bind(Date.now()-11*60*1000).run();await refused(await reveal(),h.owner,403,'reveal');
 for(const path of ['/api/purse/state','/api/purse/audit','/api/purse/audit.csv','/api/purse/accounting','/api/purse/search?q=9876543215678']){const r=await h.send(path,undefined,h.owner);assert.equal(r.status,200,JSON.stringify(r.value));for(const value of Object.values(values))assert.ok(!JSON.stringify(r.value).includes(value),path);}
 const audit=await h.send('/api/purse/audit',undefined,h.owner);for(const event of audit.value.events.filter(e=>e.action.startsWith('protected-'))){assert.ok(!JSON.stringify(event).includes('synthetic-source-reference'));assert.ok(!Object.values(values).some(v=>JSON.stringify(event).includes(v)));}assert.ok(audit.value.events.some(e=>e.action==='protected-store'));assert.ok(audit.value.events.some(e=>e.action==='protected-reveal'));assert.ok(audit.value.events.some(e=>e.action==='protected-refused'));
 // Corrupt actual persisted envelopes and read through the public door: a
 // valid ciphertext cannot move between a field or supplier identity.
 const currentRows=(await h.db.prepare('SELECT * FROM p_supplier_protected WHERE supplier=?').bind(supplier.id).all()).results;
 const tinRow=currentRows.find(r=>r.field==='tin'),bankRow=currentRows.find(r=>r.field==='bankAccount');
 const replaceTin=async row=>h.db.prepare('UPDATE p_supplier_protected SET key_id=?,nonce=?,ciphertext=?,tag=? WHERE supplier=? AND field=\'tin\'').bind(row.key_id,row.nonce,row.ciphertext,row.tag,supplier.id).run();
 try{await replaceTin(bankRow);const corrupt=await h.send(base,undefined,h.owner);assert.equal(corrupt.status,503);assert.ok(!JSON.stringify(corrupt.value).includes(values.bankAccount));}finally{await replaceTin(tinRow);}
 const other=await h.command('supplier',{name:'Synthetic separate encryption identity',status:'active',reason:'Synthetic ciphertext identity proof'},buyer);
 try{await h.db.prepare('INSERT INTO p_supplier_protected(business,supplier,field,key_id,nonce,ciphertext,tag) VALUES(?,?,?,?,?,?,?)').bind('main',other.id,'tin',tinRow.key_id,tinRow.nonce,tinRow.ciphertext,tinRow.tag).run();const corrupt=await h.send('/api/purse/supplier-protected/'+other.id,undefined,h.owner);assert.equal(corrupt.status,503);assert.ok(!JSON.stringify(corrupt.value).includes(values.tin));}finally{await h.db.prepare('DELETE FROM p_supplier_protected WHERE supplier=?').bind(other.id).run();}
 await refused(await body(),undefined,401);
 const count=await refusalCount(),beforeCross=await snapshot();
 const cross=await h.mf.dispatchFetch(h.origin+base+'/store',{method:'POST',headers:{cookie:h.owner,origin:'https://synthetic-other.example.test','content-type':'application/json'},body:JSON.stringify(await body())});assert.equal(cross.status,403);for(const value of Object.values(values))assert.ok(!(await cross.clone().text()).includes(value));assert.equal(await refusalCount(),count+1,'Cross-origin refusal is audited before returning');assert.deepEqual(await snapshot(),beforeCross);
 // Session-version and revocation refusals cannot save under that authority,
 // but must still append a refusal without touching the supplier or ciphertext.
 await h.db.prepare('UPDATE oa_sessions SET operator_version=operator_version+1 WHERE token_hash IS NOT NULL AND revoked_at IS NULL AND operator_id=(SELECT id FROM oa_operators WHERE email=?)').bind('owner@example.test').run();
 await refused({revision:0,values,reason:'synthetic-purse-1',evidence:'synthetic-purse-2'},h.owner,401);
 await h.db.prepare('UPDATE oa_sessions SET operator_version=(SELECT version FROM oa_operators WHERE id=operator_id) WHERE revoked_at IS NULL').run();
 const bearerBefore=await refusalCount();const bearer=await h.mf.dispatchFetch(h.origin+base+'/reveal',{method:'POST',headers:{origin:h.origin,authorization:'Bearer synthetic-purse-3','content-type':'application/json'},body:JSON.stringify({revision:0,field:'tin',reason:values.tin})});assert.equal(bearer.status,401);assert.equal(await refusalCount(),bearerBefore+1);
 const signout=await h.send('/auth/signout',{},h.owner);assert.equal(signout.status,204);await refused({revision:0,field:'tin',reason:'synthetic-purse-4'},h.owner,401,'reveal');
 const refusals=(await h.db.prepare("SELECT value FROM p_records WHERE kind='audit' AND json_extract(value,'$.action')='protected-refused'").all()).results.map(row=>JSON.parse(row.value));
 assert.ok(refusals.some(event=>event.status===409));assert.ok(refusals.some(event=>event.status===401));assert.ok(refusals.some(event=>event.status===403));
 for(const event of refusals){assert.equal(event.record,'supplier-protected');assert.ok(['read','store','reveal'].includes(event.operation));for(const value of Object.values(values))assert.ok(!JSON.stringify(event).includes(value));assert.ok(!JSON.stringify(event).includes('synthetic-purse-3'));}

});

test('SECURITY-001 unavailable installation key returns 503 without protected or matching writes',async t=>{
 const h=await harness();t.after(()=>h.close());await h.command('business',{name:'Synthetic key loss',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Office']});
 const supplier=await h.command('supplier',{name:'Synthetic key unavailable supplier',status:'active',reason:'Synthetic acceptance'}),base='/api/purse/supplier-protected/'+supplier.id;
 const metadata=await h.send(base,undefined,h.owner),before=(await h.db.prepare("SELECT * FROM p_records WHERE kind!='audit' ORDER BY kind,id").all()).results;
 const r=await h.send(base+'/store',{revision:metadata.value.revision,values:{tin:'987651234'},reason:'Synthetic reason',evidence:'synthetic-source'},h.owner);assert.equal(r.status,503,JSON.stringify(r.value));assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM p_supplier_protected').first()).n,0);assert.deepEqual((await h.db.prepare("SELECT * FROM p_records WHERE kind!='audit' ORDER BY kind,id").all()).results,before);
});

test('SECURITY-001 owner rotation authenticates all values atomically and key-loss recovery requires explicit audited reentry',async t=>{
 const {createHash,createCipheriv,createDecipheriv,randomBytes}=await import('node:crypto');
 const activeKey=createHash('sha256').update('synthetic-purse-1').digest('hex'),oldKey=createHash('sha256').update('synthetic-purse-2').digest('hex');
 const h=await harness({protectedKey:activeKey,protectedPreviousKey:oldKey});t.after(()=>h.close());
 await h.command('business',{name:'synthetic-purse-3',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Office']});
 const buyer=await h.member('synthetic-purse-4@example.test',['buyer']);
 const supplier=await h.command('supplier',{name:'synthetic-purse-5',status:'active',reason:'synthetic-purse-6'}),base='/api/purse/supplier-protected/'+supplier.id;
 const values={tin:'987651234',bankAccount:'9876543215678',bankRouting:'123456789'},payloads={};
 const keyStatus=async()=>{const r=await h.send('/api/purse/protected-keys',undefined,h.owner);assert.equal(r.status,200,JSON.stringify(r.value));return r.value};
 const metadata=await h.send(base,undefined,h.owner);assert.equal((await h.send(base+'/store',{revision:metadata.value.revision,values,reason:'synthetic-purse-7',evidence:'synthetic-purse-8'},h.owner)).status,200);
 const oldId=createHash('sha256').update(Buffer.from(oldKey,'hex')).digest('hex');
 for(const [field,value] of Object.entries(values)){
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(oldKey,'hex'),nonce);cipher.setAAD(Buffer.from(JSON.stringify(['main',supplier.id,field,oldId])));
  payloads[field]={value,reason:'synthetic-purse-7',evidence:'synthetic-purse-8'};
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payloads[field]),'utf8'),cipher.final()]);
  await h.db.prepare('UPDATE p_supplier_protected SET key_id=?,nonce=?,ciphertext=?,tag=? WHERE supplier=? AND field=?').bind(oldId,nonce.toString('base64'),ciphertext.toString('base64'),cipher.getAuthTag().toString('base64'),supplier.id,field).run();
 }
 const snapshot=async()=>({product:(await h.db.prepare("SELECT * FROM p_records WHERE kind!='audit' ORDER BY kind,id").all()).results,encrypted:(await h.db.prepare('SELECT * FROM p_supplier_protected ORDER BY supplier,field').all()).results});
 const input=async(extra={})=>({revision:(await keyStatus()).revision,reason:'synthetic-purse-9',...extra});
 const refuse=async(operation,body,cookie,status)=>{const before=await snapshot();const r=await h.send('/api/purse/protected-keys/'+operation,body,cookie);assert.equal(r.status,status,JSON.stringify(r.value));assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await snapshot(),before);for(const value of Object.values(values))assert.ok(!JSON.stringify(r.value).includes(value));};
 assert.equal((await keyStatus()).awaitingRotation,3);assert.equal((await keyStatus()).previousKeyMayBeRemoved,false);
 await refuse('rotate',await input(),buyer,403);await refuse('rotate',await input(),h.owner,403);
 const step=await h.send('/auth/step-up',{action:'export'},h.owner);assert.equal(step.status,202);
 const message=[...h.messages].reverse().find(m=>m.to.includes('owner@example.test')),token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');assert.equal((await h.send('/auth/confirm',{token},h.owner)).status,303);
 const original=(await snapshot()).encrypted.find(row=>row.field==='tin');
 await h.db.prepare("UPDATE p_supplier_protected SET tag=? WHERE field='tin' AND supplier=?").bind(Buffer.alloc(16).toString('base64'),supplier.id).run();
 await refuse('rotate',await input(),h.owner,503);
 await h.db.prepare("UPDATE p_supplier_protected SET tag=? WHERE field='tin' AND supplier=?").bind(original.tag,supplier.id).run();
 const stale=await input();await h.command('supplier',{...supplier,reason:'synthetic-purse-10'});await refuse('rotate',stale,h.owner,409);
 const before=await snapshot(),rotated=await h.send('/api/purse/protected-keys/rotate',await input(),h.owner);assert.equal(rotated.status,200,JSON.stringify(rotated.value));assert.equal(rotated.value.checked,3);assert.deepEqual((await snapshot()).product,before.product);
 assert.equal((await keyStatus()).previousKeyMayBeRemoved,true);assert.equal((await keyStatus()).awaitingRotation,0);
 const activeId=createHash('sha256').update(Buffer.from(activeKey,'hex')).digest('hex');
 for(const row of (await snapshot()).encrypted){assert.equal(row.key_id,activeId);const decipher=createDecipheriv('aes-256-gcm',Buffer.from(activeKey,'hex'),Buffer.from(row.nonce,'base64'));decipher.setAAD(Buffer.from(JSON.stringify(['main',supplier.id,row.field,row.key_id])));decipher.setAuthTag(Buffer.from(row.tag,'base64'));assert.deepEqual(JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext,'base64')),decipher.final()]).toString()),payloads[row.field]);const r=await h.send(base+'/reveal',{revision:(await keyStatus()).revision,field:row.field,reason:'synthetic-purse-11'},h.owner);assert.equal(r.status,200);assert.equal(r.value.value,values[row.field]);}
 // A lost key is represented honestly, never replaced by a pretend mask.
 await h.db.prepare("UPDATE p_supplier_protected SET key_id=? WHERE field='tin' AND supplier=?").bind(createHash('sha256').update('synthetic-purse-12').digest('hex'),supplier.id).run();
 assert.equal((await keyStatus()).unreadable,1);assert.equal((await keyStatus()).previousKeyMayBeRemoved,false);
 assert.equal((await h.state()).data.supplier.find(row=>row.id===supplier.id).protectedData.tin,'Key unavailable – re-enter');
 assert.equal((await h.send(base,undefined,h.owner)).status,503);
 await refuse('recover',await input(),h.owner,400);await refuse('recover',await input({acknowledge:'discard-unreadable-and-reenter'}),buyer,403);
 const recovered=await h.send('/api/purse/protected-keys/recover',await input({acknowledge:'discard-unreadable-and-reenter'}),h.owner);assert.equal(recovered.status,200,JSON.stringify(recovered.value));assert.equal(recovered.value.discarded,1);
 const after=await h.send(base,undefined,h.owner);assert.equal(after.value.masks.tin,'Not restored – re-enter');assert.equal(after.value.masks.bankAccount,'••••5678');
 assert.equal((await h.send(base+'/store',{revision:after.value.revision,values:{tin:values.tin},reason:'synthetic-purse-13',evidence:'synthetic-purse-14'},h.owner)).status,200);
 const revealed=await h.send(base+'/reveal',{revision:(await keyStatus()).revision,field:'tin',reason:'synthetic-purse-15'},h.owner);assert.equal(revealed.status,200);assert.equal(revealed.value.value,values.tin);
 const audit=await h.send('/api/purse/audit',undefined,h.owner);for(const action of ['protected-key-rotation','protected-key-loss','protected-refused'])assert.ok(audit.value.events.some(row=>row.action===action));for(const value of [...Object.values(values),activeKey,oldKey])assert.ok(!JSON.stringify(audit.value).includes(value));
});
