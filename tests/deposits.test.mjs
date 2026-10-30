import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { validatePurchasingArchive } from '../scripts/installer/restore-validation.mjs';
import { harness } from './purse-harness.mjs';
import { depositsFixture, depositDocument, depositEmail } from './deposits-fixture.mjs';
import { pdfContent } from './pdf-content.mjs';
import { reauthenticateErasure } from './erasure-flow.mjs';

export async function depositsJourney(t) {
    const h = await harness(); t.after(() => h.close()); const f = await depositsFixture(h), cmd = h.command;
    const records = async () => (await h.db.prepare('SELECT * FROM p_records ORDER BY kind,id').all()).results;
    const refused = async (op, body, cookie = f.ap, status = 409) => { const before = await records(); await cmd(op, body, cookie, status); assert.deepEqual(await records(), before, op + ' refusal preserves all evidence'); };
    for (const term of [{ basis: 'amount', amountMinor: 2000001, trigger: 'issue' }, { basis: 'percentage', percentage: '100.01', trigger: 'issue' }, { basis: 'percentage', percentage: '0.001', trigger: 'issue' }, { basis: 'amount', amountMinor: 1, trigger: 'acknowledgment' }]) await refused('request', f.input(term), f.requester, 400);
    const changing=await f.purchase();
    const changed=await cmd('amend',{...changing.request,id:changing.request.id,reason:'Replace the term before any receiving or invoice evidence',poDetails:{deposit:{basis:'amount',amountMinor:750001,trigger:'date',dueDate:'2099-05-01'}}},f.requester);
    assert.equal(changed.status,'draft');assert.equal(changed.poDetails.deposit.amountMinor,750001);
    await refused('convert',{id:changed.id,revision:changed.revision},f.buyer);
    await cmd('submit',{id:changed.id,revision:changed.revision},f.requester);
    await refused('convert',{id:changed.id,revision:changed.revision},f.buyer);
    await cmd('decision',{id:changed.id,revision:changed.revision,decision:'approved',reason:'Independent renewed deposit approval'},f.approver);
    const changedPrepared=await cmd('convert',{id:changed.id,revision:changed.revision},f.buyer);
    const changedOrder=await cmd('issue',{id:changedPrepared.id,revision:changedPrepared.revision,reason:'Renewed deposit terms issued'},f.buyer);
    const amendedPdf=await h.mf.dispatchFetch(h.origin+'/api/purse/order-pdf/'+changedOrder.id,{headers:{cookie:f.buyer}});
    const amendedText=(await pdfContent(new Uint8Array(await amendedPdf.arrayBuffer()))).text;
    for(const value of ['Change order 1','Structured deposit','USD 7500.01 due 2099-05-01','USD 10000.00 due on issue'])assert.ok(amendedText.includes(value),value);
    await cmd('receipt',{order:changedOrder.id,line:changedOrder.lines[0].id,event:'receive',quantity:'1',reason:'First unit arrived'},f.receiver);
    await refused('amend',{...changed,id:changed.id,reason:'Cannot replace terms after receipt',poDetails:{deposit:{basis:'amount',amountMinor:750002,trigger:'issue'}}},f.requester);

    const centsInput=f.input({basis:'percentage',percentage:'50',trigger:'date',dueDate:'2099-05-01'},'CAD');centsInput.lines=[{...centsInput.lines[0],quantity:'1',unitMinor:10001}];
    const centsRequest=await cmd('request',centsInput,f.requester);assert.equal(centsRequest.poDetails.deposit.amountMinor,5001,'Half-up percentage calculation preserves the remainder cent');
    await cmd('submit',{id:centsRequest.id,revision:1},f.requester);await cmd('decision',{id:centsRequest.id,revision:1,decision:'approved',reason:'Approve exact CAD cents'},f.approver);
    const centsPrepared=await cmd('convert',{id:centsRequest.id,revision:1},f.buyer),centsOrder=await cmd('issue',{id:centsPrepared.id,revision:1,reason:'CAD deposit terms issued'},f.buyer);
    await cmd('deposit-rule',await f.ruleInput(centsOrder));const centsBill=await f.confirm(await f.stage(centsOrder,'synthetic-purse-7207',5001));
    assert.ok(centsBill.paymentApproval);assert.equal((await h.state()).data.payable.find(row=>row.invoice===centsBill.id).dueDate,'2099-05-01');
    const centsReport=(await h.send('/api/purse/spend-report',undefined,h.owner)).value;
    assert.deepEqual(centsReport.totals.find(row=>row.currency==='CAD'),{currency:'CAD',reservedMinor:0,committedMinor:5000,actualMinor:5001});

    const { request, order } = await f.purchase();
    const original = async () => {
        const response = await h.mf.dispatchFetch(h.origin + '/api/purse/order-pdf/' + order.id, { headers: { cookie: f.buyer } });
        assert.equal(response.status, 200);
        return pdfContent(new Uint8Array(await response.arrayBuffer()));
    };
    const beforePdf = await original(); assert.match(beforePdf.text, /50.00%/); assert.match(beforePdf.text, /USD 10000.00 due on issue/);
    const sent=await h.send('/api/purse/order-send',{order:order.id,revision:order.revision,recipient:depositEmail(7206),reason:'Explicit exact native deposit PO document send',consent:true},f.buyer);assert.equal(sent.status,200,JSON.stringify(sent.value));
    const message=h.messages.find(row=>row.subject.includes(order.number)),link=new URL(message.text.match(/http:\/\/[^\s]+\/api\/purse\/order-link\/[^\s]+/)[0]);
    const supplierPage=await h.send(link.pathname);assert.equal(supplierPage.status,200);assert.match(supplierPage.value,/50.00%/);assert.match(supplierPage.value,/USD 10000.00 due on issue/);
    const supplierPdf=await h.mf.dispatchFetch(link.href+'/pdf');assert.equal(supplierPdf.status,200);assert.equal(Buffer.from(await supplierPdf.arrayBuffer()).toString('base64'),message.attachments[0].content,'Supplier link serves the frozen exact deposit PDF');
    const staged = await f.stage(order, 'synthetic-purse-7210'), deposit = await f.confirm(staged);
    assert.equal(deposit.totalMinor, 1000000); assert.equal(deposit.allocations[0].q, 0); assert.equal(deposit.paymentApproval, undefined);
    assert.equal((await h.state()).data.order.find(row => row.id === order.id).positions[0].accepted, 0);
    assert.ok(!(await h.state()).data.discrepancies.some(row => row.invoiceId === deposit.id && row.receiptShortfall));
    await refused('approve-payable', { invoice: deposit.id, version: 0, reason: 'Bypass standing consent' });
    const rule = await f.ruleInput(order);
    await refused('deposit-rule', rule, f.ap, 403); await refused('deposit-rule', { ...rule, consent: false }, h.owner, 400);
    await refused('deposit-rule', { ...rule, termKey: 'changed' }, h.owner);
    await cmd('deposit-rule', rule);
    let data = (await h.state()).data, approved = data.invoice.find(row => row.id === deposit.id);
    assert.equal(approved.paymentApproval.match, 'deposit-two-way');
    assert.equal(data.payable.find(row => row.invoice === deposit.id).dueDate, order.issuedAt.slice(0, 10));
    assert.equal(data.cashRequirements.bills.find(row => row.invoice === deposit.id).amountMinor, 1000000);
    assert.equal(data.cashRequirements.commitments.find(row => row.order === order.id).amountMinor, 1000000);
    assert.equal(data.periodBudgets.find(row => row.currency === 'USD').actualMinor, 1000000);
    assert.equal(data.periodBudgets.find(row => row.currency === 'USD').committedMinor, 3000000);
    const report = async () => (await h.send('/api/purse/spend-report', undefined, h.owner)).value;
    assert.equal((await report()).rows.filter(row => row.order === order.id && row.kind === 'actual').reduce((n, row) => n + row.amountMinor, 0), 1000000);
    const privateUrl = '/api/purse/download/attachment/' + staged.source.attachment;
    assert.equal((await h.send(privateUrl, undefined, f.ap)).status, 200); assert.equal((await h.send(privateUrl, undefined, f.receiver)).status, 403); assert.equal((await h.send(privateUrl)).status, 401);
    const scoped = await h.member(depositEmail(7211), ['ap-clerk']);
    await cmd('member', { email: depositEmail(7211), name: 'Austin AP', active: true, grants: [{ role: 'ap-clerk', scope: { locations: ['Austin'] } }] });
    await refused('invoice-reading-confirm', staged.confirm, scoped, 403); assert.equal((await h.send(privateUrl, undefined, scoped)).status, 403);
    const excess = await f.confirm(await f.stage(order, 'synthetic-purse-7212', 1000001));
    const second = await f.confirm(await f.stage(order, 'synthetic-purse-7213'));
    for (const bill of [second, excess]) {
        assert.ok(bill.flags.some(flag => flag.code === 'deposit-balance')); assert.equal(bill.paymentApproval, undefined);
        await refused('approve-payable', { invoice: bill.id, version: 0, reason: 'Excess deposit must remain held' });
    }
    // Excess evidence stays on its own order family. It cannot grant additional approval or erase the original.
    await refused('need-date-edit',{id:request.id,revision:request.revision,needDate:'2099-06-02',reason:'Date correction cannot reopen deposit capacity'},f.requester);
    await refused('deposit-rule',rule,h.owner);
    await refused('amend', { ...request, id: request.id, reason: 'Change deposit after invoice', poDetails: { deposit: { basis: 'amount', amountMinor: 900000, trigger: 'issue' } } }, f.requester);
    assert.equal((await original()).text, beforePdf.text);
    await cmd('deposit-rule', await f.ruleInput(order, false));
    assert.ok(!(await h.state()).data.cashRequirements.bills.some(row => row.invoice === deposit.id));
    const pausedFinal = await f.stage(order, 'synthetic-purse-7214', 2000000, 'deposit-final');
    await refused('invoice-reading-confirm', pausedFinal.confirm);
    assert.ok((await h.state()).data.invoice.find(row => row.id === deposit.id).paymentApproval, 'Pausing preserves historical approval');

    // A clean independent purchase proves the complete final-bill path without waiving the unsafe evidence above.
    const main = await f.purchase(), mainStage = await f.stage(main.order, 'synthetic-purse-7220');
    await cmd('deposit-rule', await f.ruleInput(main.order));
    const concurrent=await Promise.all([h.send('/api/purse/command/invoice-reading-confirm',mainStage.confirm,f.ap),h.send('/api/purse/command/invoice-reading-confirm',mainStage.confirm,f.ap)]);
    assert.deepEqual(concurrent.map(row=>row.status).sort(),[200,409]);
    let mainDeposit=(await h.state()).data.invoice.find(row=>row.id===concurrent.find(row=>row.status===200).value.invoice);
    for (const flag of mainDeposit.flags) await cmd('invoice-risk-review', { invoice: mainDeposit.id, flag: flag.id, version: (await h.state()).data.invoice.find(row => row.id === mainDeposit.id).riskVersion, reason: 'Distinct machinery purchase and independently checked original' }, f.ap);
    mainDeposit = (await h.state()).data.invoice.find(row => row.id === mainDeposit.id); assert.ok(mainDeposit.paymentApproval);
    const finalStage = await f.stage(main.order, 'synthetic-purse-7221', 2000000, 'deposit-final');
    const finalBill = await f.confirm(finalStage); assert.equal(finalBill.totalMinor, 1000000); assert.equal(finalBill.grossMinor, 2000000); assert.equal(finalBill.depositAppliedMinor, 1000000); assert.equal(finalBill.balance.billedMinor,1000000); assert.equal(finalBill.balance.remainingMinor,1000000); assert.equal(finalBill.balance.unappliedDepositMinor,1000000); assert.equal(finalBill.paymentApproval, undefined);
    await refused('approve-payable', { invoice: finalBill.id, version: 0, reason: 'Premature final approval' });
    const evaluation = {invoice:finalBill.id,termKey:finalBill.depositTermKey,ruleVersion:1,documentSha256:finalBill.document.sha256};
    await refused('deposit-evaluate',evaluation);
    await f.receive(main.order);
    const evaluations=await Promise.all([h.send('/api/purse/command/deposit-evaluate',evaluation,f.ap),h.send('/api/purse/command/deposit-evaluate',evaluation,f.ap)]);
    assert.deepEqual(evaluations.map(row=>row.status).sort(),[200,409]);
    data = (await h.state()).data; const final = data.invoice.find(row => row.id === finalBill.id);
    assert.equal(final.paymentApproval.match, 'deposit-final-three-way'); assert.equal(data.depositApplication.filter(row => row.order === main.order.id).length, 1);
    assert.deepEqual(data.cashRequirements.bills.filter(row => row.order === main.order.id).map(row => row.amountMinor).sort(), [1000000, 1000000]);
    assert.equal(data.cashRequirements.commitments.filter(row => row.order === main.order.id).length, 0);
    assert.equal((await report()).rows.filter(row => row.order === main.order.id && row.kind === 'actual').reduce((n, row) => n + row.amountMinor, 0), 2000000);
    assert.equal(data.periodBudgets.find(row => row.currency === 'USD').sources.find(row => row.order === main.order.id).actualMinor, 2000000);
    assert.ok(!final.sourcePayment && !mainDeposit.sourcePayment && !final.pantry, 'Application never settles either payable or posts a ledger');
    const accrual = await h.send('/api/purse/accrual-report/view?cutoff=2099-12-31', undefined, h.owner);
    assert.equal(accrual.status, 200, JSON.stringify(accrual.value));
    assert.equal(accrual.value.rows.filter(row => row.order === main.order.id).reduce((n, row) => n + row.accrualMinor, 0), 0);
    const prepaid = accrual.value.deposits.find(row => row.invoice === mainDeposit.id); assert.equal(prepaid.amountMinor, 1000000); assert.equal(prepaid.appliedMinor, 1000000);
    const downloadedFinal=await h.mf.dispatchFetch(h.origin+'/api/purse/download/attachment/'+finalStage.source.attachment,{headers:{cookie:f.ap}});
    assert.equal(Buffer.from(await downloadedFinal.arrayBuffer()).toString('base64'),finalStage.document.base64,'Deposit application preserves exact gross supplier original');
    await refused('invoice-reading-confirm', finalStage.confirm);
    const duplicateFinal = await f.stage(main.order, 'synthetic-purse-7222', 2000000, 'deposit-final'); await refused('invoice-reading-confirm', duplicateFinal.confirm);
    await refused('close-order', { id: main.order.id, version: 0, reason: 'Unsupported deposit closure' }, f.buyer);
    const exported = await h.send('/api/purse/accounting', undefined, h.owner); assert.match(exported.value, /deposit-final/); assert.match(exported.value, /Unmapped; unpostable/);
    assert.match((await h.send('/api/purse/audit.csv', undefined, h.owner)).value, /deposit-application/);
    await h.configureMail({PROTECTED_DATA_KEY:createHash('sha256').update('synthetic-purse-7234').digest('hex')});
    const connection=await h.send('/api/purse/pantry/connection',{origin:'https://synthetic-purse.invalid',currency:'USD',token:'synthetic-purse-7235',generation:0,confirmed:true},h.owner);
    assert.equal(connection.status,200,JSON.stringify(connection.value));
    const beforePosting=await records(),unmapped=await h.send('/api/purse/pantry/preview',{invoice:mainDeposit.id,payableVersion:2,accountId:'synthetic-purse-7236'},h.owner);
    assert.equal(unmapped.status,409);assert.match(unmapped.value.error,/deposit bills/);const afterPosting=await records(),priorIds=new Set(beforePosting.map(row=>row.id)),refusalRows=afterPosting.filter(row=>!priorIds.has(row.id));
    assert.equal(refusalRows.length,1);assert.equal(refusalRows[0].kind,'audit');const postingRefusal=JSON.parse(refusalRows[0].value);
    assert.equal(postingRefusal.action,'pantry-use-refused');assert.equal(postingRefusal.status,409);
    assert.deepEqual(afterPosting.filter(row=>row.id!==refusalRows[0].id),beforePosting,'Unmapped refusal preserves all existing audit and purchasing evidence and adds only its refusal audit');

    assert.equal(validatePurchasingArchive(await records()), true);

    const riskPurchase=await f.purchase();await cmd('deposit-rule',await f.ruleInput(riskPurchase.order));
    const riskSource=await f.stage(riskPurchase.order,'synthetic-purse-7230');
    const riskReading=await cmd('invoice-reading-edit',{id:riskSource.reading.id,version:1,changes:[{field:'senderEmail',value:['synthetic-purse-7231','different.invalid'].join('@')},{field:'remitTo',value:'Changed payee, 20 Other Road, Denver CO 80202'}]},f.ap);
    await refused('invoice-reading-confirm',riskSource.confirm);
    const riskResult=await cmd('invoice-reading-confirm',{...riskSource.confirm,version:riskReading.version,remit:{bankRouting:'021000021',bankAccount:'736290184652'}},f.ap);
    const riskBill=(await h.state()).data.invoice.find(row=>row.id===riskResult.invoice);
    for(const code of ['sender-domain','remit-details-changed','remit-baseline-missing'])assert.ok(riskBill.flags.some(flag=>flag.code===code),code);
    assert.equal(riskBill.paymentApproval,undefined);
    await refused('deposit-evaluate',{invoice:riskBill.id,termKey:riskBill.depositTermKey,ruleVersion:1,documentSha256:riskBill.document.sha256});

    const archive = join(h.dir, 'synthetic-purse-7223.rer');
    await exportArchive(await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability }), archive, []);
    const restored = await harness({ empty: true }); t.after(() => restored.close());
    await importArchive(await createPortability({ db: restored.db, buckets: { ORIGINALS: restored.originals }, policy: portability }), archive, []);
    assert.equal(await restored.db.prepare('SELECT count(*) AS n FROM p_deposit_rule_authority').first('n'), 0);
    const owner = await restored.send('/auth/bootstrap', { token: 'synthetic-local-test-bootstrap-token-0123456789', displayName: 'New owner' });
    assert.equal(owner.status, 303);
    const restoredData = (await restored.send('/api/purse/state', undefined, owner.cookie)).value.data;
    assert.equal(restoredData.depositApplication.length, 1); assert.ok(restoredData.invoice.find(row => row.id === mainDeposit.id).paymentApproval);
    assert.equal(restoredData.order.find(row => row.id === main.order.id).nativeDepositPosition.enabled, false);
    assert.equal(restoredData.cashRequirements.bills.filter(row => row.order === main.order.id).length, 0);

    // A later duplicate original suspends eligibility without erasing either genuine approval.
    await cmd('attachment', { kind: 'invoice', record: mainDeposit.id, name: staged.document.name, mediaType: staged.document.mediaType, base64: staged.document.base64 }, f.ap);
    data = (await h.state()).data;
    assert.ok(data.invoice.find(row => row.id === mainDeposit.id).flags.some(flag => flag.code === 'duplicate-document'));
    assert.ok(data.invoice.find(row => row.id === mainDeposit.id).paymentApproval);
    assert.equal(data.cashRequirements.bills.filter(row => row.order === main.order.id).length, 0);
    await cmd('member', { email: depositEmail(7203), name: 'Revoked AP', active: true, roles: ['requester'] });
    await refused('invoice-source', { order: main.order.id, document: await depositDocument(main.order, 'synthetic-purse-7224', 1000000) }, f.ap, 403);
    assert.equal((await h.send(privateUrl, undefined, f.ap)).status, 403);
    assert.equal((await h.send('/auth/signout',{},f.ap)).status,204);
    await refused('invoice-source',{order:main.order.id,document:await depositDocument(main.order,'synthetic-purse-7224',1000000)},f.ap,401);
    await reauthenticateErasure(h);
    const inventory = await h.send('/api/purse/erasure', undefined, h.owner);
    const preview = await h.send('/api/purse/erasure/preview', { kind: 'contact', id: f.supplier.id, email: depositEmail(7206), revision: inventory.value.revision }, h.owner);
    assert.equal(preview.status, 200, JSON.stringify(preview.value));
    const erased = await h.send('/api/purse/erasure/execute', { ...preview.value.subject, revision: preview.value.revision, review: preview.value.review, fingerprint: preview.value.fingerprint, consent: true }, h.owner);
    assert.equal(erased.status, 200, JSON.stringify(erased.value)); assert.equal((await h.send(privateUrl, undefined, h.owner)).status, 410);
    await refused('invoice-reading-confirm', staged.confirm, h.owner);
    await refused('invoice-source',{order:order.id,document:staged.document},h.owner);
    await refused('attachment',{kind:'invoice',record:deposit.id,...staged.document},h.owner);
    assert.equal((await h.state()).data.depositApplication.length, 1); assert.equal(validatePurchasingArchive(await records()), true);
    const latest=join(h.dir,'synthetic-purse-7232.rer');
    await exportArchive(await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),latest,[]);
    const erasedRestore=await harness({empty:true});t.after(()=>erasedRestore.close());
    await importArchive(await createPortability({db:erasedRestore.db,buckets:{ORIGINALS:erasedRestore.originals},policy:portability}),latest,[]);
    const freshOwner=await erasedRestore.send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'Owner of erased history'});assert.equal(freshOwner.status,303);
    assert.equal((await erasedRestore.send(privateUrl,undefined,freshOwner.cookie)).status,410);
    assert.equal((await erasedRestore.send('/api/purse/command/invoice-source',{order:order.id,document:staged.document},freshOwner.cookie)).status,409);
    const anonymous=(await erasedRestore.send('/api/purse/state',undefined,freshOwner.cookie)).value.data;
    assert.equal(anonymous.depositApplication.length,1);assert.ok(!JSON.stringify(anonymous).includes(depositEmail(7206)));
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
    const cleanup=[];
    try {await depositsJourney({after:fn=>cleanup.push(fn)});console.log('Native deposit sanity journey passed');}
    finally {for(const close of cleanup.reverse())await close();}
}
