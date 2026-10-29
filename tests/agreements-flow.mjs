
import assert from 'node:assert/strict'
import {join} from 'node:path'
import {harness} from './purse-harness.mjs'

import portability from '../scripts/installer/portability.mjs'
import {createPortability} from '@runeditrun/rer/modules/portability'
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs'

export async function agreementsFlow(){
{
 // CONTRACT-001 owner-confirmed agreement history, active member assignment, recorded renewal terms, exact invoice attribution, notice claims and complete restore through public doors
 const cleanups=[]; const t={after:fn=>cleanups.push(fn)};
 try {
 let fail=false;
 const h=await harness({mail:()=>fail?new Response('mail edge unavailable',{status:503}):Response.json({id:crypto.randomUUID()})});t.after(()=>h.close());const cmd=h.command;
 await cmd('business',{name:'Canyon Services',currencies:['USD','CAD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety'],timezone:'America/Los_Angeles'});
 const requester=await h.member('requester@example.test',['requester']),buyer=await h.member('buyer@example.test',['buyer']),approver=await h.member('approver@example.test',['approver']),receiver=await h.member('receiver@example.test',['receiver']);
 const supplier=await cmd('supplier',{name:'Canyon service agreements',status:'preferred',reason:'Known contractor'});
 const base={version:0,confirmed:true,name:'Annual maintenance',reference:'AGR-2026-42',supplier:supplier.id,currency:'USD',parties:'Canyon Services and Canyon contractor',startDate:'2026-01-01',endDate:'2027-01-30',autoRenew:true,noticeDays:60,paymentTerms:'Net 30',reminderDays:[30,7],remindersEnabled:true,reason:'Owner checked original terms',clm:{provider:'Locket',reference:'LOCK-42',url:'https://example.test/locket/42'},signature:{provider:'Inkwell',reference:'INK-42',url:'https://example.test/inkwell/42',status:'signed',source:'Owner-recorded status from signature receipt'}};
 let before=(await h.state()).data;
 await cmd('agreement',{...base,confirmed:false},h.owner,400);
 for(const cookie of [requester,buyer,approver,receiver])await cmd('agreement',base,cookie,403);
 await cmd('agreement',base,'',401);
 for(const invalid of [{endDate:'2026-02-30'},{startDate:'2027-02-01'},{noticeDays:-1},{noticeDays:0.5},{reminderDays:[0]},{reminderDays:[]},{clm:{...base.clm,url:'javascript:alert(1)'}},{signature:{...base.signature,status:'verified'}},{valueMinor:-1},{renewalTermMonths:0},{renewalTermMonths:1.5},{renewalTermMonths:'12'},{renewalTermMonths:1201},{renewalIncreaseCapBps:-1},{renewalIncreaseCapBps:1.5},{renewalIncreaseCapBps:100001}])await cmd('agreement',{...base,...invalid},h.owner,400);
 assert.deepEqual((await h.state()).data.agreement,before.agreement);
 const cross=await h.mf.dispatchFetch(h.origin+'/api/purse/command/agreement',{method:'POST',headers:{origin:'https://outside.test',cookie:h.owner,'content-type':'application/json'},body:JSON.stringify(base)});assert.equal(cross.status,403);
 let agreement=await cmd('agreement',base);assert.equal(agreement.noticeDeadline,'2026-12-01');assert.equal(agreement.history.length,1);assert.equal(agreement.signature.provenance,'owner-recorded; not provider-verified');assert.equal(agreement.owner,(await h.state()).actor.id);
 assert.equal((await h.state(requester)).data.agreement.length,0);assert.equal((await h.state(approver)).data.agreement.length,0);assert.equal((await h.state(buyer)).data.agreement[0].clm.reference,'LOCK-42');const persisted=(await h.state(buyer)).data.agreement[0];for(const field of ['name','reference','supplier','currency','parties','startDate','endDate','autoRenew','noticeDays','paymentTerms','reminderDays','remindersEnabled','clm'])assert.deepEqual(persisted[field],base[field],'CONTRACT-001 confirmed '+field+' survives the public state read');assert.equal(persisted.signature.source,base.signature.source);
 await cmd('agreement',{...base,id:agreement.id,version:0},h.owner,409);
 const search=async(cookie,q='AGR-2026-42')=>h.send('/api/purse/search?'+new URLSearchParams({kind:'agreement',q}),undefined,cookie);
 assert.equal((await search(buyer)).value.total,1);assert.equal((await search(requester)).value.total,0);assert.equal((await search(buyer,'Owner-recorded status')).value.total,0,'Signature evidence and terms stay out of search');
 await cmd('policy',{name:'Service authority',currency:'USD',category:'*',project:'*',approver:'approver@example.test',limitMinor:1000000,budgetMinor:3000000});
 async function invoice(currency='USD',supplierId=supplier.id,reference='SERVICE-42'){
  if(currency==='CAD')await cmd('policy',{name:'CAD authority',currency:'CAD',category:'*',project:'*',approver:'approver@example.test',limitMinor:1000000,budgetMinor:3000000});
  const r=await cmd('request',{title:reference,supplier:supplierId,currency,needDate:'2026-11-30',location:'Denver',costCentre:'Operations',terms:'Net 30',lines:[{description:'Maintenance visit',quantity:'10',unitMinor:10000,category:'Service',project:'Safety'}]},requester);
  await cmd('submit',{id:r.id,revision:1},requester);await cmd('decision',{id:r.id,revision:1,decision:'approved',reason:'Approved services'},approver);const o=await cmd('convert',{id:r.id,revision:1},buyer);await cmd('issue',{id:o.id,revision:1,reason:'Issued in current channel'},buyer);
  const i=await cmd('invoice',{order:o.id,reference,source:'Original service invoice',allocations:[{line:o.lines[0].id,quantity:'6',amountMinor:60000}]},buyer);return {i,o};
 }
 const {i,o}=await invoice();const invoiceBytes=Buffer.from('Original supplier invoice for six service visits\n');const attachment=await cmd('attachment',{kind:'invoice',record:i.id,name:'service-invoice.txt',mediaType:'text/plain',base64:invoiceBytes.toString('base64')},buyer);assert.equal((await h.send('/api/purse/download/attachment/'+attachment.id,undefined,requester)).status,403);await cmd('agreement-invoice',{agreement:agreement.id,invoice:i.id,reason:'Six service visits under this agreement'},buyer,403);
 const link=await cmd('agreement-invoice',{agreement:agreement.id,invoice:i.id,reason:'Six service visits under this agreement'});assert.equal(link.amountMinor,60000);assert.equal(link.order,o.id);
 await cmd('agreement-invoice',{agreement:agreement.id,invoice:i.id,reason:'Repeat'},h.owner,409);
 const cad=await invoice('CAD',supplier.id,'CAD-42');await cmd('agreement-invoice',{agreement:agreement.id,invoice:cad.i.id,reason:'Wrong currency'},h.owner,400);
 const otherSupplier=await cmd('supplier',{name:'Unrelated service provider',status:'active',reason:'Separate supplier'}),other=await invoice('USD',otherSupplier.id,'OTHER-42');await cmd('agreement-invoice',{agreement:agreement.id,invoice:other.i.id,reason:'Wrong supplier'},h.owner,400);
 let current=(await h.state()).data.agreement[0];assert.deepEqual(current.spend.totals,[{currency:'USD',amountMinor:60000}]);assert.equal(current.spend.rows[0].invoice,i.id);assert.equal(current.spend.rows[0].source,'Original service invoice');
 const tick=async time=>{const r=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+Date.parse(time));assert.equal(r.status,200,await r.text())};
 const count=()=>h.messages.filter(m=>m.subject==='Agreement notice deadline: AGR-2026-42').length;
 await tick('2026-11-01T06:59:00Z');assert.equal(count(),0,'Not due until November 1 in installation timezone');
 await Promise.all([tick('2026-11-01T07:00:00Z'),tick('2026-11-01T07:00:00Z')]);assert.equal(count(),1,'Concurrent real scheduled handlers claim once');
 const mail=h.messages.find(m=>m.subject==='Agreement notice deadline: AGR-2026-42');assert.deepEqual(mail.to,['owner@example.test']);assert.match(mail.text,/USD 600.00/);assert.match(mail.text,/2026-12-01/);assert.match(mail.text,/Agreement value not recorded/);
 await tick('2026-11-02T12:00:00Z');assert.equal(count(),1);
 let events=(await h.state()).data.agreementReminder;assert.equal(events.length,1);assert.equal(events[0].outcome.status,'accepted');assert.equal(events[0].spend.rows[0].invoice,i.id);
 // Correction shifts the deadline and retains its exact earlier terms and reminder receipt.
 agreement=await cmd('agreement',{...base,id:agreement.id,version:1,noticeDays:90,reason:'Corrected original notice term'});assert.equal(agreement.noticeDeadline,'2026-11-01');assert.equal(agreement.history[0].noticeDays,60);assert.equal(agreement.history[1].noticeDays,90);
 await tick('2026-11-01T12:00:00Z');assert.equal(count(),1,'No reminder on or after corrected deadline');
 agreement=await cmd('agreement',{...base,id:agreement.id,version:2,remindersEnabled:false,reason:'Pause reminders while reviewing'});await tick('2026-11-24T12:00:00Z');assert.equal(count(),1);
 agreement=await cmd('agreement',{...base,id:agreement.id,version:3,reason:'Resume confirmed schedule'});fail=true;await tick('2026-11-24T12:00:00Z');const attempted=count();assert.ok(attempted>1);fail=false;await tick('2026-11-25T12:00:00Z');assert.equal(count(),attempted,'Failed/uncertain edge attempt is not retried');
 events=(await h.state()).data.agreementReminder;assert.equal(events.length,2);assert.notEqual(events[1].outcome.status,'accepted');assert.equal(events[1].offset,7);
 await cmd('agreement',{...base,id:agreement.id,version:4,currency:'CAD'},h.owner,409);
 // An unrelated edit does not replay a consumed interval.
 agreement=await cmd('agreement',{...base,id:agreement.id,version:4,name:'Annual corrected maintenance',reason:'Correct title'});await tick('2026-11-26T12:00:00Z');assert.equal(count(),attempted);
 let restoreProbe=await cmd('agreement',{...base,reference:'RESTORE-AUTHORITY-42',endDate:'2027-02-28',autoRenew:false});const off=count();await tick('2026-11-30T12:00:00Z');assert.equal(count(),off,'Disabled auto-renewal sends nothing');assert.ok(!(await h.state()).data.agreementReminder.some(e=>e.agreement===restoreProbe.id));restoreProbe=await cmd('agreement',{...base,id:restoreProbe.id,version:1,reference:'RESTORE-AUTHORITY-42',endDate:'2027-02-28',reason:'Enable unclaimed reminder before export'});
 const assignee=await h.member('synthetic-purse-914@example.test',['requester']),assignedActor=(await h.state(assignee)).actor;
 const assignedTerms={...base,name:'synthetic-purse-914',reference:'synthetic-purse-914',ownerMember:assignedActor.email,renewalTermMonths:12,renewalIncreaseCapBps:300,valueMinor:120000};
 await cmd('member',{email:'synthetic-purse-915@example.test',name:'synthetic-purse-915',roles:['requester'],active:true});
 await cmd('agreement',{...assignedTerms,ownerMember:'synthetic-purse-915@example.test'},h.owner,409);
 await cmd('member',{email:assignedActor.email,name:'synthetic-purse-914',roles:['requester'],active:false});
 await cmd('agreement',assignedTerms,h.owner,409);
 await cmd('member',{email:assignedActor.email,name:'synthetic-purse-914',roles:['requester'],active:true});
 await cmd('agreement',assignedTerms,assignee,403);
 let assigned=await cmd('agreement',assignedTerms);assert.equal(assigned.owner,assignedActor.id);assert.equal(assigned.ownerEmail,assignedActor.email);assert.equal(assigned.confirmedBy,(await h.state()).actor.id);assert.notEqual(assigned.owner,assigned.confirmedBy);
 assert.equal(assigned.renewalTermMonths,12);assert.equal(assigned.renewalIncreaseCapBps,300);assert.equal(assigned.ownerProof.actor,assignedActor.id);assert.ok(Number.isSafeInteger(assigned.ownerProof.operatorVersion));
 await tick('2026-11-24T12:00:00Z');const assignedReminder=(await h.state()).data.agreementReminder.find(row=>row.agreement===assigned.id);assert.equal(assignedReminder.outcome.status,'accepted');assert.equal(assignedReminder.owner,assignedActor.id);assert.deepEqual(assignedReminder.spend.rows,[]);const assignedMail=h.messages.find(message=>message.subject==='Agreement notice deadline: synthetic-purse-914');assert.deepEqual(assignedMail.to,[assignedActor.email]);assert.match(assignedMail.text,/Invoice evidence restricted/);
 const ownTerms=(await h.state(assignee)).data.agreement;assert.equal(ownTerms.length,1);assert.equal(ownTerms[0].id,assigned.id);assert.equal(ownTerms[0].renewalTermMonths,12);assert.equal(ownTerms[0].renewalIncreaseCapBps,300);assert.equal(ownTerms[0].termsOnly,true);for(const field of ['history','spend','clm','signature','reading','searchText'])assert.equal(ownTerms[0][field],undefined,'Assigned member receives safe current terms only');assert.equal((await h.state(requester)).data.agreement.length,0);
 assigned=await cmd('agreement',{...base,id:assigned.id,version:assigned.version,name:'synthetic-purse-914 corrected',reference:assignedTerms.reference,owner:(await h.state()).actor.id,ownerEmail:'synthetic-purse-915@example.test',reason:'synthetic-purse-914 preserve assigned member'});
 assert.equal(assigned.owner,assignedActor.id,'Unselected ownership survives correction and forged owner fields');assert.equal(assigned.renewalTermMonths,12);assert.equal(assigned.renewalIncreaseCapBps,300);assert.equal(assigned.history[0].owner,assignedActor.id);
 await cmd('agreement',{...assignedTerms,id:assigned.id,version:1},h.owner,409);
 assigned=await cmd('agreement',{...base,id:assigned.id,version:assigned.version,reference:assignedTerms.reference,ownerMember:(await h.state()).actor.email,renewalTermMonths:null,renewalIncreaseCapBps:0,reason:'synthetic-purse-914 explicit owner reassignment'});
 assert.equal(assigned.owner,(await h.state()).actor.id);assert.equal(assigned.renewalTermMonths,null);assert.equal(assigned.renewalIncreaseCapBps,0);assert.equal(assigned.history[0].renewalTermMonths,12);assert.equal(assigned.history[1].owner,assignedActor.id);assert.equal((await h.state(assignee)).data.agreement.length,0,'Previous assignment grants no current agreement visibility');
 const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;

 const audit=await h.send('/api/purse/audit.csv',undefined,h.owner);assert.match(audit.value,/agreement-reminder/);assert.match(audit.value,/Corrected original notice term/);assert.match(audit.value,/synthetic-purse-914 explicit owner reassignment/);
 const assignmentAudit=(await h.state()).data.audit.find(row=>row.action==='agreement'&&row.record===assigned.id&&row.version===assigned.version);assert.equal(assignmentAudit.before.owner,assignedActor.id);assert.equal(assignmentAudit.after.owner,assigned.owner);assert.equal(assignmentAudit.after.renewalIncreaseCapBps,0);
 const archive=join(h.dir,'agreements.rer');const service=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability});await exportArchive(service,archive,[]);
 let restoredMails=0;const restored=await harness({empty:true,mail:()=>{restoredMails++;return Response.json({id:crypto.randomUUID()})}});t.after(()=>restored.close());const target=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});await importArchive(target,archive,[]);
 const boot=await restored.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'Restored owner'});assert.equal(boot.status,303);const after=(await restored.send('/api/purse/state',undefined,boot.cookie)).value.data;
 for(const kind of ['agreement','agreementInvoice','agreementReminder'])assert.deepEqual(after[kind],(await h.state()).data[kind],kind+' survives full archive restore');
 assert.equal((await restored.send('/api/purse/search?kind=agreement&q=AGR-2026-42',undefined,boot.cookie)).value.total,1,'Search rebuilds after restore');
 await restored.mf.dispatchFetch(restored.origin+'/cdn-cgi/local/scheduled?time='+Date.parse('2026-11-30T12:00:00Z'));assert.equal(restoredMails,0,'Restore grants no historical owner mail authority for an unclaimed due reminder and replays no claimed reminder');const original=await restored.send('/api/purse/download/attachment/'+attachment.id,undefined,boot.cookie);assert.equal(original.status,200);assert.equal(original.value,invoiceBytes.toString(),'Restored attributed invoice original stays exact');

 } finally {for(const close of cleanups.reverse())await close();}
}
}
