import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs';
import { harness } from './purse-harness.mjs';

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

test('PO generation rules create one native PO, wait above the limit and for supplier activation, retain sources and invoice holds, and send once under exact owner consent',async t=>{
    const f=await fixture(t),{h,cmd,requester,buyer,supplier,rule,fields,approve,tick}=f;
    await cmd('po-generation-policy',rule,'',401);await cmd('po-generation-policy',rule,buyer,403);await cmd('po-generation-policy',{...rule,consent:false},h.owner,400);
    await cmd('po-generation-policy',{...rule,automaticSending:true,sendConsent:true});
    const ready=await approve(fields('Approved catalog kit')),manual=await approve(fields('High amount buyer review','11'));
    const form=await cmd('intake-form',{name:'New supplier goods',purchaseType:'goods',version:0,consent:true});
    const draft=await cmd('intake-draft',{fields:{...fields('Pending caterer'),intakeForm:form.id,supplier:'',lines:[{description:'Catering',quantity:'1',unitMinor:90000,category:'Hardware',project:'Operations'}]},proposal:{name:'Canyon Event Catering',contactEmail:'synthetic-purse-806@catering.example.test',reason:'Event caterer not yet reviewed',consent:true}},requester);
    const pending=await cmd('intake-complete',{id:draft.id,version:draft.version,consent:true},requester);
    await cmd('submit',{id:pending.id,revision:pending.revision},requester);await cmd('decision',{id:pending.id,revision:pending.revision,decision:'approved',reason:'Purchase approved while vendor is pending'},f.approver);
    await cmd('po-generation-policy',{...rule,purchaseType:'goods',automaticSending:true,sendConsent:true});
    const n=h.messages.length;await Promise.all([tick(),tick()]);await tick();
    let state=(await h.state()).data,order=state.order.find(o=>o.request===ready.id);
    assert.ok(order);assert.equal(order.status,'issued');assert.equal(state.order.filter(o=>o.request===ready.id).length,1);assert.equal(h.messages.length,n+1,'The approved catalog PO is sent once under the standing rule');assert.equal((await h.send('/api/purse/order-send/'+order.id,undefined,buyer)).value.event.status,'accepted');
    assert.equal(order.lines[0].sourceLine,ready.lines[0].id);assert.equal(order.lines[0].category,ready.lines[0].category);assert.deepEqual(order.lines[0].allocations,ready.lines[0].allocations);
    assert.equal(state.poGenerationQueue.find(q=>q.request===manual.id).status,'manual-review');assert.equal(state.poGenerationQueue.find(q=>q.request===pending.id).status,'waiting-supplier');assert.ok(!state.order.some(o=>o.request===pending.id));
    await cmd('convert',{id:ready.id,revision:1},buyer,409);
    await cmd('supplier',{id:pending.supplier,name:'Canyon Event Catering',status:'active',reason:'Independent supplier administrator reviewed and activated',contacts:[{name:'Caterer',email:'synthetic-purse-806@catering.example.test'}]});
    await Promise.all([tick(),tick()]);await tick();state=(await h.state()).data;
    assert.equal(state.order.filter(o=>o.request===pending.id).length,1);assert.equal(state.decision.filter(d=>d.request===pending.id&&d.decision==='approved').length,1);assert.equal(h.messages.length,n+2);
    await cmd('po-generation-review',{id:manual.id,revision:1},requester,403);await cmd('po-generation-review',{id:manual.id,revision:0},buyer,409);await cmd('po-generation-review',{id:manual.id,revision:1},buyer);
    const invoice={order:order.id,reference:'synthetic-purse-807',source:'Supplier invoice source',invoiceDate:'2026-10-23',allocations:[{line:order.lines[0].id,quantity:'0.5',amountMinor:5000}]};
    const captured=await cmd('invoice',invoice,buyer);assert.equal((await cmd('invoice',invoice,buyer)).id,captured.id);await cmd('invoice',{...invoice,source:'Changed source under the same supplier reference'},buyer,409);
    const over=await cmd('invoice',{...invoice,reference:'synthetic-purse-808',allocations:[{line:order.lines[0].id,quantity:'1',amountMinor:10000}]},buyer);assert.ok(over.flags.some(flag=>flag.code==='po-balance'));
    const payable=await cmd('payable-terms',{invoice:over.id,version:0,invoiceDate:over.invoiceDate,term:'Net 30',reason:'Recorded supplier terms'},buyer);await cmd('approve-payable',{invoice:over.id,version:payable.version,reason:'Unresolved remaining-balance hold'},buyer,409);
    assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records').all()).results),true);
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
    const renewed=await cmd('po-generation-policy',{...rule,version:2});await cmd('po-generation-resume',{id:renewed.id,version:renewed.version,consent:true,reason:'Resume exact owner-reviewed rule'});await cmd('catalogue',{...item,unitMinor:11000});await tick();state=(await h.state()).data;assert.ok(!state.order.some(o=>o.request===paused.id));assert.equal(state.poGenerationQueue.find(q=>q.request===paused.id).status,'held');
    await cmd('po-generation-policy',{...rule,currency:'AUD',supplier:item.supplier,version:0,enabled:false});
    assert.equal((await h.state()).data.poGenerationPolicy.filter(p=>p.currency==='AUD').length,1);
    const daily=await cmd('po-generation-policy',{...rule,version:4,combineDaily:true});assert.equal(daily.enabled,false,'Every edited rule pauses until the owner reconsents');
});


test('Owner-consented automatic supplier sending claims the exact rule and revision once, never resends uncertainty, and pauses on rule or owner change',async t=>{
    let f,observedClaim=false;
    f=await fixture(t,{mail:async message=>{
        if(message.subject.startsWith('Purchase order:')){
            const claimed=await f.h.db.prepare("SELECT value FROM p_records WHERE kind='orderSend'").first();
            assert.equal(JSON.parse(claimed.value).status,'uncertain');observedClaim=true;
            return new Response('synthetic-purse-809',{status:500});
        }
        return Response.json({id:crypto.randomUUID()});
    }});
    const {h,cmd,rule,fields,approve,tick}=f;
    await cmd('po-generation-policy',{...rule,automaticSending:true},h.owner,400);
    let policy=await cmd('po-generation-policy',{...rule,automaticSending:true,sendConsent:true});
    const request=await approve(fields('Once-only supplier send'));
    const before=h.messages.length;await Promise.all([tick(),tick()]);await tick();
    let state=(await h.state()).data,order=state.order.find(order=>order.request===request.id);
    assert.ok(order);assert.equal(h.messages.length,before+1);assert.equal(observedClaim,true);
    let sent=await h.send('/api/purse/order-send/'+order.id,undefined,h.owner);
    assert.equal(sent.value.event.status,'uncertain');
    const row=await h.db.prepare("SELECT value FROM p_records WHERE kind='orderSend' AND id=?").bind('order-send:'+order.id).first();
    assert.deepEqual(JSON.parse(row.value).standingRule,{policy:policy.id,version:1,contact:'primary-on-file'});
    assert.equal(JSON.parse(row.value).revision,request.revision);
    await tick();assert.equal(h.messages.length,before+1,'An uncertain attempt is never automatically resent');
    policy=await cmd('po-generation-policy',{...rule,version:1,automaticSending:true,sendConsent:true});
    const waiting=await approve(fields('Changed rule pauses generation'));await tick();assert.equal(policy.enabled,false);assert.ok(!(await h.state()).data.order.some(order=>order.request===waiting.id));
    await cmd('po-generation-resume',{id:policy.id,version:policy.version,consent:true,sendConsent:false,reason:'Missing renewed send consent'},h.owner,400);
    await cmd('po-generation-resume',{id:policy.id,version:policy.version,consent:true,sendConsent:true,reason:'Owner explicitly resumes exact rule and current contact'});
    await tick();assert.equal(h.messages.filter(message=>message.subject.startsWith('Purchase order:')).length,2);
    const ended=await approve(fields('Departed owner has no standing authority'));
    const successor=await h.member('synthetic-purse-810@example.test',['buyer'],'owner');
    const operators=await h.send('/auth/operators',undefined,successor);
    const oldOwner=operators.value.find(operator=>operator.email==='owner@example.test');
    const step=await h.send('/auth/step-up',{action:'owner:transfer'},successor);assert.equal(step.status,202);
    const challenge=[...h.messages].reverse().find(message=>message.to.includes('synthetic-purse-810@example.test'));
    const token=new URL(challenge.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
    assert.equal((await h.send('/auth/confirm',{token},successor)).status,303);
    assert.equal((await h.send('/auth/operator/role',{operatorId:oldOwner.id,role:'member'},successor)).status,200);await tick();
    assert.equal((await h.db.prepare("SELECT COUNT(*) AS n FROM p_records WHERE kind='order' AND json_extract(value,'$.request')=?").bind(ended.id).first()).n,0);
    assert.equal(h.messages.filter(message=>message.subject.startsWith('Purchase order:')).length,2);
    assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records').all()).results),true);
});


test('Daily automatic combination issues one source-linked PO and supplier send per UTC day, leaving later approvals for the next day',async t=>{
    const {h,cmd,rule,fields,approve}=await fixture(t);
    await cmd('po-generation-policy',{...rule,combineDaily:true,automaticSending:true,sendConsent:true});
    const a=await approve(fields('Daily studio kit A')),b=await approve(fields('Daily studio kit B','2'));
    const tick=async instant=>{const response=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+Date.parse(instant));assert.equal(response.status,200,await response.text());};
    // A fixed future instant keeps the UTC-day boundary independent of the test host clock.
    await tick('2040-01-05T12:00:00Z');
    let state=(await h.state()).data;assert.equal(state.order.length,1);const combined=state.order[0];
    assert.equal(combined.sources.length,2);assert.equal(combined.totalMinor,30000);
    assert.deepEqual(combined.sources.map(source=>source.request).sort(),[a.id,b.id].sort());
    assert.ok(state.poGenerationQueue.filter(row=>[a.id,b.id].includes(row.request)).every(row=>row.order===combined.id));
    assert.equal(h.messages.filter(message=>message.subject.startsWith('Purchase order:')).length,1);
    const later=await approve(fields('Later daily studio kit'));
    await Promise.all([tick('2040-01-05T13:00:00Z'),tick('2040-01-05T13:00:00Z')]);
    assert.equal((await h.state()).data.order.length,1);
    await tick('2040-01-06T00:00:00Z');state=(await h.state()).data;
    assert.equal(state.order.length,2);assert.ok(state.order.some(order=>order.sources.some(source=>source.request===later.id)));
    assert.equal(h.messages.filter(message=>message.subject.startsWith('Purchase order:')).length,2);
    assert.equal(validatePurchasingArchive((await h.db.prepare('SELECT * FROM p_records').all()).results),true);
});
