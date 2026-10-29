import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import { harness } from './purse-harness.mjs';
import { reauthenticateErasure } from './erasure-flow.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceMatchingFixture,matchingMail} from './invoice-matching-fixture.mjs';
import {validatePurchasingArchive} from '../scripts/installer/restore-validation.mjs';
import portability from '../scripts/installer/portability.mjs';

test('Native invoice matching approves exact and bounded goods once, holds exceptions, retains cash dates, scope and non-executable archive history',async t=>{
    const f=await invoiceMatchingFixture();t.after(()=>f.h.close());const {h,cmd,buyer}=f;
    const rule=await f.rule();
    const exactOrder=await f.order(),exactSource=await f.stage(exactOrder),exact=await f.confirm(exactSource);
    assert.equal(exact.paymentApproval.kind,'native-matching');assert.equal(exact.paymentApproval.lines[0].ruleVersion,1);
    let data=(await h.state()).data;
    assert.deepEqual(data.cashRequirements.bills.map(b=>[b.invoice,b.amountMinor,b.dueDate,b.discountDate,b.discountMinor,b.week]),[[exact.id,60000,'2026-11-18','2026-10-29',1200,'2026-11-16']]);
    assert.equal(data.cashRequirements.commitments[0].amountMinor,40000);
    assert.equal(data.cashRequirements.weeks.reduce((n,w)=>n+w.totalMinor,0),100000);
    const original=await h.mf.dispatchFetch(h.origin+'/api/purse/download/attachment/'+exactSource.source.attachment,{headers:{cookie:buyer}});
    assert.equal(Buffer.from(await original.arrayBuffer()).toString('base64'),exactSource.document.base64);
    const withinOrder=await f.order(),within=await f.confirm(await f.stage(withinOrder,{unitMinor:10200}));assert.equal(within.paymentApproval.amountMinor,61200);
    data=(await h.state()).data;assert.equal(data.cashRequirements.bills.find(b=>b.invoice===within.id).amountMinor,61200);assert.equal(data.cashRequirements.commitments.find(o=>o.order===withinOrder.id).amountMinor,38800);
    const aboveOrder=await f.order(),above=await f.confirm(await f.stage(aboveOrder,{unitMinor:10201}));assert.equal(above.paymentApproval,undefined);assert.match(above.matching.reasons.join(';'),/Price exceeds tolerance/);
    const earlyOrder=await f.order({received:'0'}),early=await f.confirm(await f.stage(earlyOrder));assert.equal(early.paymentApproval,undefined);assert.match(early.matching.reasons.join(';'),/Receipt shortfall/);
    const exceptions=await h.send('/api/purse/invoice-exceptions',undefined,buyer);assert.equal(exceptions.status,200);assert.ok(JSON.stringify(exceptions.value).includes(above.id));assert.ok(JSON.stringify(exceptions.value).includes(early.id));
    const excessOrder=await f.order({received:'10'}),excess=await f.confirm(await f.stage(excessOrder,{quantity:'10.001'}));assert.equal(excess.paymentApproval,undefined);assert.match(excess.matching.reasons.join(';'),/approved remaining quantity|po-balance/);
    const chargeOrder=await f.order(),charge=await f.confirm(await f.stage(chargeOrder,{freightMinor:3500}));assert.equal(charge.paymentApproval,undefined);assert.match(charge.matching.reasons.join(';'),/Unplanned/);
    const unchanged=(await h.state()).data;await cmd('matching-rule',{...rule,version:0,consent:true},h.owner,409);await cmd('matching-rule',{...rule,consent:true},buyer,403);await cmd('match-invoice',{invoice:exact.id,rule:rule.id,version:rule.version},f.requester,403);assert.deepEqual((await h.state()).data,unchanged);
    // Specific owner decisions shadow broader consent, including pauses.
    const paused=await f.rule({category:'Equipment',enabled:false,priceBps:1000,priceMinor:99999});
    const pausedOrder=await f.order(),pausedBill=await f.confirm(await f.stage(pausedOrder));assert.equal(pausedBill.paymentApproval,undefined);assert.match(pausedBill.matching.reasons.join(';'),/paused/);
    await cmd('match-invoice',{invoice:pausedBill.id,rule:paused.id,version:paused.version},buyer,409);
    const renewed=await cmd('matching-rule',{...paused,enabled:true,consent:true,priceBps:200,priceMinor:1000,reason:'Both caps remain binding'});
    await cmd('match-invoice',{invoice:pausedBill.id,rule:paused.id,version:1},buyer,409);
    const currentBefore=(await f.current(pausedBill.id)).paymentApproval;
    const competing=await Promise.all([h.send('/api/purse/command/match-invoice',{invoice:pausedBill.id,rule:renewed.id,version:renewed.version},buyer),h.send('/api/purse/command/match-invoice',{invoice:pausedBill.id,rule:renewed.id,version:renewed.version},buyer)]);
    assert.ok(competing.some(r=>r.status===200));assert.ok(competing.every(r=>[200,409].includes(r.status)));assert.equal(currentBefore,undefined);
    data=(await h.state()).data;assert.equal(data.audit.filter(e=>e.action==='invoice-matched-approved'&&e.invoice===pausedBill.id).length,1,JSON.stringify({bill:data.invoice.find(i=>i.id===pausedBill.id),events:data.audit.filter(e=>e.action==='invoice-matched-approved')}));assert.equal(data.payable.filter(p=>p.invoice===pausedBill.id).length,1);
    const capOrder=await f.order(),capBill=await f.confirm(await f.stage(capOrder,{unitMinor:10200}));assert.equal(capBill.paymentApproval,undefined,'The lower amount cap governs even at two percent');
    // A category rule is selected only when no supplier rule owns that category.
    const categoryRule=await f.rule({supplier:'*',category:'Supplies'});const otherCategory=await f.order({category:'Supplies'}),categoryBill=await f.confirm(await f.stage(otherCategory));assert.equal(categoryBill.paymentApproval.lines[0].rule,rule.id,'Supplier rule outranks category rule');assert.notEqual(categoryRule.id,rule.id);
    const secondSupplier=await cmd('supplier',{name:'Other native goods source',status:'active',reason:'Independent source'});
    const categoryOnlyOrder=await f.order({category:'Supplies',supplierId:secondSupplier.id}),categoryOnly=await f.confirm(await f.stage(categoryOnlyOrder));assert.equal(categoryOnly.paymentApproval.lines[0].rule,categoryRule.id);
    const scoped=await h.member(matchingMail(8604),['ap-clerk']);await cmd('member',{email:matchingMail(8604),name:'Scoped AP',grants:[{role:'ap-clerk',scope:{locations:['Boulder']}}]});
    await cmd('match-invoice',{invoice:above.id,rule:renewed.id,version:renewed.version},scoped,403);assert.equal((await h.send('/api/purse/download/attachment/'+exactSource.source.attachment,undefined,scoped)).status,403);
    const exportAudit=await h.send('/api/purse/audit.csv?subject='+exact.id,undefined,h.owner);assert.equal(exportAudit.status,200);assert.match(exportAudit.value,/invoice-matched-approved/);
    const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true);const corrupt=structuredClone(rows),bad=corrupt.find(r=>r.kind==='invoice'&&r.id===exact.id),badValue=JSON.parse(bad.value);badValue.paymentApproval.amountMinor++;bad.value=JSON.stringify(badValue);assert.throws(()=>validatePurchasingArchive(corrupt),/matching_approval/);assert.ok(portability.excludeTables.includes('p_matching_authority'));
    // Restore portable records into a fresh native installation: same history, no grant.
    const archive=join(h.dir,'synthetic-purse-matching.rer');
    await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive,[]);
    const fresh=await harness({empty:true});t.after(()=>fresh.close());
    await importArchive(await createPortability({db:fresh.db,buckets:{ORIGINALS:fresh.originals},policy:portability}),archive,[]);
    const boot=await fresh.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'Restored native owner'});assert.equal(boot.status,303);
    const restored=(await fresh.send('/api/purse/state',undefined,boot.cookie)).value.data;
    assert.equal(restored.matchingRule.find(r=>r.id===rule.id).currentConsent,false);
    assert.equal((await fresh.send('/api/purse/command/match-invoice',{invoice:above.id,rule:renewed.id,version:renewed.version},boot.cookie)).status,409);
    assert.deepEqual(restored.invoice.find(i=>i.id===exact.id).paymentApproval,exact.paymentApproval);
    // A revoked native owner cannot authorize a new match under historical consent.
    const otherOwner=await h.member(matchingMail(8605),['buyer'],'owner');
    await cmd('matching-rule',{...renewed,version:renewed.version,consent:true,reason:'Second owner consents'},otherOwner);
    const ownerId=(await h.state(otherOwner)).actor.id;
    await h.send('/auth/operator/status',{operatorId:ownerId,status:'inactive'},h.owner);
    await cmd('match-invoice',{invoice:above.id,rule:renewed.id,version:renewed.version+1},buyer,409);
    // Erasing the source confirmer withdraws originals, retains anonymous approval and refuses replay.
    await cmd('member',{email:f.emails.buyer,name:'Departed AP',roles:['buyer'],active:false});
    await reauthenticateErasure(h);
    const inventory=await h.send('/api/purse/erasure',undefined,h.owner);
    const preview=await h.send('/api/purse/erasure/preview',{kind:'member',id:f.emails.buyer,revision:inventory.value.revision},h.owner);assert.equal(preview.status,200,JSON.stringify(preview.value));
    const erased=await h.send('/api/purse/erasure/execute',{...preview.value.subject,revision:preview.value.revision,review:preview.value.review,fingerprint:preview.value.fingerprint,consent:true},h.owner);assert.equal(erased.status,200,JSON.stringify(erased.value));
    assert.equal((await h.send('/api/purse/download/attachment/'+exactSource.source.attachment,undefined,h.owner)).status,410);
    assert.equal((await h.send('/api/purse/command/invoice-reading-confirm',exactSource.body,buyer)).status,401);
    const anonymous=(await h.state()).data.invoice.find(i=>i.id===exact.id);assert.ok(anonymous.paymentApproval);assert.equal(anonymous.paymentApproval.documentSha256,exact.paymentApproval.documentSha256);assert.ok(!JSON.stringify(anonymous).includes(f.emails.buyer));
    const erasedRows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(erasedRows),true);

});
