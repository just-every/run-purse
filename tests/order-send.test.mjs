import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { PDFName, decodePDFRawStream } from 'pdf-lib';
import { harness } from './purse-harness.mjs';
import { pdfContent } from './pdf-content.mjs';
import { orderSendFixture, orderMessage, orderLink } from './order-send-fixture.mjs';
import { reauthenticateErasure } from './erasure-flow.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';

const publicGet = (h, path) => fetch(new URL(path,h.origin));
const ack = (h, link, revision, extra={}) => fetch(link,{method:'POST',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify({decision:'acknowledge',revision,consent:true,name:'synthetic-purse-2821',...extra})});

test('Explicit native buyer change send freezes exact numbered PDF and originals, scopes supplier acknowledgment and retains audit/archive custody', async t => {
    const h=await harness();t.after(()=>h.close());const f=await orderSendFixture(h);
    assert.equal(orderMessage(h),undefined,'Issuing and date correction never send automatically');
    const immutable=(await h.state()).data.revision.find(row=>row.request===f.request.id&&row.revision===2);
    const sent=await f.send();assert.equal(sent.status,200,JSON.stringify(sent.value));assert.equal(sent.value.status,'accepted');assert.equal(sent.value.changeLabel,'Change order 1');assert.ok(!JSON.stringify(sent.value).includes('/order-link/'));
    const link=orderLink(h),message=orderMessage(h);assert.equal(message.attachments.length,3);
    const supplier=await publicGet(h,link);assert.equal(supplier.status,200);const html=await supplier.text();
    for(const field of ['Change order 1','approved revision 2','synthetic-purse-2812','synthetic-purse-2806','synthetic-purse-2808','Vendor SKU','synthetic-purse-2818','synthetic-purse-2819','2026-11-08','2026-11-01 to 2026-11-08','Text-only prepayment terms','USD 210.50'])assert.ok(html.includes(field),field);
    const pdfResponse=await publicGet(h,link.href+'/pdf');assert.equal(pdfResponse.status,200);const bytes=Buffer.from(await pdfResponse.arrayBuffer());assert.deepEqual(bytes,Buffer.from(message.attachments[0].content,'base64'));
    const printed=await pdfContent(new Uint8Array(bytes));assert.ok(printed.text.includes('Change order 1'));assert.ok(printed.text.includes('synthetic-purse-2810'));assert.ok(printed.text.includes('synthetic-purse-2811'));
    const embedded=printed.pdf.catalog.lookup(PDFName.of('Names')).lookup(PDFName.of('EmbeddedFiles')).lookup(PDFName.of('Names'));assert.equal(embedded.size(),4);
    for(let index=0;index<2;index++) {const original=Buffer.from(index?f.certificate:f.terms,'base64');assert.deepEqual(Buffer.from(await(await publicGet(h,link.href+'/original/'+index)).arrayBuffer()),original);assert.deepEqual(Buffer.from(message.attachments[index+1].content,'base64'),original);const file=embedded.lookup(index*2+1).lookup(PDFName.of('EF')).lookup(PDFName.of('F'));assert.deepEqual(Buffer.from(decodePDFRawStream(file).decode()),original);}
    assert.equal((await publicGet(h,link.href+'/original/2')).status,404);
    assert.equal((await ack(h,link,1)).status,409);assert.equal((await ack(h,link,2,{decision:'change',unitMinor:1})).status,409);
    const cross=await fetch(link,{method:'POST',headers:{origin:'https://synthetic-purse-2822.test','content-type':'application/json'},body:'{}'});assert.equal(cross.status,403);
    const acknowledgments=await Promise.all([ack(h,link,2),ack(h,link,2)]);assert.deepEqual(acknowledgments.map(result=>result.status).sort(),[200,409]);
    const status=await h.send('/api/purse/order-send/'+f.order.id,undefined,f.requester);assert.equal(status.status,200);assert.equal(status.value.event.acknowledgment.revision,2);assert.equal(status.value.event.acknowledgment.identityVerified,false);
    await h.command('order-chase-policy',{order:f.order.id,version:0,enabled:true,cadenceDays:1,maxChases:2,escalateTo:'synthetic-purse-2804@example.test'},f.buyer);
    const acknowledgedTick=await h.mf.dispatchFetch(h.origin+'/cdn-cgi/local/scheduled?time='+(Date.parse(f.order.issuedAt)+2*86400000));assert.equal(acknowledgedTick.status,200);assert.equal((await h.state()).data.orderChaseEvent.filter(row=>row.order===f.order.id).length,0,'Current exact supplier acknowledgment stops acknowledgment-only chasing');
    assert.equal((await h.send('/api/purse/order-send/'+f.order.id,undefined,f.outsider)).status,403);assert.equal((await h.send('/api/purse/order-send/'+f.order.id,undefined,'')).status,401);
    assert.equal((await f.send()).status,409);assert.equal(h.messages.filter(mail=>mail.subject.startsWith('Change order ')).length,1);
    await h.command('supplier',{...f.supplier,name:'synthetic-purse-2823',address:'synthetic-purse-2824'});
    await h.command('po-profile',{...f.profile,legalName:'synthetic-purse-2825',version:f.profile.version});
    await h.command('supplier-order-evidence',{order:f.order.id,version:0,promisedDate:'2026-11-07',source:'Later promise'});
    assert.deepEqual(Buffer.from(await(await publicGet(h,link.href+'/pdf')).arrayBuffer()),bytes,'Later mutable evidence cannot rewrite frozen sent bytes');
    assert.deepEqual((await h.state()).data.revision.find(row=>row.request===f.request.id&&row.revision===2),immutable,'Send and acknowledgment never rewrite approved revisions');
    const history=await h.send('/api/purse/audit.csv?subject='+f.order.id,undefined,h.owner);for(const event of ['order-change-send-claimed','order-change-send-outcome','order-change-acknowledged',sent.value.pdfSha256])assert.ok(history.value.includes(event),event);
    const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true);
    const corrupt=structuredClone(rows),event=corrupt.find(row=>row.kind==='orderSend');const value=JSON.parse(event.value);value.pdf.base64=Buffer.from('%PDF-synthetic-purse-2826').toString('base64');event.value=JSON.stringify(value);assert.throws(()=>validatePurchasingArchive(corrupt),/order_send_pdf_digest/);
    const changedContent=structuredClone(rows),frozen=changedContent.find(row=>row.kind==='orderSend'),tampered=JSON.parse(frozen.value);tampered.content.sections[0].lines.push('synthetic-purse-2827');frozen.value=JSON.stringify(tampered);assert.throws(()=>validatePurchasingArchive(changedContent),/order_send_content_digest/);
    // A nominated contact exists only on this explicit send, never in the directory.
    const inventory=await h.send('/api/purse/erasure',undefined,h.owner);assert.ok(inventory.value.choices.some(choice=>choice.kind==='contact'&&choice.id===f.supplier.id&&choice.email==='synthetic-purse-2820@example.test'));
    await reauthenticateErasure(h);
    const meta=await h.send('/api/purse/erasure',undefined,h.owner),preview=await h.send('/api/purse/erasure/preview',{kind:'contact',id:f.supplier.id,email:'synthetic-purse-2820@example.test',revision:meta.value.revision},h.owner);assert.equal(preview.status,200,JSON.stringify(preview.value));assert.ok(preview.value.fields.some(field=>field.kind==='orderSend'&&field.path.includes('base64')));
    const erased=await h.send('/api/purse/erasure/execute',{...preview.value.subject,revision:preview.value.revision,review:preview.value.review,fingerprint:preview.value.fingerprint,consent:true},h.owner);assert.equal(erased.status,200,JSON.stringify(erased.value));
    for(const suffix of ['', '/pdf','/original/0'])assert.equal((await publicGet(h,link.href+suffix)).status,410);
    const erasedRows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.ok(!JSON.stringify(erasedRows).includes('synthetic-purse-2820@example.test'));assert.equal(validatePurchasingArchive(erasedRows),true);
    const quantityHarness=await harness();t.after(()=>quantityHarness.close());const quantity=await orderSendFixture(quantityHarness,{kind:'quantity'}),quantitySent=await quantity.send();assert.equal(quantitySent.status,200,JSON.stringify(quantitySent.value));assert.equal(quantitySent.value.changeLabel,'Change order 1');
    const quantityLink=orderLink(quantityHarness),quantityFace=await publicGet(quantityHarness,quantityLink);assert.match(await quantityFace.text(),/quantity: 2 to 3/);assert.equal((await ack(quantityHarness,quantityLink,2)).status,200);assert.equal((await quantityHarness.send('/api/purse/order-send/'+quantity.order.id,undefined,quantity.requester)).value.event.acknowledgment.revision,2);

});

test('Native current buyer scope, exact approval and claim-before-send prevent stale, duplicate and uncertain automatic sends', async t => {
    let h,claimed=false;
    h=await harness({mail:async message=>{if(message.subject.startsWith('Change order ')){const row=await h.db.prepare("SELECT value FROM p_records WHERE kind='orderSend'").first();assert.equal(JSON.parse(row.value).status,'uncertain');claimed=true;return new Response('unknown',{status:500});}return Response.json({id:crypto.randomUUID()});}});t.after(()=>h.close());const f=await orderSendFixture(h);
    for(const [body,cookie,status]of [[{},'',401],[{},f.requester,403],[{revision:1},f.buyer,409],[{consent:false},f.buyer,400]])assert.equal((await f.send(body,cookie)).status,status);
    await h.command('member',{email:'synthetic-purse-2804@example.test',name:'synthetic-purse-2804',active:true,grants:[{role:'buyer',scope:{locations:['Denver']}}]});assert.equal((await f.send()).status,403);
    await h.command('member',{email:'synthetic-purse-2804@example.test',name:'synthetic-purse-2804',active:true,roles:['buyer']});
    await h.command('member',{email:'synthetic-purse-2803@example.test',name:'synthetic-purse-2803',active:false,roles:['approver']});assert.equal((await f.send()).status,409,'Revoked exact approver authority holds supplier delivery');
    await h.command('member',{email:'synthetic-purse-2803@example.test',name:'synthetic-purse-2803',active:true,roles:['approver']});
    await h.configureMail({MAIL_PROVIDER:''});
    assert.equal((await f.send()).status,409,'A real unconfigured native mail binding refuses an exact approved order');
    let db=await h.mf.getD1Database('DB');assert.equal((await db.prepare("SELECT count(*) AS n FROM p_records WHERE kind='orderSend'").first()).n,0);assert.equal((await db.prepare('SELECT count(*) AS n FROM p_order_send_links').first()).n,0);
    await h.configureMail({MAIL_PROVIDER:'resend'});h.db=await h.mf.getD1Database('DB');
    const sends=await Promise.all([f.send(),f.send()]);assert.deepEqual(sends.map(result=>result.status).sort(),[200,409]);assert.equal(sends.find(result=>result.status===200).value.status,'uncertain');assert.equal(claimed,true);
    assert.equal((await f.send()).status,409);assert.equal(h.messages.filter(message=>message.subject.startsWith('Change order ')).length,1);
    const link=orderLink(h);assert.equal((await publicGet(h,link)).status,200);
    const next=await h.command('need-date-edit',{id:f.request.id,revision:2,needDate:'2026-11-09',reason:'New exact correction'},f.requester);assert.equal(next.revision,3);assert.equal((await publicGet(h,link)).status,410);assert.equal((await ack(h,link,2)).status,410);
    await h.command('member',{email:'synthetic-purse-2804@example.test',name:'synthetic-purse-2804',active:false,roles:['buyer']});assert.equal((await f.send()).status,403,'Deactivated purchasing membership refuses its retained native session');
    assert.equal((await h.send('/auth/signout',{},f.buyer)).status,204);assert.equal((await f.send()).status,401,'Revoked native session refuses the send door');
});

test('Real supplier-link expiry and explicit withdrawal fence read, original and acknowledgment doors without restoring bearer authority', async t => {
    const h=await harness();t.after(()=>h.close());const f=await orderSendFixture(h);
    const started=Date.now(),expiresAt=new Date(started+4000).toISOString(),sent=await f.send({expiresAt});assert.equal(sent.status,200,JSON.stringify(sent.value));const link=orderLink(h);assert.equal((await publicGet(h,link)).status,200);
    await delay(Math.max(0,Date.parse(expiresAt)-Date.now()+30));
    for(const suffix of ['', '/pdf','/original/0'])assert.equal((await publicGet(h,link.href+suffix)).status,410);assert.equal((await ack(h,link,2)).status,410);
    const revoke=await h.send('/api/purse/order-send/'+f.order.id+'/revoke',{},f.buyer);assert.equal(revoke.status,200);
    const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true);
    assert.ok(!JSON.stringify(rows).includes(link.pathname.split('/').at(-1)),'Bearer token never enters portable domain rows');
});
