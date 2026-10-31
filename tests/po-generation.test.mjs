import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { harness } from './purse-harness.mjs';
import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { reauthenticateErasure } from './erasure-flow.mjs';
import { termsPdf } from './po-documents-fixtures.mjs';
import { pdfContent } from './pdf-content.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';

async function fixture(t,options={}) {
    const h=await harness({protectedKey:createHash('sha256').update('synthetic-purse-801').digest('hex'),...options});t.after(()=>h.close());const cmd=h.command;
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
    await automaticSendJourney(t);
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
    await historicalConsentErasure(t);
    await automaticSendFences(t);
});

async function historicalConsentErasure(t) {
    for(const paused of [false,true]) {
        const {h,cmd,supplier,rule,fields,approve,tick}=await fixture(t);
        const former=supplier.contacts[0].email,replacement=['synthetic-purse-834','example.test'].join('@');
        const consent={...rule,supplier:supplier.id,sendEnabled:true,sendConsent:true,sendRecipient:former};
        await cmd('po-generation-policy',consent);
        await cmd('supplier',{...supplier,contacts:[{name:'Replacement supplier contact',email:replacement}]});
        if(paused)await cmd('po-generation-policy',{...consent,version:1,sendEnabled:false});
        assert.equal((await h.state()).data.order.length,0,'No purchase snapshot or send can identify the former contact');
        assert.equal(h.messages.filter(m=>m.subject.startsWith('Purchase order:')).length,0);
        await reauthenticateErasure(h);
        const meta=await h.send('/api/purse/erasure',undefined,h.owner);
        const preview=await h.send('/api/purse/erasure/preview',{kind:'contact',id:supplier.id,email:former,revision:meta.value.revision},h.owner);
        assert.equal(preview.status,200,JSON.stringify(preview.value));
        assert.ok(meta.value.choices.some(c=>c.kind==='contact'&&c.id===supplier.id&&c.email===former),'Consent-only historical contacts remain selectable');
        assert.ok(preview.value.fields.some(f=>f.kind==='poGenerationPolicy'&&f.path.includes('history')&&f.path.includes('sendRecipient')));
        const erased=await h.send('/api/purse/erasure/execute',{...preview.value.subject,revision:preview.value.revision,review:preview.value.review,fingerprint:preview.value.fingerprint,consent:true},h.owner);
        assert.equal(erased.status,200,JSON.stringify(erased.value));
        const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;
        assert.ok(!JSON.stringify(rows).includes(former),'Erasure removes all current and historical consent copies');
        const policy=JSON.parse(rows.find(r=>r.kind==='poGenerationPolicy').value);
        assert.equal(policy.history.length,paused?2:1,'Anonymous consent revisions remain intact');
        assert.ok(policy.history[0].sendRecipient.endsWith('@erased.invalid'));
        assert.equal(policy.sendEnabled,!paused);
        const after=await h.send('/api/purse/erasure',undefined,h.owner);
        assert.ok(!after.value.choices.some(c=>c.email===former));
        assert.ok(after.value.choices.some(c=>c.id===supplier.id&&c.email===replacement),'The replacement contact is preserved');
        await approve(fields('Erased historical consent cannot send'));await tick();
        assert.equal(h.messages.filter(m=>m.subject.startsWith('Purchase order:')).length,0);
        const archive=join(h.dir,'historical-consent.rer');
        assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records').all()).results),true);
        await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive,[]);
        const restored=await harness();t.after(()=>restored.close());
        await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[]);
        assert.ok(!JSON.stringify((await restored.db.prepare('SELECT * FROM p_records').all()).results).includes(former));
        const restoredTick=await restored.mf.dispatchFetch(restored.origin+'/cdn-cgi/local/scheduled?time='+Date.now());
        assert.equal(restoredTick.status,200);assert.equal(restored.messages.filter(m=>m.subject.startsWith('Purchase order:')).length,0);
    }
    console.log('PROBE PO-008 B: native consent command, contact replacement, erasure preview and execute -> current and history-only former contacts erased; replacement retained; scheduled and restored sends remain inert');
}

async function automaticSendJourney(t) {
    let f,uncertain=false,claimed=0;
    f=await fixture(t,{mail:async message=>{
        if(message.subject.startsWith('Purchase order:')) {
            const row=await f.h.db.prepare("SELECT value FROM p_records WHERE kind='orderSend' ORDER BY rowid DESC LIMIT 1").first();
            assert.equal(JSON.parse(row.value).status,'uncertain','The durable claim precedes the only network attempt');claimed++;
            if(uncertain)throw new Error('Synthetic network outcome unknown');
        }
        return Response.json({id:crypto.randomUUID()});
    }});
    const {h,cmd,supplier,fields,approve,tick,buyer}=f,recipient=supplier.contacts[0].email;
    const profile=(await h.state()).data.poProfile[0],terms=await termsPdf('synthetic-purse-831 exact approved original');
    await cmd('po-profile',{...profile,version:profile.version,termsFile:{name:'synthetic-purse-831.pdf',base64:terms}});
    const rule={...f.rule,supplier:supplier.id,sendEnabled:true,sendConsent:true,sendRecipient:recipient};
    await cmd('po-generation-policy',{...rule,sendConsent:false},h.owner,400);
    await cmd('po-generation-policy',{...rule,supplier:'*'},h.owner,400);
    await cmd('po-generation-policy',rule,buyer,403);
    await cmd('po-generation-policy',rule);
    const ready=await approve(fields('Standing-consented native goods')),manual=await approve(fields('Standing amount cap','11'));
    await Promise.all([tick(),tick()]);await tick();
    let data=(await h.state()).data,order=data.order.find(o=>o.request===ready.id);
    const event=JSON.parse((await h.db.prepare("SELECT value FROM p_records WHERE kind='orderSend' AND id=?").bind('order-send:'+order.id).first()).value);
    assert.equal(event.status,'accepted');assert.equal(event.standingConsent.version,1);assert.equal(claimed,1);
    assert.equal(data.order.filter(o=>o.request===ready.id).length,1);assert.ok(!data.order.some(o=>o.request===manual.id));
    const message=h.messages.find(m=>m.subject.startsWith('Purchase order:')),link=message.text.match(/http:\/\/[^\s]+\/api\/purse\/order-link\/[^\s]+/)[0];
    assert.deepEqual(message.to,[recipient]);assert.equal(message.attachments.length,2);
    const sentBytes=Buffer.from(message.attachments[0].content,'base64');
    assert.equal(createHash('sha256').update(sentBytes).digest('hex'),event.pdf.sha256);
    const pdf=await pdfContent(new Uint8Array(sentBytes));assert.match(pdf.text,/Studio supply kit/);assert.match(pdf.text,/100.00/);
    assert.deepEqual(Buffer.from(message.attachments[1].content,'base64'),Buffer.from(terms,'base64'));
    assert.deepEqual(Buffer.from(await(await fetch(link+'/pdf')).arrayBuffer()),sentBytes);
    assert.deepEqual(Buffer.from(await(await fetch(link+'/original/0')).arrayBuffer()),Buffer.from(terms,'base64'));
    const manualSend={order:order.id,revision:order.revision,recipient,reason:'Competing explicit buyer send',consent:true};
    const race=await Promise.all([tick(),h.send('/api/purse/order-send',manualSend,buyer),tick()]);
    assert.equal(race[1].status,409);assert.equal(claimed,1);
    const audit=await h.send('/api/purse/audit.csv?subject='+order.id,undefined,h.owner);
    assert.ok(audit.value.includes('order-send-claimed'));assert.ok(audit.value.includes(event.pdf.sha256));
    uncertain=true;const unknown=await approve(fields('Uncertain standing attempt'));await tick();await tick();
    data=(await h.state()).data;const uncertainOrder=data.order.find(o=>o.request===unknown.id);
    assert.equal((await h.send('/api/purse/order-send/'+uncertainOrder.id,undefined,buyer)).value.event.status,'uncertain');
    assert.equal(claimed,2);assert.equal((await h.send('/api/purse/order-send',{...manualSend,order:uncertainOrder.id},buyer)).status,409);await tick();assert.equal(claimed,2);
    // Unsent approved history and frozen sent evidence restore without native authority.
    const waiting=await approve(fields('Restored unsent approval')),archive=join(h.dir,'standing.rer');
    await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive,[]);
    const restored=await harness();t.after(()=>restored.close());
    await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[]);
    assert.equal((await restored.db.prepare('SELECT count(*) n FROM p_order_send_links').first()).n,0);
    const restoredTick=await restored.mf.dispatchFetch(restored.origin+'/cdn-cgi/local/scheduled?time='+Date.now());assert.equal(restoredTick.status,200);
    const restoredData=(await restored.state()).data;
    assert.ok(!restoredData.order.some(o=>o.request===waiting.id));assert.equal(restored.messages.filter(m=>m.subject.startsWith('Purchase order:')).length,0);
    assert.equal(validatePurchasingArchive((await restored.db.prepare('SELECT * FROM p_records').all()).results),true);
    // Directory edits cannot rewrite the already claimed PDF or originals.
    await cmd('supplier',{...supplier,name:'synthetic-purse-832 changed directory'});
    assert.deepEqual(Buffer.from(await(await fetch(link+'/pdf')).arrayBuffer()),sentBytes);
    await reauthenticateErasure(h);
    const meta=await h.send('/api/purse/erasure',undefined,h.owner),preview=await h.send('/api/purse/erasure/preview',{kind:'contact',id:supplier.id,email:recipient,revision:meta.value.revision},h.owner);
    assert.equal(preview.status,200,JSON.stringify(preview.value));
    const erased=await h.send('/api/purse/erasure/execute',{...preview.value.subject,revision:preview.value.revision,review:preview.value.review,fingerprint:preview.value.fingerprint,consent:true},h.owner);
    assert.equal(erased.status,200,JSON.stringify(erased.value));await tick();assert.equal(claimed,2);
    assert.equal((await fetch(link+'/pdf')).status,410);
    const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.ok(!JSON.stringify(rows).includes(recipient));assert.equal(validatePurchasingArchive(rows),true);
    console.log('PROBE PO-008 standing send: native scheduled handler -> one accepted frozen PDF and original; competing buyer send 409; unknown outcome attempted once; cap held; audit, restore and erasure passed');
}
async function automaticSendFences(t) {
    const f=await fixture(t),{h,cmd,supplier,fields,approve,tick}=f;
    const rule={...f.rule,supplier:supplier.id,sendEnabled:true,sendConsent:true,sendRecipient:supplier.contacts[0].email};
    await cmd('po-generation-policy',rule);
    const off=await approve(fields('Paused sending consent'));
    await cmd('po-generation-policy',{...rule,version:1,sendEnabled:false});await tick();
    let data=(await h.state()).data,order=data.order.find(o=>o.request===off.id);assert.ok(order);
    assert.equal((await h.send('/api/purse/order-send/'+order.id,undefined,f.buyer)).value.event,null);
    await cmd('po-generation-policy',{...rule,version:2});
    const changed=await approve(fields('Changed supplier requires renewed consent'));
    await cmd('supplier',{...supplier,contacts:[{...supplier.contacts[0],name:'Changed contact'}]});await tick();
    data=(await h.state()).data;order=data.order.find(o=>o.request===changed.id);assert.ok(order);
    assert.equal((await h.send('/api/purse/order-send/'+order.id,undefined,f.buyer)).value.event,null);
    assert.match(data.poGenerationQueue.find(row=>row.request===changed.id).reason,/renew sending consent/);
    await cmd('po-generation-policy',{...rule,version:3});
    // An old generation policy cannot borrow renewed consent; a new approval uses it.
    await tick();assert.equal(h.messages.filter(m=>m.subject.startsWith('Purchase order:')).length,0);
    const renewed=await approve(fields('Renewed current supplier consent'));await tick();
    assert.equal(h.messages.filter(m=>m.subject.startsWith('Purchase order:')).length,1);
    const ownerMessage=h.messages.find(message=>message.subject.startsWith('Purchase order:')),ownerLink=ownerMessage.text.match(/http:\/\/[^\s]+\/api\/purse\/order-link\/[^\s]+/)[0];
    // A scheduler and an explicit buyer race for an as-yet unclaimed send.
    await h.configureMail({MAIL_PROVIDER:''});
    const raced=await approve(fields('Manual and scheduled first-send race'));await tick();
    const raceOrder=(await h.state()).data.order.find(order=>order.request===raced.id);
    assert.equal((await h.send('/api/purse/order-send/'+raceOrder.id,undefined,f.buyer)).value.event,null);
    await h.configureMail({MAIL_PROVIDER:'resend'});
    const races=await Promise.all([tick(),h.send('/api/purse/order-send',{order:raceOrder.id,revision:raceOrder.revision,recipient:rule.sendRecipient,consent:true,reason:'Explicit competing buyer action'},f.buyer),tick()]);
    assert.ok([200,409].includes(races[1].status));await tick();
    assert.equal(h.messages.filter(message=>message.subject.startsWith('Purchase order:')).length,2);
    assert.equal((await h.state()).data.order.filter(order=>order.request===raced.id).length,1);
    const revoked=await approve(fields('Revoked owner before execution'));
    const former=(await h.state()).actor.id;
    const newOwner=await h.member(['synthetic-purse-833','example.test'].join('@'),['buyer'],'owner');
    const demoted=await h.send('/auth/operator/role',{operatorId:former,role:'member'},h.owner);assert.equal(demoted.status,200,JSON.stringify(demoted.value));await tick();
    data=(await h.state(newOwner)).data;assert.ok(!data.order.some(o=>o.request===revoked.id));
    assert.equal(data.order.filter(o=>o.request===renewed.id).length,1);
    assert.equal(h.messages.filter(m=>m.subject.startsWith('Purchase order:')).length,2);
    assert.equal((await fetch(ownerLink+'/pdf')).status,410,'A standing-send supplier link cannot outlive its native owner authority');
    console.log('PROBE PO-008 consent fences: native policy command and scheduler -> default off, pause, changed contacts and owner transfer refuse further sends; renewed exact consent sends once');
}
