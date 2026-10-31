import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { PDFName, decodePDFRawStream } from 'pdf-lib';
import { harness } from './purse-harness.mjs';
import { pdfContent } from './pdf-content.mjs';
import { orderSendFixture, orderMessage, orderLink } from './order-send-fixture.mjs';
import { adoptionFixture, importInput } from './order-adoption-fixture.mjs';
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
    const notices=(await h.send('/api/purse/notifications',undefined,f.requester)).value.items; assert.equal(notices.filter(n=>n.type==='po-acknowledged'&&n.record===f.order.id&&n.canRead).length,1,'Concurrent supplier acknowledgments create one exact native notice');
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
    // The link holder's stated acknowledgment name is a personal field of the same reviewed inventory: gone from the PO, audit read and CSV, while the revision, PDF hash and acknowledgment time stay.
    assert.ok(!JSON.stringify(erasedRows).includes('synthetic-purse-2821'),'The stated acknowledgment name is erased with its recipient');assert.ok(preview.value.coverage.find(entry=>/acknowledgment names/.test(entry.store)).fields>0);
    for(const path of ['/api/purse/state','/api/purse/audit','/api/purse/audit.csv?subject='+f.order.id,'/api/purse/order-send/'+f.order.id,'/api/purse/download/order/'+f.order.id]){const read=await h.send(path,undefined,h.owner);assert.equal(read.status,200,path);assert.ok(!JSON.stringify(read.value).includes('synthetic-purse-2821'),path);}
    const retainedSend=JSON.parse(erasedRows.find(row=>row.kind==='orderSend').value);assert.equal(retainedSend.revision,2);assert.equal(retainedSend.pdf.sha256,sent.value.pdfSha256);assert.equal(retainedSend.acknowledgment.pdfSha256,sent.value.pdfSha256);assert.ok(retainedSend.acknowledgment.at);assert.deepEqual((await h.state()).data.revision.find(row=>row.request===f.request.id&&row.revision===2),immutable,'Erasure never rewrites approved revisions');
    const quantityHarness=await harness();t.after(()=>quantityHarness.close());const quantity=await orderSendFixture(quantityHarness,{kind:'quantity'}),quantitySent=await quantity.send();assert.equal(quantitySent.status,200,JSON.stringify(quantitySent.value));assert.equal(quantitySent.value.changeLabel,'Change order 1');
    const quantityLink=orderLink(quantityHarness),quantityFace=await publicGet(quantityHarness,quantityLink);assert.match(await quantityFace.text(),/quantity: 2 to 3/);assert.equal((await ack(quantityHarness,quantityLink,2)).status,200);assert.equal((await quantityHarness.send('/api/purse/order-send/'+quantity.order.id,undefined,quantity.requester)).value.event.acknowledgment.revision,2);
    await quantityHarness.command('order-chase-policy',{order:quantity.order.id,version:0,enabled:true,cadenceDays:1,maxChases:2,escalateTo:'synthetic-purse-2804@example.test'},quantity.buyer);
    const overdueTick=await quantityHarness.mf.dispatchFetch(quantityHarness.origin+'/cdn-cgi/local/scheduled?time='+(Date.parse(quantity.order.needDate+'T17:00:00Z')+86400000));assert.equal(overdueTick.status,200);
    const overdue=(await quantityHarness.state()).data.orderChaseEvent.filter(row=>row.order===quantity.order.id);assert.equal(overdue.length,1);assert.equal(overdue[0].reason,'overdue-delivery');assert.equal(overdue[0].supplierAcknowledgment.revision,2);
    assert.equal(validatePurchasingArchive((await quantityHarness.db.prepare('SELECT * FROM p_records').all()).results),true,'Overdue delivery retains exact native supplier acknowledgment through archive validation');

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

async function initialOrderFixture(h) {
    const base = await orderSendFixture(h);
    const request = await h.command('request', { ...base.request, id: undefined, revision: undefined, title: 'synthetic-purse-2830', needDate: '2026-11-01', lines: base.request.lines.map(line => ({ ...line, id: undefined })) }, base.requester);
    await h.command('submit', { id: request.id, revision: 1 }, base.requester);
    await h.command('decision', { id: request.id, revision: 1, decision: 'approved', reason: 'synthetic-purse-2831' }, base.approver);
    const order = await h.command('convert', { id: request.id, revision: 1, issue: true }, base.buyer);
    return { ...base, request, order, send: (body = {}, cookie = base.buyer) => h.send('/api/purse/order-send', { order: order.id, revision: 1, mode: 'initial', recipient: 'synthetic-purse-2832@example.test', reason: 'synthetic-purse-2833', consent: true, ...body }, cookie) };
}
const initialMessage = h => h.messages.find(message => message.subject.startsWith('Purchase order:'));
const initialLink = h => new URL(initialMessage(h).text.match(/http:\/\/[^\s]+\/api\/purse\/order-link\/[^\s]+/)[0]);
const respond = (h, link, input = {}) => fetch(link, { method: 'POST', headers: { origin: h.origin, 'content-type': 'application/json' }, body: JSON.stringify({ revision: 1, version: 0, decision: 'accept', promisedDate: '2026-11-08', name: 'synthetic-purse-2834', consent: true, ...input }) });

test('Initial supplier responses retain exact frozen PO and promises, and only buyer adoption creates an unapproved amendment', async t => {
    const h = await harness(); t.after(() => h.close()); const f = await initialOrderFixture(h);
    assert.equal(initialMessage(h), undefined, 'Native issuance requires a separate exact buyer/contact send consent');
    const original = (await h.state()).data.revision.find(row => row.request === f.request.id && row.revision === 1);
    const sent = await f.send(); assert.equal(sent.status, 200, JSON.stringify(sent.value)); assert.equal(sent.value.mode, 'initial'); assert.equal(sent.value.status, 'accepted');
    const link = initialLink(h), message = initialMessage(h), face = await publicGet(h, link); assert.equal(face.status, 200);
    const html = await face.text(); for (const field of ['synthetic-purse-2812', 'synthetic-purse-2808', 'Vendor SKU', 'synthetic-purse-2818', 'synthetic-purse-2819', 'Text-only prepayment terms', 'USD 210.50']) assert.ok(html.includes(field), field);
    assert.equal(face.headers.get('referrer-policy'), 'strict-origin');
    const pdf = Buffer.from(await (await publicGet(h, link.href + '/pdf')).arrayBuffer()); assert.deepEqual(pdf, Buffer.from(message.attachments[0].content, 'base64'));
    const printed = await pdfContent(new Uint8Array(pdf)); for (const field of ['synthetic-purse-2812', 'synthetic-purse-2810', 'synthetic-purse-2811', 'Vendor SKU']) assert.ok(printed.text.includes(field), field);
    for (let index = 0; index < 2; index++) assert.deepEqual(Buffer.from(await (await publicGet(h, link.href + '/original/' + index)).arrayBuffer()), Buffer.from(index ? f.certificate : f.terms, 'base64'));
    assert.equal((await respond(h, link)).status, 200);
    const seen = await h.send('/api/purse/order-send/' + f.order.id, undefined, f.requester); assert.equal(seen.status, 200); assert.equal(seen.value.event.response.decision, 'accept'); assert.equal(seen.value.event.response.promisedDate, '2026-11-08'); assert.equal(seen.value.event.acknowledgment.revision, 1);
    const state = await h.state(); assert.equal(state.data.supplierOrderEvidence.find(row => row.order === f.order.id).promisedDate, '2026-11-08');
    await h.command('order-chase-policy', { order: f.order.id, version: 0, enabled: true, cadenceDays: 1, maxChases: 2, escalateTo: 'synthetic-purse-2804@example.test' }, f.buyer);
    await h.mf.dispatchFetch(h.origin + '/cdn-cgi/local/scheduled?time=' + Date.now());
    assert.equal((await h.state()).data.orderChaseEvent.filter(row => row.order === f.order.id).length, 0, 'Response stops acknowledgment chasing and its promise replaces the earlier need date for delivery chasing');
    // Delivery chasing compares dates in the business calendar (America/New_York), not UTC.
    const earlierPromise=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(Date.now()-86400000);
    assert.equal((await respond(h,link,{version:1,promisedDate:earlierPromise})).status,200);
    await h.mf.dispatchFetch(h.origin + '/cdn-cgi/local/scheduled?time=' + Date.now());
    const chase = (await h.state()).data.orderChaseEvent.find(row => row.order === f.order.id); assert.equal(chase.reason, 'overdue-delivery'); assert.equal(chase.evidence.promisedDate, earlierPromise);
    const proposed = { version: 2, decision: 'change', promisedDate: '2026-11-22', lines: [{ line: f.order.lines[0].id, quantity: '3.125', unitAmount: '112.25' }], note: 'synthetic-purse-2835' };
    const competing = await Promise.all([respond(h, link, proposed), respond(h, link, proposed)]); assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
    const after = await h.state(), unchanged = after.data.order.find(row => row.id === f.order.id); assert.equal(unchanged.lines[0].unitMinor, 10000); assert.equal(unchanged.lines[0].quantity, '2'); assert.deepEqual(after.data.revision.find(row => row.request === f.request.id && row.revision === 1), original);
    assert.deepEqual(Buffer.from(await (await publicGet(h, link.href + '/pdf')).arrayBuffer()), pdf, 'Promises and offers never rewrite the sent document');
    const review = await h.send('/api/purse/order-send/' + f.order.id, undefined, f.requester), response = review.value.event.response; assert.equal(review.value.responses.length, 3); assert.equal(response.lines[0].q, 3125); assert.equal(response.lines[0].unitMinor, 11225);
    const adopt = { revision: 1, response: response.id, reason: 'synthetic-purse-2836', consent: true, adoptDeliveryDate: true };
    assert.equal((await h.send('/api/purse/order-send/' + f.order.id + '/adopt-response', adopt, f.requester)).status, 403);
    assert.equal((await h.send('/api/purse/order-send/' + f.order.id + '/adopt-response', { ...adopt, response: seen.value.event.response.id }, f.buyer)).status, 409);
    const adopted = await h.send('/api/purse/order-send/' + f.order.id + '/adopt-response', adopt, f.buyer); assert.equal(adopted.status, 200, JSON.stringify(adopted.value)); assert.equal(adopted.value.draft.status, 'draft'); assert.equal(adopted.value.draft.amends, f.order.id); assert.equal(adopted.value.draft.lines[0].unitMinor, 11225); assert.equal(adopted.value.draft.needDate, '2026-11-22');
    assert.equal((await h.send('/api/purse/command/convert', { id: f.request.id, revision: 2, issue: true }, f.buyer)).status, 409, 'Supplier proposal grants no approval');
    assert.equal((await publicGet(h, link)).status, 410); assert.equal((await respond(h, link, { version: 2 })).status, 410);
    assert.equal(h.messages.filter(message => message.subject.startsWith('Purchase order:')).length, 1, 'Adoption sends nothing');
    await h.command('submit', { id: f.request.id, revision: 2 }, f.requester); await h.command('decision', { id: f.request.id, revision: 2, decision: 'approved', reason: 'synthetic-purse-2837' }, f.approver);
    const renewed = await h.command('convert', { id: f.request.id, revision: 2, issue: true }, f.buyer); assert.equal(renewed.lines[0].unitMinor, 11225); assert.equal(renewed.lines[0].quantity, '3.125');
    const audit = await h.send('/api/purse/audit.csv?subject=' + f.order.id, undefined, h.owner); for (const action of ['order-send-claimed', 'order-send-outcome', 'order-acknowledged', 'order-supplier-response', 'order-response-adopted', response.id, sent.value.pdfSha256]) assert.ok(audit.value.includes(action), action);
    const rows = (await h.db.prepare('SELECT * FROM p_records').all()).results; assert.equal(validatePurchasingArchive(rows), true);
    const corrupt = structuredClone(rows), row = corrupt.find(row => row.kind === 'orderSupplierResponse'), value = JSON.parse(row.value); value.revision = 99; row.value = JSON.stringify(value); assert.throws(() => validatePurchasingArchive(corrupt), /order_response/);
});

test('Initial send and supplier response refuse stale authority and nonnative, pending, revoked or cross-origin sources without another mail attempt', async t => {
    const h = await harness(); t.after(() => h.close()); const f = await initialOrderFixture(h);
    for (const [body, cookie, status] of [[{}, '', 401], [{}, f.requester, 403], [{ consent: false }, f.buyer, 400], [{ revision: 2 }, f.buyer, 409]]) assert.equal((await f.send(body, cookie)).status, status);
    await h.command('supplier', { ...f.supplier, status: 'blocked', reason: 'synthetic-purse-2838' });
    assert.equal((await f.send()).status, 409); assert.equal(initialMessage(h), undefined);
    await h.command('supplier', { ...f.supplier, status: 'preferred', reason: 'synthetic-purse-2839' });
    const pending = await h.command('request', { ...f.request, id: undefined, revision: undefined, lines: f.request.lines.map(line => ({ ...line, id: undefined })) }, f.requester);
    await h.command('submit', { id: pending.id, revision: 1 }, f.requester); await h.command('decision', { id: pending.id, revision: 1, decision: 'approved', reason: 'synthetic-purse-2840' }, f.approver);
    const prepared = await h.command('convert', { id: pending.id, revision: 1 }, f.buyer);
    await h.command('supplier', { ...f.supplier, status: 'blocked', reason: 'synthetic-purse-2841' });
    assert.equal((await h.send('/api/purse/command/issue', { id: prepared.id, revision: 1, reason: 'synthetic-purse-2842' }, f.buyer)).status, 409); assert.equal(initialMessage(h), undefined);
    await h.command('supplier', { ...f.supplier, status: 'preferred', reason: 'synthetic-purse-2843' });
    const form = await h.command('intake-form', { name: 'synthetic-purse-2853', purchaseType: 'goods', consent: true });
    const proposal = await h.command('intake-draft', { fields: { ...f.request, intakeForm: form.id, id: undefined, revision: undefined, supplier: '', lines: f.request.lines.map(line => ({ ...line, id: undefined })) }, proposal: { name: 'synthetic-purse-2847', contactEmail: 'synthetic-purse-2848@synthetic-purse-2849.test', reason: 'synthetic-purse-2850', consent: true } }, f.requester);
    const vendorPending = await h.command('intake-complete', { id: proposal.id, version: proposal.version, consent: true }, f.requester);
    await h.command('submit', { id: vendorPending.id, revision: 1 }, f.requester); await h.command('decision', { id: vendorPending.id, revision: 1, decision: 'approved', reason: 'synthetic-purse-2851' }, f.approver);
    assert.equal((await h.send('/api/purse/command/convert', { id: vendorPending.id, revision: 1, issue: true }, f.buyer)).status, 409, 'Vendor approval is required before issuance');
    assert.equal(initialMessage(h), undefined);
    const importedFixture = adoptionFixture({ base: 2852, number: 'synthetic-purse-2852', deposit: false }), input = { ...importInput(importedFixture), csv: importedFixture.csv.replaceAll('Fitout', 'General').replaceAll('Equipment', 'goods') };
    const importPreview = await h.send('/api/purse/import/preview', input, h.owner); assert.equal(importPreview.status, 200, JSON.stringify(importPreview.value));
    const imported = await h.send('/api/purse/import/commit', { ...input, fingerprint: importPreview.value.plan.fingerprint }, h.owner); assert.equal(imported.status, 200, JSON.stringify(imported.value));
    assert.equal((await f.send({ order: importedFixture.ids.order }, h.owner)).status, 409, 'Imported evidence cannot authorize a supplier send');
    await h.command('screen-supplier', { id: importedFixture.ids.supplier });
    const policy = await h.command('policy',{name:'synthetic-purse-2855 imported obligations',currency:'USD',category:'goods',project:'General',approver:'synthetic-purse-2803@example.test',limitMinor:1000000,budgetMinor:10000000});
    const selection = { id: importedFixture.ids.order, policy: policy.id, budget: importedFixture.ids.budget, location: 'Denver', costCentre: 'Operations', receiver: 'synthetic-purse-2804@example.test' };
    const adoptionReview = await h.command('adopt-order-preview', selection);
    await h.command('adopt-order', { ...selection, fingerprint: adoptionReview.fingerprint, reviewed: true, reason: 'synthetic-purse-2854' });
    assert.equal((await f.send({ order: importedFixture.ids.order }, h.owner)).status, 409, 'Adopted authority is never initial-send authority');
    const sent = await f.send(); assert.equal(sent.status, 200, JSON.stringify(sent.value)); const link = initialLink(h);
    assert.equal((await f.send()).status, 409); assert.equal(h.messages.filter(message => message.subject.startsWith('Purchase order:')).length, 1);
    assert.equal((await respond(h, link, { revision: 2 })).status, 409); assert.equal((await respond(h, link, { lines: [{ line: prepared.lines[0].id, quantity: '3', unitMinor: 1 }], decision: 'change' })).status, 409);
    assert.equal((await fetch(link, { method: 'POST', headers: { origin: 'https://synthetic-purse-2844.test', 'content-type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await respond(h, link, { decision: 'reject', promisedDate: null })).status, 200);
    const rejected = await h.send('/api/purse/order-send/' + f.order.id, undefined, f.requester); assert.equal(rejected.value.event.response.decision, 'reject'); assert.equal(rejected.value.event.response.promisedDate, null);
    assert.equal((await h.send('/api/purse/order-send/' + f.order.id + '/adopt-response', { revision: 1, response: rejected.value.event.response.id, reason: 'synthetic-purse-2845', consent: true }, f.buyer)).status, 409);
    await h.command('member', { email: 'synthetic-purse-2804@example.test', name: 'synthetic-purse-2804', active: false, roles: ['buyer'] });
    for (const suffix of ['', '/pdf', '/original/0']) assert.equal((await publicGet(h, link.href + suffix)).status, 410, 'Revoked current buyer authority withdraws supplier access');
    assert.equal((await respond(h, link, { version: 1 })).status, 410);
    await h.command('member', { email: 'synthetic-purse-2804@example.test', name: 'synthetic-purse-2804', active: true, roles: ['buyer'] });
    assert.equal((await h.send('/api/purse/order-send/' + f.order.id + '/revoke', {}, f.buyer)).status, 200);
    for (const suffix of ['', '/pdf', '/original/0']) assert.equal((await publicGet(h, link.href + suffix)).status, 410);
    assert.equal((await respond(h, link, { version: 1 })).status, 410);
    const rows = (await h.db.prepare('SELECT * FROM p_records').all()).results; assert.equal(validatePurchasingArchive(rows), true); assert.ok(!JSON.stringify(rows).includes(link.pathname.split('/').at(-1)));
});
