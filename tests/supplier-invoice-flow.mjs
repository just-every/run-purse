
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { harness } from './purse-harness.mjs';
import { orderSendFixture, orderLink } from './order-send-fixture.mjs';
import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { reauthenticateErasure } from './erasure-flow.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';

async function original(f, reference = 'synthetic-purse-4501', quantity = '1', unitAmount = '100.00', facts = {}) {
    const values = { supplier: f.supplier.name, reference, invoiceDate: '2026-10-23', dueDate: null, terms: null, poNumber: f.order.number, currency: 'USD', senderEmail: null, remitTo: null, subtotalAmount: (Number(quantity) * Number(unitAmount)).toFixed(2), freightAmount: '0.00', taxAmount: '0.00', totalAmount: (Number(quantity) * Number(unitAmount)).toFixed(2), ...facts };
    const document = await PDFDocument.create(), font = await document.embedFont(StandardFonts.Helvetica), page = document.addPage([650,790]);
    const rows = Object.entries(values).filter(([, value]) => value !== null).map(([key, value]) => key + ': ' + value).concat(['Description: ' + f.order.lines[0].description, 'Quantity: ' + quantity, 'Unit price: ' + unitAmount]);
    rows.forEach((line, index) => page.drawText(line, { x: 20, y: 760 - 24 * index, size: 10, font }));
    return { values, document: { name: reference + '.pdf', mediaType: 'application/pdf', base64: Buffer.from(await document.save()).toString('base64') } };
}
const post = (h, url, body, origin = h.origin) => fetch(url, { method: 'POST', headers: { origin, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const read = url => fetch(url, { headers: { accept: 'application/json' } });
async function scenario(name,run){const cleanups=[];const t={after:fn=>cleanups.push(fn),test:async(title,fn)=>fn(t)};try{await run(t);}catch(error){error.message=name+': '+error.message;throw error;}finally{for(const close of cleanups.reverse())await close();}}

export async function supplier_invoiceFlow(){


await scenario('Supplier invoice link captures exact private PDF and balance ancestry, holds source confirmation and duplicate/excess evidence, and exposes only its own authentic statuses', async t => {
    // Fake only the existing accounting transport to prove the supplier status projection.
    const edge={bill:null,paid:false},origin='https://synthetic-purse-4690.test';
    const h = await harness({protectedKey:createHash('sha256').update('synthetic-purse-4691').digest('hex'),mailRequest:async request=>{
        const url=new URL(request.url);if(url.origin!==origin)return;
        const path=url.pathname.slice('/api/pantry/integration/v1'.length);
        if(path.startsWith('/contacts/'))return Response.json({kind:'vendor',active:true});
        if(path==='/bills')return Response.json({bills:[edge.bill],nextCursor:null});
        if(path.startsWith('/bills/'))return Response.json({...edge.bill,open_cents:edge.paid?0:edge.bill.total_cents});
        if(path==='/payments')return Response.json({payments:edge.paid?[{id:'synthetic-purse-4692',journal_id:'synthetic-purse-4693',payment_date:'2026-11-20',amount_cents:10000,direction:'paid',contact_id:'synthetic-purse-4694',allocations:[{id:'synthetic-purse-4695',amount_cents:10000,target_kind:'bill',target_id:edge.bill.id}]}]:[],nextCursor:null});
        assert.fail('Unexpected accounting edge request');
    }}); t.after(() => h.close()); const f = await orderSendFixture(h);
    await f.send(); const link = orderLink(h), url = link.href + '/invoices';
    assert.equal((await read(url)).status, 410, 'Unacknowledged links cannot invoice');
    const acknowledged = await post(h, link, { decision: 'acknowledge', revision: f.order.revision, consent: true, name: 'synthetic-purse-4502' }); assert.equal(acknowledged.status, 200);
    await h.command('receipt', { order: f.order.id, line: f.order.lines[0].id, event: 'receive', quantity: '1', reason: 'synthetic-purse-4503' });
    assert.equal((await read(url)).status,410,'A document-only acknowledgment grants no invoice balances');
    const grant={revision:f.order.revision,enabled:true,consent:true,reason:'Owner explicitly shares remaining quantities and accepts unverified invoice submissions'};assert.equal((await h.send('/api/purse/order-send/'+f.order.id+'/invoice-consent',grant,f.buyer)).status,403);const authorized=await h.send('/api/purse/order-send/'+f.order.id+'/invoice-consent',grant,h.owner);assert.equal(authorized.status,200,JSON.stringify(authorized.value));
    const prefill = await (await read(url)).json(); assert.equal(prefill.lines[0].quantity, '1'); assert.equal(prefill.lines[0].unitMinor, 10000); assert.equal(prefill.lines[0].orderedQ, 2000); assert.deepEqual(prefill.invoices, []);
    const pdf = await original(f), body = { revision: f.order.revision, consent: true, reference: pdf.values.reference, invoiceDate: pdf.values.invoiceDate, freightAmount: '0.00', taxAmount: '0.00', lines: [{ line: f.order.lines[0].id, quantity: '1', unitAmount: '100.00' }], document: pdf.document };
    const before = (await h.state()).data;
    for (const override of [{ order: f.initial.id }, { supplier: f.supplier.id }, { currency: 'EUR' }, { status: 'paid' }, { remitTo: 'synthetic-purse-4504' }, { remit: { bankRouting: 'synthetic-purse-4505', bankAccount: 'synthetic-purse-4506' } }]) assert.equal((await post(h, url, { ...body, ...override })).status, 400);
    assert.equal((await post(h, url, { ...body, revision: 0 })).status, 409);
    assert.equal((await post(h, url, body, 'https://synthetic-purse-4507.example.test')).status, 403);
    assert.equal((await post(h, url, { ...body, lines: [{ ...body.lines[0], line: 'synthetic-purse-4508' }] })).status, 409);
    assert.deepEqual((await h.state()).data, before, 'Rejected supplier overrides leave no record');
    const received = await post(h, url, body); assert.equal(received.status, 200, await received.clone().text()); assert.deepEqual(Object.keys((await received.json()).invoice).sort(), ['reference','currency','amountMinor','invoiceDate','status','receivedAt'].sort());
    let data = (await h.state()).data, invoice = data.invoice.find(value => value.reference === body.reference), source = data.supplierInvoiceSubmission.find(value => value.invoice === invoice.id);
    assert.equal(invoice.sourceConfirmation, 'pending'); assert.equal(invoice.sender.authentication, 'unverified'); assert.equal(invoice.sourceAuthentication, 'supplier-link-holder-unverified'); assert.equal(source.identityVerified, false); assert.equal(invoice.document.sha256, createHash('sha256').update(Buffer.from(pdf.document.base64, 'base64')).digest('hex')); assert.equal(source.lines[0].acceptedQ, 1000); assert.equal(source.lines[0].billedQ, 0); assert.equal(source.lines[0].unitMinor, f.order.lines[0].unitMinor);
    assert.equal((await post(h, url, body)).status, 200); assert.equal((await h.state()).data.invoice.length, 1, 'Exact submission retries are idempotent');
    assert.equal((await post(h, url, { ...body, invoiceDate: '2026-10-24' })).status, 409);
    for (const file of data.attachment.filter(file => file.record === invoice.id || file.record === source.source)) {
        const originalResponse = await h.send('/api/purse/download/attachment/' + file.id, undefined, f.buyer); assert.equal(originalResponse.status, 200);
        const bytes = await h.mf.dispatchFetch(h.origin + '/api/purse/download/attachment/' + file.id, { headers: { cookie: f.buyer } }); assert.equal(Buffer.from(await bytes.arrayBuffer()).toString('base64'), pdf.document.base64);
        assert.equal((await h.send('/api/purse/download/attachment/' + file.id, undefined, '')).status, 401); assert.equal((await h.send('/api/purse/download/attachment/' + file.id, undefined, f.outsider)).status, 403);
    }
    await h.command('payable-terms', { invoice: invoice.id, version: 0, invoiceDate: body.invoiceDate, term: 'Net 30', reason: 'synthetic-purse-4509' }, f.buyer, 409);
    const instructions = await h.command('invoice-reading-instructions', { source: source.source }, f.buyer);
    const field = value => ({ value, confidence: value === null ? 0 : 1, page: value === null ? null : 1, excerpt: value });
    const proposal = { source: instructions.source, reader: { provider: 'synthetic-purse-4510', model: 'synthetic-purse-4511', runReference: 'synthetic-purse-4512' }, fields: { ...Object.fromEntries(Object.entries(pdf.values).map(([key,value]) => [key,field(value)])), lines: [{ description: field(f.order.lines[0].description), quantity: field('1'), unitAmount: field('100.00'), amount: field('100.00') }] } };
    const reading = await h.command('invoice-reading-propose', proposal, f.buyer), confirm = { id: reading.id, version: 1, reviewed: true, reason: 'synthetic-purse-4513', lines: [{ id: reading.lines[0].id, orderLine: f.order.lines[0].id }] };
    await h.command('invoice-reading-confirm', { ...confirm, reviewed: false }, f.buyer, 400); await h.command('invoice-reading-confirm', { ...confirm, version: 0 }, f.buyer, 409);
    await h.command('invoice-reading-confirm', confirm, f.buyer); data = (await h.state()).data; invoice = data.invoice.find(value => value.id === invoice.id); assert.equal(invoice.sourceConfirmation, 'confirmed'); assert.equal(invoice.confirmedReading, reading.id); assert.equal(data.invoice.length, 1); assert.equal(data.payable.length, 0);
    const terms = await h.command('payable-terms', { invoice: invoice.id, version: 0, invoiceDate: body.invoiceDate, term: 'Net 30', reason: 'synthetic-purse-4514' }, f.buyer); await h.command('approve-payable', { invoice: invoice.id, version: terms.version, reason: 'synthetic-purse-4515' }, f.buyer);
    assert.equal((await (await read(url)).json()).invoices[0].status, 'received', 'Cash-planning approval is not matching or payment approval');
    assert.equal((await (await read(url)).json()).lines[0].remainingQ, 0);
    assert.equal((await h.send('/api/purse/pantry/connection',{origin,currency:'USD',token:'synthetic-purse-4696',generation:0,confirmed:true},h.owner)).status,200);
    const payable=(await h.state()).data.payable.find(value=>value.invoice===invoice.id),input={invoice:invoice.id,payableVersion:payable.version,accountId:'synthetic-purse-4697',vendorId:'synthetic-purse-4694'};
    const preview=await h.send('/api/purse/pantry/preview',input,h.owner);assert.equal(preview.status,200,JSON.stringify(preview.value));
    edge.bill={id:'synthetic-purse-4698',vendor_id:input.vendorId,reference:body.reference,bill_date:body.invoiceDate,due_date:payable.dueDate,status:'posted',total_cents:10000,open_cents:10000,lines:[{description:f.order.lines[0].description,account_id:input.accountId,amount_cents:10000}]};
    const synced=await h.send('/api/purse/pantry/sync',{...input,fingerprint:preview.value.plan.fingerprint,confirmed:true,reason:'Exact existing bill at accounting network edge'},h.owner);assert.equal(synced.status,200,JSON.stringify(synced.value));
    assert.equal((await (await read(url)).json()).invoices[0].status,'received','Posting alone never claims payment');
    edge.paid=true;const returned=await h.send('/api/purse/pantry/refresh',{invoice:invoice.id},h.owner);assert.equal(returned.status,200,JSON.stringify(returned.value));
    assert.equal((await (await read(url)).json()).invoices[0].status,'paid','Only exact payment evidence returns Paid');

    const excess = await post(h, url, { ...body, reference: 'synthetic-purse-4516' }); assert.equal(excess.status, 200, await excess.clone().text());
    data = (await h.state()).data; const second = data.invoice.find(value => value.reference === 'synthetic-purse-4516'); for (const code of ['near-duplicate','duplicate-document','po-balance']) assert.ok(second.flags.some(flag => flag.code === code), code); assert.equal(second.allocations[0].q, 1000, 'Excess quantity remains evidence');
    await h.command('payable-terms', { invoice: second.id, version: 0, invoiceDate: body.invoiceDate, term: 'Net 30', reason: 'synthetic-purse-4517' }, f.buyer, 409);
    const status = await (await read(url)).json(); assert.equal(status.invoices.length, 2); assert.ok(!JSON.stringify(status).includes('duplicate-document')); assert.ok(!JSON.stringify(status).includes('riskReviews')); assert.ok(!JSON.stringify(status).includes(source.document.sha256));
    assert.equal((await h.send('/api/purse/order-send/'+f.order.id+'/invoice-consent',{...grant,enabled:false,reason:'Owner withdraws supplier invoice access'},h.owner)).status,200);assert.equal((await read(url)).status,410);assert.equal((await read(link)).status,200,'Withdrawal of invoice access preserves the document-only link');
    const rows = (await h.db.prepare('SELECT * FROM p_records').all()).results; assert.equal(validatePurchasingArchive(rows), true);
    const corrupt = structuredClone(rows), row = corrupt.find(row => row.kind === 'supplierInvoiceSubmission'), altered = JSON.parse(row.value); altered.document.sha256 = '0'.repeat(64); row.value = JSON.stringify(altered); assert.throws(() => validatePurchasingArchive(corrupt), /supplier_invoice_original/);
    await h.send('/api/purse/order-send/' + f.order.id + '/revoke', { reason: 'synthetic-purse-4518' }, f.buyer);
    assert.equal((await read(url)).status, 410); assert.equal((await post(h, url, { ...body, reference: 'synthetic-purse-4519' })).status, 410);
});



await scenario('Owner-consented supplier flip approves only confirmed three-way evidence, schedules once and holds excess or later risk through public doors', async t => {
    const h = await harness(); t.after(() => h.close()); const f = await orderSendFixture(h);
    await f.send(); const link = orderLink(h), url = link.href + '/invoices';
    await post(h, link, { decision: 'acknowledge', revision: f.order.revision, consent: true, name: 'synthetic-purse-4600' });
    await h.command('receipt', { order: f.order.id, line: f.order.lines[0].id, event: 'receive', quantity: '1', reason: 'Accepted first unit' });
    const grant = { revision: f.order.revision, enabled: true, consent: true, reason: 'Share exact supplier invoice balance' };
    assert.equal((await h.send('/api/purse/order-send/'+f.order.id+'/invoice-consent', grant, h.owner)).status, 200);
    const rule = { order: f.order.id, revision: f.order.revision, version: 0, enabled: true, consent: true, reason: 'Approve exact matched invoices after private AP review' };
    await h.command('supplier-invoice-rule', rule, f.buyer, 403);
    await h.command('supplier-invoice-rule', {...rule, consent:false}, h.owner, 400);
    await h.command('supplier-invoice-rule', rule);
    await h.command('supplier-invoice-rule', rule, h.owner, 409);
    const pdf = await original(f, 'synthetic-purse-4601'), body = { revision: f.order.revision, consent: true, reference: pdf.values.reference, invoiceDate: pdf.values.invoiceDate, freightAmount: '0.00', taxAmount: '0.00', lines: [{line:f.order.lines[0].id, quantity:'1', unitAmount:'100.00'}], document:pdf.document };
    assert.equal((await post(h,url,body)).status,200);
    let invoice = (await h.state()).data.invoice.find(value=>value.reference===body.reference);
    await h.command('supplier-invoice-rule',{...rule,version:1,reason:'Renew exact standing consent while source is still pending'});
    invoice=(await h.state()).data.invoice.find(value=>value.id===invoice.id);
    assert.equal(invoice.paymentApproval,undefined,'Source confirmation is mandatory despite the rule');
    const schedule = {invoice:invoice.id,version:0,date:'2026-11-20',reason:'Native AP payment instruction'};
    await h.command('supplier-invoice-schedule',schedule,f.outsider,403);
    await h.command('supplier-invoice-schedule',schedule,f.buyer,409);
    const instructions = await h.command('invoice-reading-instructions',{source:invoice.supplierSource},f.buyer);
    const field = value => ({value,confidence:value===null?0:1,page:value===null?null:1,excerpt:value});
    const reading = await h.command('invoice-reading-propose',{source:instructions.source,reader:{provider:'synthetic-purse-4602',model:'synthetic-purse-4603',runReference:'synthetic-purse-4604'},fields:{...Object.fromEntries(Object.entries(pdf.values).map(([key,value])=>[key,field(value)])),lines:[{description:field(f.order.lines[0].description),quantity:field('1'),unitAmount:field('100.00'),amount:field('100.00')}]}},f.buyer);
    const confirm = {id:reading.id,version:1,reviewed:true,reason:'AP confirms exact private original',lines:[{id:reading.lines[0].id,orderLine:f.order.lines[0].id}]};
    await h.command('invoice-reading-confirm',confirm,f.outsider,403);
    // Revoking the rule preserves capture and review while stopping automatic authority.
    await h.command('supplier-invoice-rule',{...rule,version:2,enabled:false,reason:'Pause automatic approval'});
    await h.command('invoice-reading-confirm',confirm,f.buyer);
    invoice=(await h.state()).data.invoice.find(value=>value.id===invoice.id);assert.equal(invoice.paymentApproval,undefined);
    await h.command('supplier-invoice-rule',{...rule,version:3});
    invoice=(await h.state()).data.invoice.find(value=>value.id===invoice.id);
    assert.equal(invoice.paymentApproval.match,'three-way');assert.equal(invoice.paymentApproval.amountMinor,10000);assert.equal(invoice.paymentApproval.ruleVersion,4);assert.equal(invoice.paymentApproval.documentSha256,invoice.document.sha256);
    assert.equal((await (await read(url)).json()).invoices[0].status,'approved');
    await h.command('invoice-reading-confirm',confirm,f.buyer,409);
    assert.equal((await post(h,url,body)).status,200);
    assert.equal((await h.state()).data.audit.filter(entry=>entry.action==='supplier-invoice-approved'&&entry.record===invoice.id).length,1,'Replayed capture cannot repeat approval');
    await h.command('supplier-invoice-schedule',schedule,f.buyer);
    assert.equal((await (await read(url)).json()).invoices[0].status,'scheduled');
    await h.command('supplier-invoice-schedule',schedule,f.buyer,409);
    let rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true);
    const archive=join(h.dir,'synthetic-purse-approval.rer');
    await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive,[]);
    const restored=await harness();t.after(()=>restored.close());
    await importArchive(await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability}),archive,[]);
    assert.equal((await restored.state()).data.invoice.find(value=>value.id===invoice.id).paymentSchedule.date,schedule.date);
    assert.equal((await restored.db.prepare('SELECT COUNT(*) n FROM p_order_send_links').first()).n,0,'Archives restore evidence without bearer authority');
    await restored.command('supplier-invoice-schedule',{...schedule,version:1},restored.owner,409);
    const forged=structuredClone(rows), changed=forged.find(row=>row.kind==='invoice'&&row.id===invoice.id), value=JSON.parse(changed.value);value.paymentApproval.amountMinor=1;changed.value=JSON.stringify(value);assert.throws(()=>validatePurchasingArchive(forged),/supplier_invoice_payment_approval/);
    assert.equal((await post(h,url,{...body,reference:'synthetic-purse-4605'})).status,200);
    const excess=(await h.state()).data.invoice.find(value=>value.reference==='synthetic-purse-4605');
    for(const code of ['po-balance','duplicate-document','near-duplicate'])assert.ok(excess.flags.some(flag=>flag.code===code),code);
    assert.equal(excess.paymentApproval,undefined);await h.command('supplier-invoice-schedule',{...schedule,invoice:excess.id},f.buyer,409);
    assert.equal((await (await read(url)).json()).invoices[1].status,'received');
    // A later duplicate original holds a historical approval; it cannot retain a current scheduled claim.
    await h.command('attachment',{kind:'invoice',record:invoice.id,...pdf.document},f.buyer);
    const held=(await h.state()).data.invoice.find(value=>value.id===invoice.id);assert.ok(held.flags.some(flag=>flag.code==='duplicate-document'));assert.ok(held.paymentApproval,'Historical approval is retained');
    assert.equal((await (await read(url)).json()).invoices[0].status,'received');
    const auditRead=await h.send('/api/purse/audit',undefined,h.owner);assert.equal(auditRead.status,200);assert.ok(auditRead.value.events.some(entry=>entry.action==='supplier-invoice-approved'&&entry.record===invoice.id));
    const auditCsv=await h.send('/api/purse/audit.csv',undefined,h.owner);assert.equal(auditCsv.status,200);assert.ok(auditCsv.value.includes('supplier-invoice-schedule'));
    const sender=(await h.state()).data.member.find(member=>member.roles.includes('buyer'));
    await h.command('member',{...sender,active:false});assert.equal((await read(url)).status,410,'Revoked purchasing authority withdraws invoice read and submit');assert.equal((await post(h,url,body)).status,410);
    await h.command('member',{...sender,active:true});
    assert.equal((await h.send('/api/purse/order-send/'+f.order.id+'/invoice-consent',{...grant,enabled:false,reason:'Withdraw supplier access'},h.owner)).status,200);
    assert.equal((await read(url)).status,410);assert.equal((await post(h,url,body)).status,410);
    await reauthenticateErasure(h);
    const sent=await h.send('/api/purse/order-send/'+f.order.id,undefined,h.owner),meta=await h.send('/api/purse/erasure',undefined,h.owner);
    const preview=await h.send('/api/purse/erasure/preview',{kind:'contact',id:f.supplier.id,email:sent.value.event.recipient,revision:meta.value.revision},h.owner);assert.equal(preview.status,200,JSON.stringify(preview.value));
    const erased=await h.send('/api/purse/erasure/execute',{...preview.value.subject,revision:preview.value.revision,review:preview.value.review,fingerprint:preview.value.fingerprint,consent:true},h.owner);assert.equal(erased.status,200,JSON.stringify(erased.value));
    assert.equal((await read(url)).status,410);assert.equal((await post(h,url,body)).status,410,'Capture replay cannot restore an erased contact');
    await h.command('supplier-invoice-rule',{...rule,version:4},h.owner,409);
    rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;assert.equal(validatePurchasingArchive(rows),true,'Anonymous approval and schedule history survives erasure');
});



await scenario('Standing supplier approval refuses price and receipt discrepancies and holds source risk until reasoned review', async t => {
    for (const [unitAmount,received,remitTo,ownerChanged] of [['90.00','1',null,false],['100.00','0',null,false],['100.00','1','synthetic-purse-4655',false],['100.00','1',null,true]]) {
        const h=await harness();t.after(()=>h.close());const f=await orderSendFixture(h);await f.send();const link=orderLink(h),url=link.href+'/invoices';
        await post(h,link,{decision:'acknowledge',revision:f.order.revision,consent:true,name:'synthetic-purse-4650'});
        if(received!=='0')await h.command('receipt',{order:f.order.id,line:f.order.lines[0].id,event:'receive',quantity:received,reason:'Accepted goods'});
        assert.equal((await h.send('/api/purse/order-send/'+f.order.id+'/invoice-consent',{revision:f.order.revision,enabled:true,consent:true,reason:'Exact supplier link'},h.owner)).status,200);
        await h.command('supplier-invoice-rule',{order:f.order.id,revision:f.order.revision,version:0,enabled:true,consent:true,reason:'Owner requires exact prices and accepted receipts'});
        const pdf=await original(f,'synthetic-purse-4651','1',unitAmount,{remitTo}),body={revision:f.order.revision,consent:true,reference:pdf.values.reference,invoiceDate:pdf.values.invoiceDate,freightAmount:'0.00',taxAmount:'0.00',lines:[{line:f.order.lines[0].id,quantity:'1',unitAmount}],document:pdf.document};assert.equal((await post(h,url,body)).status,200);
        let invoice=(await h.state()).data.invoice.find(value=>value.reference===body.reference);
        const field=value=>({value,confidence:value===null?0:1,page:value===null?null:1,excerpt:value});
        const instructions=await h.command('invoice-reading-instructions',{source:invoice.supplierSource},f.buyer);
        const reading=await h.command('invoice-reading-propose',{source:instructions.source,reader:{provider:'synthetic-purse-4652',model:'synthetic-purse-4653',runReference:'synthetic-purse-4654'},fields:{...Object.fromEntries(Object.entries(pdf.values).map(([key,value])=>[key,field(value)])),lines:[{description:field(f.order.lines[0].description),quantity:field('1'),unitAmount:field(unitAmount),amount:field(unitAmount)}]}},f.buyer);
        let viewer=h.owner;
        if(ownerChanged){const current=await h.state(),nextOwner=current.data.member.find(member=>member.roles.includes('requester'));viewer=await h.member(nextOwner.email.replace('@','-owner@'),['requester'],'owner');const demoted=await h.send('/auth/operator/role',{operatorId:current.actor.id,role:'member'},h.owner);assert.equal(demoted.status,200,JSON.stringify(demoted.value));}
        await h.command('invoice-reading-confirm',{id:reading.id,version:1,reviewed:true,reason:'Exact source reviewed without overriding matching',lines:[{id:reading.lines[0].id,orderLine:f.order.lines[0].id}]},f.buyer);
        if(ownerChanged){
            invoice=(await h.state(viewer)).data.invoice.find(value=>value.id===invoice.id);
            assert.equal(invoice.sourceConfirmation,'confirmed');assert.equal(invoice.paymentApproval,undefined,'An owner change pauses the previous standing authority');
            await h.command('supplier-invoice-schedule',{invoice:invoice.id,version:0,date:'2026-11-20',reason:'Previous owner authority cannot schedule'},f.buyer,409);
            await h.command('supplier-invoice-rule',{order:f.order.id,revision:f.order.revision,version:1,enabled:true,consent:true,reason:'Must renew exact invoice access as the new owner'},viewer,409);
            assert.equal((await read(url)).status,410,'A previous owner consent cannot keep the supplier capability live');continue;
        }

        invoice=(await h.state()).data.invoice.find(value=>value.id===invoice.id);
        assert.equal(invoice.paymentApproval,undefined,'Unresolved source risk or a match discrepancy refuses automatic approval');
        await h.command('supplier-invoice-schedule',{invoice:invoice.id,version:0,date:'2026-11-20',reason:'Unresolved risk cannot schedule'},f.buyer,409);
        for(const flag of invoice.flags){await h.command('invoice-risk-review',{invoice:invoice.id,version:invoice.riskVersion,flag:flag.id,reason:'Recorded human risk review is not a match'},f.buyer);invoice=(await h.state()).data.invoice.find(value=>value.id===invoice.id);}
        if(remitTo){assert.equal(invoice.paymentApproval.match,'three-way','A reasoned source review may clear risk without changing remit details');continue;}
        assert.equal(invoice.paymentApproval,undefined,'Price or receipt discrepancy independently refuses payment authority');
        assert.equal((await (await read(url)).json()).invoices[0].status,'received');
        await h.command('supplier-invoice-schedule',{invoice:invoice.id,version:0,date:'2026-11-20',reason:'Discrepancy cannot schedule'},f.buyer,409);
    }
});
}
