import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createPortability} from '@runeditrun/rer/modules/portability';
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs';
import {harness} from './purse-harness.mjs';
import {approverSupplierFixture,unchangedRefusal} from './approver-supplier-groups-fixture.mjs';
import {groupMail} from './po-supplier-groups-fixture.mjs';
import {documentProfileFixture} from './document-profile-fixture.mjs';
import {termsPdf} from './po-documents-fixtures.mjs';
import {pdfContent} from './pdf-content.mjs';
import {reauthenticateErasure} from './erasure-flow.mjs';

test('Current approver supplier corrections renew exact decisions and reconcile frozen grouped purchases through archive and erasure',async t=>{
 const h=await harness();t.after(()=>h.close());const f=await approverSupplierFixture(h),{cmd}=f;
 const terms=await termsPdf('synthetic-purse-8200 frozen original terms'),profile=await cmd('po-profile',{...documentProfileFixture(f.business,'Denver'),id:(await h.state()).data.poProfile[0].id,version:1,termsFile:{name:'synthetic-purse-8200.pdf',base64:terms}});
 const source=await f.pending(),original=structuredClone(source);
 assert.deepEqual(await f.exposure(source),{total:100000,positions:[[60000,0,0],[40000,0,0]]});
 const edited=await cmd('approver-edit',f.change(source),f.editor);
 assert.equal(edited.revision,2);assert.equal(edited.status,'pending');assert.equal(edited.approverEdit.renewed.length,1);assert.deepEqual(edited.approverEdit.carried,[]);
 assert.deepEqual(edited.lines.map(line=>[line.id,line.quantity,line.q,line.unitMinor,line.totalMinor]),original.lines.map(line=>[line.id,line.quantity,line.q,line.unitMinor,line.totalMinor]));assert.equal(edited.currency,original.currency);assert.equal(edited.totalMinor,100000);assert.equal(edited.approverEdit.differences[0].before,f.suppliers[0].id);assert.equal(edited.approverEdit.differences[0].after,f.suppliers[1].id);
 assert.deepEqual(edited.lines.map(line=>[line.supplier,line.supplierSnapshot.name]),f.suppliers.map(supplier=>[supplier.id,supplier.name]));
 assert.deepEqual(await f.exposure(source),{total:100000,positions:[[60000,0,0],[40000,0,0]]});
 assert.deepEqual((await h.state()).data.revision.find(row=>row.request===source.id&&row.revision===1).lines,original.lines);
 await unchangedRefusal(h,'decision',{id:source.id,revision:2,decision:'approved',reason:'Earlier approver must decide again'},f.editor,403);
 await unchangedRefusal(h,'convert',{id:source.id,revision:2},f.buyer,409);
 await f.approve(edited,f.approver);await f.approve(edited,f.editor);
 const result=await cmd('convert',{id:source.id,revision:2},f.buyer),groups=result.supplierOrders;assert.deepEqual(groups.map(group=>group.totalMinor),[60000,40000]);assert.deepEqual(groups.flatMap(group=>group.lines.map(line=>line.sourceLine)),source.lines.map(line=>line.id));
 await cmd('issue',{id:groups[0].id,revision:2,reason:'Issue the independently approved exact supplier groups'},f.buyer);
 assert.deepEqual(await f.exposure(source),{total:100000,positions:[[0,60000,0],[0,40000,0]]});assert.deepEqual((await f.report()).totals,[{currency:'USD',reservedMinor:0,committedMinor:100000,actualMinor:0}]);
 await cmd('supplier',{...f.suppliers[1],name:'synthetic-purse-8201 later name',reason:'Later supplier name correction'});
 await cmd('po-profile',{...documentProfileFixture(f.business,'Denver'),id:profile.id,version:profile.version,standardTerms:'synthetic-purse-8202 later terms'});
 for(const [index,group]of groups.entries()) {
  const response=await h.mf.dispatchFetch(h.origin+'/api/purse/order-pdf/'+group.id,{headers:{cookie:f.buyer}});assert.equal(response.status,200);const pdf=await pdfContent(new Uint8Array(await response.arrayBuffer()));assert.ok(pdf.text.includes(f.suppliers[index].name));assert.ok(pdf.text.includes('synthetic-purse-8200 frozen original terms'));assert.ok(!pdf.text.includes('synthetic-purse-8201 later name'));assert.ok(!pdf.text.includes('synthetic-purse-8202 later terms'));
  const html=await h.send('/api/purse/download/order/'+group.id,undefined,f.buyer);assert.equal(html.status,200);assert.ok(html.value.includes(terms),'Frozen terms retain the exact original bytes');
 }
 const events=await h.send('/api/purse/audit?subject='+source.id,undefined,h.owner),audit=events.value.events.find(event=>event.action==='approver-edit');assert.equal(events.status,200);assert.equal(audit.actor,edited.approverEdit.actor);assert.equal(audit.revision,2);assert.deepEqual(audit.differences,edited.approverEdit.differences);
 const csv=await h.send('/api/purse/audit.csv?subject='+source.id,undefined,h.owner);assert.equal(csv.status,200);for(const value of ['approver-edit',source.lines[1].id,f.suppliers[1].id,'renewed'])assert.ok(csv.value.includes(value));
 assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records').all()).results),true);
 const archive=join(h.dir,'synthetic-purse-8203.rer');await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive,[]);
 const restored=await harness();t.after(()=>restored.close());await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[]);
 for(const kind of ['request','revision','decision','order','commitment','audit']){const rows=async db=>(await db.prepare('SELECT * FROM p_records WHERE kind=? ORDER BY id').bind(kind).all()).results;assert.deepEqual(await rows(restored.db),await rows(h.db),kind);}
 assert.equal((await restored.send('/api/purse/command/approver-edit',f.change(edited),f.editor)).status,401);
 const historical=await f.pending();await cmd('approver-edit',f.change(historical),f.editor);
 await cmd('member',{email:groupMail(8104),name:'Former supplier corrector',roles:['approver'],active:false});await reauthenticateErasure(h);
 const inventory=await h.send('/api/purse/erasure',undefined,h.owner),preview=await h.send('/api/purse/erasure/preview',{kind:'member',id:groupMail(8104),revision:inventory.value.revision},h.owner);assert.equal(preview.status,200,JSON.stringify(preview.value));
 const erased=await h.send('/api/purse/erasure/execute',{...preview.value.subject,revision:preview.value.revision,review:preview.value.review,fingerprint:preview.value.fingerprint,consent:true},h.owner);assert.equal(erased.status,200,JSON.stringify(erased.value));
 assert.equal((await h.send('/api/purse/state',undefined,f.editor)).status,401);assert.equal((await h.send('/api/purse/command/approver-edit',f.change(historical),f.editor)).status,401);
 const erasedRows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.ok(erasedRows.every(row=>!row.value.includes(groupMail(8104))));assert.equal(validatePurchasingArchive(erasedRows),true);
 const journal=join(h.dir,'synthetic-purse-8204.rer');await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),journal,[]);
 const fenced=await harness({empty:true});t.after(()=>fenced.close());await assert.rejects(importArchive(await createPortability({db:fenced.db,buckets:{ORIGINALS:fenced.originals},policy:portability}),archive,[],journal),/erasure_epoch/);assert.equal((await fenced.db.prepare('SELECT count(*) AS n FROM p_records').first()).n,0);
});

test('Supplier corrections refuse unsafe sources and revoked authority while retaining every required budget-owner decision',async t=>{
 const h=await harness();t.after(()=>h.close());const f=await approverSupplierFixture(h),{cmd}=f,source=await f.pending();
 const blocked=await cmd('supplier',{name:'synthetic-purse-8210',status:'blocked',reason:'Purchasing hold'});
 const form=await cmd('intake-form',{name:'synthetic-purse-8211',purchaseType:'goods',active:true,consent:true,defaults:{category:'goods',currency:'USD',location:'Denver',costCentre:'Operations',project:'General'},questions:[],headerFields:[],lineFields:[],requiredFiles:[]});
 const proposal=await cmd('intake-draft',{fields:{intakeForm:form.id,lines:[]},proposal:{name:'synthetic-purse-8212',contactEmail:groupMail(8213).replace('example.test','synthetic-purse-8213.test'),reason:'Awaiting independent supplier review',consent:true}},f.requester);
 const lapsed=await cmd('supplier',{name:'synthetic-purse-8214',status:'active',reason:'Initial supplier review'}),file=await cmd('attachment',{kind:'supplier',record:lapsed.id,privateSupplierDocument:true,name:'synthetic-purse-8215.pdf',mediaType:'application/pdf',base64:Buffer.from('%PDF-1.4\nsynthetic-purse-8215 expired insurance').toString('base64')});
 await cmd('supplier-document',{supplier:lapsed.id,type:'insurance',attachment:file.id,expires:'2000-01-01',required:true,reminderDays:[],version:0});
 for(const supplier of [blocked.id,proposal.fields.supplier,lapsed.id])await unchangedRefusal(h,'approver-edit',f.change(source,{changes:{lines:[{id:source.lines[1].id,supplier}]}}),f.editor,409);
 for(const [field,value]of [['quantity','2'],['unitMinor',1],['id','synthetic-purse-8216']])await unchangedRefusal(h,'approver-edit',f.change(source,{changes:{lines:[{id:source.lines[1].id,[field]:value,supplier:f.suppliers[1].id}]}}),f.editor,403);
 await unchangedRefusal(h,'approver-edit',f.change(source,{revision:0}),f.editor,409);await unchangedRefusal(h,'approver-edit',f.change(source),f.requester,403);await unchangedRefusal(h,'approver-edit',f.change(source),f.approver,403);
 await unchangedRefusal(h,'approver-edit',f.change(source,{changes:{currency:'EUR'}}),f.editor,403);
 const self=await h.member(groupMail(8220),['requester','approver']);await cmd('policy',{name:'synthetic-purse-8221',currency:'USD',category:'synthetic-purse-8221',project:'General',approver:groupMail(8220),limitMinor:2000000,budgetMinor:2000000,approvalSteps:[],editRules:{'*':{allowed:['supplier'],material:['supplier']}}});const own=await cmd('request',{...f.draft,lines:f.draft.lines.map(line=>({...line,category:'synthetic-purse-8221',allocations:undefined}))},self);await cmd('submit',{id:own.id,revision:1},self);await unchangedRefusal(h,'approver-edit',f.change(own),self,403);
 const item=await cmd('catalogue',{supplier:f.suppliers[0].id,description:'synthetic-purse-8217',currency:'USD',unitMinor:40000,category:'goods',project:'General',approved:true});
 const catalogue=await f.pending({lines:[f.draft.lines[0],{...f.draft.lines[1],catalogue:item.id}]});await unchangedRefusal(h,'approver-edit',f.change(catalogue),f.editor,409);
 // A non-goods revision retains its existing refusal to form supplier groups.
 const service=await f.pending({lines:f.draft.lines.map(line=>({...line,service:{mode:'amount'}}))});await unchangedRefusal(h,'approver-edit',f.change(service),f.editor,409);
 await cmd('member',{email:groupMail(8104),name:'Revoked current corrector',roles:['requester'],active:true});await unchangedRefusal(h,'approver-edit',f.change(source),f.editor,403);
 await cmd('member',{email:groupMail(8104),name:'Current corrector',roles:['approver'],active:true});
 // A prior budget-owner decision remains bound to the same money and coding;
 // supplier-dependent purchasing approval renews, and the other owner must act.
 const bh=await harness();t.after(()=>bh.close());const b=await approverSupplierFixture(bh,{budgetMinor:30000}),bcmd=b.cmd;
 for(const policy of b.policies)await bcmd('policy',{...policy,approvalSteps:[],editRules:{goods:{allowed:['supplier'],material:['supplier']}}});
 const budget=await b.create();await b.approve(budget,b.ownerA);
 const corrected=await bcmd('approver-edit',b.change(budget),b.ownerB);assert.equal(corrected.approverEdit.carried.length,1);assert.equal(corrected.approverEdit.renewed.length,1);
 const carried=(await bh.state()).data.decision.find(row=>row.id===corrected.approverEdit.carried[0]);assert.equal(carried.email,groupMail(8104));assert.equal(carried.chainStep,'budget-owner');assert.equal(carried.revision,2);
 await unchangedRefusal(bh,'convert',{id:budget.id,revision:2},b.buyer,409);await b.approve(corrected,b.approver);await unchangedRefusal(bh,'convert',{id:budget.id,revision:2},b.buyer,409);await b.approve(corrected,b.ownerB);
 const issued=await bcmd('convert',{id:budget.id,revision:2,issue:true},b.buyer);assert.deepEqual(issued.supplierOrders.map(group=>group.totalMinor),[60000,40000]);assert.equal((await bh.state()).data.commitment.filter(event=>event.request===budget.id).reduce((sum,event)=>sum+event.amountMinor,0),100000);
 assert.equal(validatePurchasingArchive((await bh.db.prepare('SELECT * FROM p_records').all()).results),true);
});
