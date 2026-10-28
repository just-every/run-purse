import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { harness } from './purse-harness.mjs';
import { orderSendFixture, orderLink } from './order-send-fixture.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';

async function original(f, reference = 'synthetic-purse-4501', quantity = '1') {
    const values = { supplier: f.supplier.name, reference, invoiceDate: '2026-10-23', dueDate: null, terms: null, poNumber: f.order.number, currency: 'USD', senderEmail: null, remitTo: null, subtotalAmount: String(Number(quantity) * 100) + '.00', freightAmount: '0.00', taxAmount: '0.00', totalAmount: String(Number(quantity) * 100) + '.00' };
    const document = await PDFDocument.create(), font = await document.embedFont(StandardFonts.Helvetica), page = document.addPage([650,790]);
    const rows = Object.entries(values).filter(([, value]) => value !== null).map(([key, value]) => key + ': ' + value).concat(['Description: ' + f.order.lines[0].description, 'Quantity: ' + quantity, 'Unit price: 100.00']);
    rows.forEach((line, index) => page.drawText(line, { x: 20, y: 760 - 24 * index, size: 10, font }));
    return { values, document: { name: reference + '.pdf', mediaType: 'application/pdf', base64: Buffer.from(await document.save()).toString('base64') } };
}
const post = (h, url, body, origin = h.origin) => fetch(url, { method: 'POST', headers: { origin, accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const read = url => fetch(url, { headers: { accept: 'application/json' } });

test('Supplier invoice link captures exact private PDF and balance ancestry, holds source confirmation and duplicate/excess evidence, and exposes only its own authentic statuses', async t => {
    const h = await harness(); t.after(() => h.close()); const f = await orderSendFixture(h);
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

test('Owner-consented supplier flips approve exact three-way evidence once, return native schedules, and hold unsafe or revoked paths', async t => {
    const h = await harness(); t.after(() => h.close()); const f = await orderSendFixture(h);
    await f.send(); const link=orderLink(h), url=link.href+'/invoices';
    await post(h,link,{decision:'acknowledge',revision:f.order.revision,consent:true,name:'synthetic-purse-4601'});
    const grant={revision:f.order.revision,enabled:true,consent:true,automaticApproval:true,paymentTerm:'Net 30',reason:'Owner authorizes exact three-way matches after AP confirms originals'};
    assert.equal((await h.send('/api/purse/order-send/'+f.order.id+'/invoice-consent',grant,f.buyer)).status,403);
    assert.equal((await h.send('/api/purse/order-send/'+f.order.id+'/invoice-consent',grant,h.owner)).status,200);
    const pdf=await original(f,'synthetic-purse-4602'), body={revision:f.order.revision,consent:true,reference:pdf.values.reference,invoiceDate:pdf.values.invoiceDate,freightAmount:'0.00',taxAmount:'0.00',lines:[{line:f.order.lines[0].id,quantity:'1',unitAmount:'100.00'}],document:pdf.document};
    assert.equal((await post(h,url,body)).status,200);
    let invoice=(await h.state()).data.invoice.find(row=>row.reference===body.reference);
    await h.command('approve-supplier-invoice',{invoice:invoice.id},f.outsider,403);
    await h.command('approve-supplier-invoice',{invoice:invoice.id},f.buyer,409);
    assert.equal((await h.state()).data.payable.length,0,'Arrival cannot approve an unconfirmed original');
    const reading=await h.command('supplier-invoice-review',{invoice:invoice.id},f.buyer);
    assert.equal(reading.parser.startsWith('Structured supplier'),true);
    assert.equal(reading.reference.value,body.reference); assert.equal(reading.lines[0].quantity.value,'1');
    const confirmation={id:reading.id,version:1,reviewed:true,reason:'AP compares every structured field with the private original',lines:[{id:reading.lines[0].id,orderLine:f.order.lines[0].id}]};
    await h.command('invoice-reading-confirm',{...confirmation,reviewed:false},f.buyer,400);
    await h.command('invoice-reading-confirm',confirmation,f.buyer);
    assert.equal((await h.state()).data.payable.length,0,'A confirmed invoice still waits for receipt');
    for(const flag of (await h.state()).data.invoice.find(row=>row.id===invoice.id).flags) {
        const current=(await h.state()).data.invoice.find(row=>row.id===invoice.id);
        await h.command('invoice-risk-review',{invoice:invoice.id,version:current.riskVersion,flag:flag.id,reason:'AP checks the source; actual receipt still required'},f.buyer);
    }
    assert.equal((await h.state()).data.payable.length,0,'Risk review cannot bypass an actual receipt');
    await h.command('receipt',{order:f.order.id,line:f.order.lines[0].id,event:'receive',quantity:'1',reason:'Received the invoiced unit'});
    let data=(await h.state()).data, payable=data.payable.find(row=>row.invoice===invoice.id);
    assert.equal(payable.approvedMinor,10000);assert.equal(payable.supplierApproval.documentSha256,invoice.document.sha256);
    assert.equal(payable.supplierApproval.consentVersion,1);assert.equal(payable.dueDate,'2026-11-22');
    assert.equal((await (await read(url)).json()).invoices[0].status,'approved');
    assert.equal(data.cashRequirements.bills.find(row=>row.invoice===invoice.id).amountMinor,10000);
    assert.equal(data.audit.filter(row=>row.action==='supplier-invoice-approved'&&row.record===invoice.id).length,1);
    await h.command('approve-supplier-invoice',{invoice:invoice.id},f.buyer);
    assert.equal((await h.state()).data.audit.filter(row=>row.action==='supplier-invoice-approved'&&row.record===invoice.id).length,1,'An approval replay never creates another approval');
    const schedule={invoice:invoice.id,version:payable.version,documentSha256:invoice.document.sha256,scheduledDate:'2026-11-20',reason:'Owner records native payment instruction',consent:true};
    await h.command('schedule-supplier-invoice',schedule,f.buyer,403);
    await h.command('schedule-supplier-invoice',{...schedule,consent:false},h.owner,409);
    await h.command('schedule-supplier-invoice',{...schedule,documentSha256:'0'.repeat(64)},h.owner,409);
    await h.command('schedule-supplier-invoice',schedule);
    await h.command('schedule-supplier-invoice',schedule);
    assert.equal((await (await read(url)).json()).invoices[0].status,'scheduled');
    assert.equal((await h.state()).data.audit.filter(row=>row.action==='schedule-supplier-invoice').length,1);
    assert.equal((await post(h,url,body)).status,200,'Capture replay preserves the original decision');
    assert.equal((await h.state()).data.invoice.length,1);
    const rows=(await h.db.prepare('SELECT * FROM p_records').all()).results;
    assert.equal(validatePurchasingArchive(rows),true);
    const corrupt=structuredClone(rows), row=corrupt.find(row=>row.kind==='payable'), changed=JSON.parse(row.value);changed.supplierApproval.consentVersion=99;row.value=JSON.stringify(changed);
    assert.throws(()=>validatePurchasingArchive(corrupt),/supplier_invoice_approval_rule/);
    assert.equal((await post(h,url,{...body,reference:'synthetic-purse-4603'})).status,200);
    data=(await h.state()).data;const excess=data.invoice.find(row=>row.reference==='synthetic-purse-4603');
    assert.ok(excess.flags.some(flag=>flag.code==='po-balance'));assert.ok(excess.flags.some(flag=>flag.code==='duplicate-document'));
    const excessReading=await h.command('supplier-invoice-review',{invoice:excess.id},f.buyer);
    await h.command('invoice-reading-confirm',{...confirmation,id:excessReading.id,lines:[{id:excessReading.lines[0].id,orderLine:f.order.lines[0].id}]},f.buyer);
    await h.command('approve-supplier-invoice',{invoice:excess.id},f.buyer,409);
    assert.equal((await (await read(url)).json()).invoices.find(row=>row.reference===excess.reference).status,'received');
    const heldTerms=await h.command('payable-terms',{invoice:excess.id,version:0,invoiceDate:body.invoiceDate,term:'Net 30',reason:'Record held bill terms'},f.buyer);
    await h.command('approve-payable',{invoice:excess.id,version:heldTerms.version,reason:'Unsafe unresolved duplicate'},f.buyer,409);
    for(const flag of excess.flags) {
        const latest=(await h.state()).data.invoice.find(row=>row.id===excess.id);
        await h.command('invoice-risk-review',{invoice:excess.id,version:latest.riskVersion,flag:flag.id,reason:'Reviewed source evidence; receipt discrepancy remains'},f.buyer);
    }
    await h.command('approve-supplier-invoice',{invoice:excess.id},f.buyer,409,'Risk review never supplies a missing receipt');
    assert.equal((await h.state()).data.payable.find(row=>row.invoice===excess.id).approvedAt,undefined);
    assert.equal((await h.send('/api/purse/order-send/'+f.order.id+'/invoice-consent',{...grant,automaticApproval:false},h.owner)).status,200);
    await h.command('approve-supplier-invoice',{invoice:excess.id},f.buyer,409);
    const before=(await h.state()).data.invoice.length;
    await h.send('/api/purse/order-send/'+f.order.id+'/revoke',{reason:'Withdraw exact supplier capability'},f.buyer);
    assert.equal((await read(url)).status,410);assert.equal((await post(h,url,body)).status,410);
    await h.command('schedule-supplier-invoice',schedule,h.owner,409);
    assert.equal((await h.state()).data.invoice.length,before,'Revoked capture cannot resurrect invoice data');
});
