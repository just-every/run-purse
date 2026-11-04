import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';
import { harness } from './purse-harness.mjs';
import { reauthenticateErasure } from './erasure-flow.mjs';
import { approvalEmailFixture, email, preference, rows, refuseUnchanged } from './approval-email-fixture.mjs';
const decision = verb => ({decision:verb,confirm:true,reason:'synthetic-purse-6840 exact source review'});

test('Native email approval confirms all decisions through current sessions and the ordinary audited budget command exactly once', async t => {
    const f = await approvalEmailFixture(t), {h} = f;
    for (const verb of ['approved','rejected','returned']) {
        const r = await f.create(), link = await f.link(r);
        const before = await rows(h);
        for (let read=0;read<2;read++) {
            const opened = await h.send(link.path,undefined,f.approver); assert.equal(opened.status,200,JSON.stringify(opened.value));
            assert.equal(opened.value.title,r.title); assert.equal(opened.value.totalMinor,100000); assert.equal(opened.value.revision,1);
        }
        const head = await h.mf.dispatchFetch(h.origin+link.path,{method:'HEAD',headers:{cookie:f.approver}});
        assert.equal(head.status,200); assert.deepEqual(await rows(h),before,'Opening and prefetching never record a decision or consume a link');
        await refuseUnchanged(h,link.path,decision(verb),'',401);
        await refuseUnchanged(h,link.path,decision(verb),f.other,403);
        await refuseUnchanged(h,link.path,decision(verb),f.requester,403);
        await refuseUnchanged(h,link.path,{...decision(verb),confirm:false},f.approver,400);
        await refuseUnchanged(h,link.path,{...decision(verb),reason:''},f.approver,400);
        const foreign = await h.mf.dispatchFetch(h.origin+link.path,{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json',cookie:f.approver},body:JSON.stringify(decision(verb))});
        assert.equal(foreign.status,403); assert.deepEqual(await rows(h),before);
        const responses = await Promise.all([h.send(link.path,decision(verb),f.approver),h.send(link.path,decision(verb),f.approver)]);
        assert.equal(responses.filter(r=>r.status===200).length,1);
        assert.ok(responses.filter(r=>r.status!==200).every(r=>r.status===409));
        const state = (await h.state()).data, decisions = state.decision.filter(d=>d.request===r.id);
        assert.equal(state.request.find(x=>x.id===r.id).status,verb); assert.equal(decisions.length,1);
        assert.equal(decisions[0].reason,decision(verb).reason); assert.equal(decisions[0].actor,(await h.state(f.approver)).actor.id);
        assert.equal(state.commitment.filter(e=>e.request===r.id).reduce((sum,e)=>sum+e.amountMinor,0),verb==='approved'?100000:0);
        const audit = await h.send('/api/purse/audit',undefined,h.owner); assert.equal(audit.status,200);
        assert.ok(JSON.stringify(audit.value).includes(decisions[0].id));
        const csv = await h.send('/api/purse/audit.csv',undefined,h.owner); assert.equal(csv.status,200);
        assert.ok(csv.value.includes('approval-email-confirmed')); assert.ok(csv.value.includes(decision(verb).reason));
        await refuseUnchanged(h,link.path,decision(verb),f.approver,409);
        if (verb==='returned') {
            await h.command('submit',{id:r.id,revision:1},f.requester);
            await refuseUnchanged(h,link.path,decision('approved'),f.approver,409);
            const fresh = await f.link(r); assert.notEqual(fresh.path,link.path,'Same-revision resubmission creates a new source locator');
            assert.equal((await h.send(fresh.path,decision('approved'),f.approver)).status,200);
        }
    }
    // Two different email approvals compete for the one remaining $1,000 of budget.
    await h.command('policy',{...f.policy,budgetMinor:300000});
    const candidates = [await f.create(),await f.create()];
    const links = await Promise.all(candidates.map(f.link));
    const competing = await Promise.all(links.map(link=>h.send(link.path,decision('approved'),f.approver)));
    assert.equal(competing.filter(r=>r.status===200).length,1);
    assert.ok(competing.filter(r=>r.status!==200).every(r=>r.status===409));
    const budget = (await h.state()).data;
    assert.equal(budget.commitment.reduce((sum,e)=>sum+e.amountMinor,0),300000);
    assert.equal(budget.decision.filter(d=>candidates.some(r=>r.id===d.request)).length,1);
    await h.command('policy',f.policy);
    // Sequential singleton steps retain the existing reservation and independent final approval.
    await h.command('notification-preferences',{...preference,version:0},f.other);
    await h.command('policy',{...f.policy,approvalSteps:[{email:email(6803)}]});
    const chain = await f.create(), first = await f.link(chain);
    assert.equal((await h.send(first.path,decision('approved'),f.approver)).value.status,'pending');
    const notice = (await h.send('/api/purse/notifications',undefined,f.other)).value.items.find(n=>n.record===chain.id&&n.actionable);
    const message = h.messages.findLast(m=>m.subject==='Your Purse notification'&&m.to.includes(email(6803)));
    const url = new URL(message.text.match(/http:\/\/\S+approvalEmail=\S+/)[0]);
    assert.equal(url.searchParams.get('approvalEmail'),notice.id);
    const next = '/api/purse/approval-email/'+notice.id+'/'+url.searchParams.get('source');
    assert.equal((await h.send(next,decision('approved'),f.other)).value.status,'approved');
    const state = (await h.state()).data;
    assert.equal(state.decision.filter(d=>d.request===chain.id).length,2);
    assert.equal(state.commitment.filter(e=>e.request===chain.id).reduce((sum,e)=>sum+e.amountMinor,0),100000);
    // The same native request door supports every configured ordinary purchase type.
    for (const purchaseType of ['software','services','contractors','equipment']) {
        const form = await h.command('intake-form',{name:'synthetic-purse-6841 '+purchaseType,purchaseType,consent:true});
        await h.command('policy',{...f.policy,id:undefined,category:purchaseType});
        const request = await f.create({intakeForm:form.id,lines:[{...f.draft.lines[0],category:purchaseType}]});
        const link = await f.link(request);
        assert.equal((await h.send(link.path,decision('approved'),f.approver)).status,200);
        assert.equal((await h.state()).data.commitment.filter(e=>e.request===request.id).reduce((sum,e)=>sum+e.amountMinor,0),100000);
    }
    assert.equal(validatePurchasingArchive(await rows(h)),true);
});

test('Email locators refuse stale sources, changed authority and restored or erased identities without reviving purchasing authority', async t => {
    const f = await approvalEmailFixture(t), {h} = f;
    const amended = await f.create(), old = await f.link(amended);
    await h.command('amend',{...amended,revision:1,title:'synthetic-purse-6850 revised',reason:'synthetic-purse-6851 changed terms'},f.requester);
    await refuseUnchanged(h,old.path,decision('approved'),f.approver,409);
    const pending = await f.create(), saved = await f.link(pending);
    // A changed policy cannot be approved from a message sent under the old version.
    await h.command('policy',{...f.policy,approver:email(6803)});
    await refuseUnchanged(h,saved.path,decision('approved'),f.approver,409);
    await h.command('policy',f.policy);
    await refuseUnchanged(h,saved.path,decision('approved'),f.approver,409);
    const scoped = await f.create(), scopedLink = await f.link(scoped);
    await h.command('member',{email:email(6802),name:'synthetic-purse-6852',active:true,grants:[{role:'approver',scope:{locations:['Denver']}}]});
    await refuseUnchanged(h,scopedLink.path,decision('approved'),f.approver,409);
    await h.command('member',{email:email(6802),name:'synthetic-purse-6852',active:true,roles:['approver']});
    const assigned = await f.create(), assignedLink = await f.link(assigned);
    await h.command('delegation',{policy:f.policy.id,delegate:email(6803),expires:'2026-11-06T12:00:00Z',reason:'synthetic-purse-6853 delegate'},f.approver);
    await refuseUnchanged(h,assignedLink.path,decision('approved'),f.approver,409);
    await refuseUnchanged(h,assignedLink.path,decision('approved'),f.other,403);
    const delegation = (await h.state()).data.delegation[0]; await h.command('revoke-delegation',{id:delegation.id},f.approver);
    // A self-request produces no recipient link even when the policy names that approver.
    const mailCount = h.messages.filter(m=>m.subject==='Your Purse notification').length;
    await h.command('member',{email:email(6802),name:'synthetic-purse-6854',roles:['requester','approver'],active:true});
    const self = await f.create({},f.approver);
    await h.command('decision',{id:self.id,revision:1,...decision('approved')},f.approver,403);
    assert.ok(!(await h.send('/api/purse/notifications',undefined,f.approver)).value.items.some(n=>n.record===self.id));
    assert.equal(h.messages.filter(m=>m.subject==='Your Purse notification').length,mailCount);
    const completed = await f.create(), completedLink = await f.link(completed);
    assert.equal((await h.send(completedLink.path,decision('approved'),f.approver)).status,200);
    const originalDecision = (await h.state()).data.decision.find(d=>d.request===completed.id);
    const fresh = await f.create(), link = await f.link(fresh);
    const archive = join(h.dir,'synthetic-purse-6855.rer'), service = await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability});
    await exportArchive(service,archive,[]);
    const restored = await harness({empty:true}); t.after(()=>restored.close());
    await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[]);
    const bootstrap = await restored.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'synthetic-purse-6856'});
    assert.equal(bootstrap.status,303);
    await refuseUnchanged(restored,link.path,decision('approved'),bootstrap.cookie,403);
    assert.equal((await restored.send(link.path,decision('approved'),f.approver)).status,401);
    const historical = (await rows(restored)).filter(r=>['notificationDelivery','notification','decision'].includes(r.kind));
    assert.ok(historical.some(r=>r.kind==='notificationDelivery' && JSON.parse(r.value).approvalEmail));
    assert.deepEqual(JSON.parse(historical.find(r=>r.kind==='decision' && r.id===originalDecision.id).value),originalDecision);
    const invited = await restored.send('/api/purse/invite',{email:email(6802)},bootstrap.cookie); assert.equal(invited.status,200);
    const invitation = restored.messages.findLast(m=>m.to.includes(email(6802)));
    const token = new URL(invitation.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
    const signedIn = await restored.send('/auth/confirm',{token}); assert.equal(signedIn.status,303);
    await refuseUnchanged(restored,link.path,decision('approved'),signedIn.cookie,403);
    await h.db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE id=(SELECT id FROM oa_sessions WHERE operator_id=? LIMIT 1)').bind(Date.now(),(await h.state(f.approver)).actor.id).run();
    await refuseUnchanged(h,link.path,decision('approved'),f.approver,401);
    await h.command('member',{email:email(6802),name:'synthetic-purse-6854',active:false,roles:['approver']});
    await reauthenticateErasure(h);
    const inventory = await h.send('/api/purse/erasure',undefined,h.owner);
    const preview = await h.send('/api/purse/erasure/preview',{kind:'member',id:email(6802),revision:inventory.value.revision},h.owner); assert.equal(preview.status,200,JSON.stringify(preview.value));
    const erased = await h.send('/api/purse/erasure/execute',{...preview.value.subject,revision:preview.value.revision,review:preview.value.review,fingerprint:preview.value.fingerprint,consent:true},h.owner); assert.equal(erased.status,200,JSON.stringify(erased.value));
    assert.ok(!JSON.stringify(await rows(h)).includes(email(6802)));
    assert.equal(validatePurchasingArchive(await rows(h)),true);
    await refuseUnchanged(h,link.path,decision('approved'),h.owner,403);
    await refuseUnchanged(h,link.path,decision('approved'),f.approver,401);
});
