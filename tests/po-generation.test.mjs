import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { harness } from './purse-harness.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';

async function fixture(t) {
    const h=await harness({protectedKey:createHash('sha256').update('synthetic-purse-801').digest('hex')});t.after(()=>h.close());const cmd=h.command;
    await cmd('business',{name:'Canyon Design Studio',currencies:['USD','AUD'],locations:['Denver'],costCentres:['IT','Operations'],projects:['Operations']});
    const requester=await h.member('synthetic-purse-802@example.test',['requester']),approver=await h.member('synthetic-purse-803@example.test',['approver']),buyer=await h.member('synthetic-purse-804@example.test',['buyer']);
    await cmd('policy',{name:'Approved purchases',currency:'USD',category:'*',project:'*',approver:'synthetic-purse-803@example.test',limitMinor:10000000,budgetMinor:100000000});
    const supplier=await cmd('supplier',{name:'Canyon Procurement Supplies',status:'preferred',reason:'Reviewed supplier',contacts:[{name:'Supplier contact',email:'synthetic-purse-805@example.test'}]});
    const item=await cmd('catalogue',{supplier:supplier.id,currency:'USD',description:'Studio supply kit',unitMinor:10000,category:'Hardware',project:'Operations',approved:true,unit:'kit'});
    const rule={purchaseType:'catalogue',supplier:'*',currency:'USD',version:0,enabled:true,maxMinor:100000,consent:true,reason:'Owner authorizes exact approved internal generation; buyer sends separately'};
    const fields=(title,quantity='1')=>({title,supplier:supplier.id,currency:'USD',needDate:'2026-12-01',location:'Denver',costCentre:'IT',terms:'Net 30',lines:[{catalogue:item.id,quantity,project:'Operations'}]});
    const approve=async input=>{const r=await cmd('request',input,requester);await cmd('submit',{id:r.id,revision:r.revision},requester);await cmd('decision',{id:r.id,revision:r.revision,decision:'approved',reason:'Independent exact source approval'},approver);return r;};
    const tick=async()=>{const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+(Date.now()+1000));assert.equal(response.status,200,await response.text());};
    return {h,cmd,requester,approver,buyer,supplier,item,rule,fields,approve,tick};
}

test('PO generation rules create one native PO, wait above the limit and for supplier activation, retain sources and invoice holds, with separate buyer sending consent',async t=>{
    const f=await fixture(t),{h,cmd,requester,buyer,supplier,rule,fields,approve,tick}=f;
    await cmd('po-generation-policy',rule,'',401);await cmd('po-generation-policy',rule,buyer,403);await cmd('po-generation-policy',{...rule,consent:false},h.owner,400);
    await cmd('po-generation-policy',rule);
    const ready=await approve(fields('Approved catalog kit')),manual=await approve(fields('High amount buyer review','11'));
    const form=await cmd('intake-form',{name:'New supplier goods',purchaseType:'goods',version:0,consent:true});
    const draft=await cmd('intake-draft',{fields:{...fields('Pending caterer'),intakeForm:form.id,supplier:'',lines:[{description:'Catering',quantity:'1',unitMinor:90000,category:'Hardware',project:'Operations'}]},proposal:{name:'Canyon Event Catering',contactEmail:'synthetic-purse-806@catering.example.test',reason:'Event caterer not yet reviewed',consent:true}},requester);
    const pending=await cmd('intake-complete',{id:draft.id,version:draft.version,consent:true},requester);
    await cmd('submit',{id:pending.id,revision:pending.revision},requester);await cmd('decision',{id:pending.id,revision:pending.revision,decision:'approved',reason:'Purchase approved while vendor is pending'},f.approver);
    await cmd('po-generation-policy',{...rule,purchaseType:'goods'});
    const n=h.messages.length;await Promise.all([tick(),tick()]);await tick();
    let state=(await h.state()).data,order=state.order.find(o=>o.request===ready.id);
    assert.ok(order);assert.equal(order.status,'issued');assert.equal(state.order.filter(o=>o.request===ready.id).length,1);assert.equal(h.messages.length,n,'Generation creates no supplier send or fake mail attempt');assert.equal((await h.send('/api/purse/order-send/'+order.id,undefined,buyer)).value.event,null);
    assert.equal(order.lines[0].sourceLine,ready.lines[0].id);assert.equal(order.lines[0].category,ready.lines[0].category);assert.deepEqual(order.lines[0].allocations,ready.lines[0].allocations);
    assert.equal(state.poGenerationQueue.find(q=>q.request===manual.id).status,'manual-review');assert.equal(state.poGenerationQueue.find(q=>q.request===pending.id).status,'waiting-supplier');assert.ok(!state.order.some(o=>o.request===pending.id));
    await cmd('convert',{id:ready.id,revision:1},buyer,409);
    await cmd('supplier',{id:pending.supplier,name:'Canyon Event Catering',status:'active',reason:'Independent supplier administrator reviewed and activated',contacts:[{name:'Caterer',email:'synthetic-purse-806@catering.example.test'}]});
    await Promise.all([tick(),tick()]);await tick();state=(await h.state()).data;
    assert.equal(state.order.filter(o=>o.request===pending.id).length,1);assert.equal(state.decision.filter(d=>d.request===pending.id&&d.decision==='approved').length,1);assert.equal(h.messages.length,n);
    await cmd('po-generation-review',{id:manual.id,revision:1},requester,403);await cmd('po-generation-review',{id:manual.id,revision:0},buyer,409);await cmd('po-generation-review',{id:manual.id,revision:1},buyer);
    assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results),true,'Activated guided suppliers retain portable purchasing history');
    const invoice={order:order.id,reference:'synthetic-purse-807',source:'Supplier invoice source',invoiceDate:'2026-10-23',allocations:[{line:order.lines[0].id,quantity:'0.5',amountMinor:5000}]};
    const captured=await cmd('invoice',invoice,buyer);assert.equal((await cmd('invoice',invoice,buyer)).id,captured.id);await cmd('invoice',{...invoice,source:'Changed source under the same supplier reference'},buyer,409);
    const over=await cmd('invoice',{...invoice,reference:'synthetic-purse-808',allocations:[{line:order.lines[0].id,quantity:'1',amountMinor:10000}]},buyer);assert.ok(over.flags.some(flag=>flag.code==='po-balance'));
    const payable=await cmd('payable-terms',{invoice:over.id,version:0,invoiceDate:over.invoiceDate,term:'Net 30',reason:'Recorded supplier terms'},buyer);await cmd('approve-payable',{invoice:over.id,version:payable.version,reason:'Unresolved remaining-balance hold'},buyer,409);
    const duplicate=await cmd('invoice',{...invoice,reference:'synthetic-purse-807a'},buyer);assert.ok(duplicate.flags.some(flag=>flag.code==='near-duplicate'));
    const duplicateTerms=await cmd('payable-terms',{invoice:duplicate.id,version:0,invoiceDate:duplicate.invoiceDate,term:'Net 30',reason:'Record evidence without clearing risk'},buyer);await cmd('approve-payable',{invoice:duplicate.id,version:duplicateTerms.version,reason:'Unresolved duplicate hold'},buyer,409);
});

test('Automatic PO generation rechecks live approval grants, current catalogue terms, currency rules and owner pause before committing',async t=>{
    const {h,cmd,rule,fields,approve,tick,item}=await fixture(t);
    await cmd('po-generation-policy',rule);
    const revoked=await approve(fields('Revoked approval grant'));
    await cmd('member',{email:'synthetic-purse-803@example.test',name:'Former approver',roles:['requester'],active:true});await tick();
    let state=(await h.state()).data;assert.ok(!state.order.some(o=>o.request===revoked.id));assert.equal(state.poGenerationQueue.find(q=>q.request===revoked.id).status,'held');
    await cmd('member',{email:'synthetic-purse-803@example.test',name:'Current approver',roles:['approver'],active:true});
    await cmd('po-generation-policy',{...rule,version:1,enabled:false});const paused=await approve(fields('Paused generation'));await tick();assert.ok(!(await h.state()).data.order.some(o=>o.request===paused.id));
    await cmd('po-generation-policy',{...rule,version:2});await cmd('catalogue',{...item,unitMinor:11000});await tick();state=(await h.state()).data;assert.ok(!state.order.some(o=>o.request===paused.id));assert.equal(state.poGenerationQueue.find(q=>q.request===paused.id).status,'held');
    await cmd('po-generation-policy',{...rule,currency:'AUD',supplier:item.supplier,version:0,enabled:false});
    assert.equal((await h.state()).data.poGenerationPolicy.filter(p=>p.currency==='AUD').length,1);
    await cmd('po-generation-policy',{...rule,version:3,combineDaily:true},h.owner,409);
});
