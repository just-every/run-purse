import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import { harness } from './purse-harness.mjs';
import { nativeWebContext } from './native-web-fixture.mjs';
import { adoptedSendFixture, orderSendFixture, orderLink, orderMessage } from './order-send-fixture.mjs';

export async function orderSendJourney(browser, bundle, width, evidence) {
    let attempts=0;const h=await harness({mail:async message=>message.subject.startsWith('Change order ')&&++attempts===1?new Response('synthetic-purse-2892',{status:500}):Response.json({id:crypto.randomUUID()})}),contexts=[];let restored;
    try {
        const f=await orderSendFixture(h),errors=[];
        const open=async cookie=>{const context=await nativeWebContext(browser,h,width,bundle,cookie);contexts.push(context);const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));return page;};
        const buyer=await open(f.buyer),requester=await open(f.requester);
        await buyer.goto(h.origin+'/app?tab=Orders');
        await buyer.getByRole('row').filter({has:buyer.getByText(f.order.number,{exact:true})}).filter({has:buyer.getByText('issued',{exact:true})}).getByRole('button',{name:'Open order',exact:true}).click();
        const panel=buyer.getByRole('region',{name:'Supplier change order',exact:true});
        await panel.getByText('This order revision has not been sent to the supplier.',{exact:true}).waitFor();
        await panel.getByText('Send approved change order',{exact:true}).click();
        await panel.getByLabel('Supplier change-order contact',{exact:true}).fill('synthetic-purse-2820@example.test');
        await panel.getByLabel('Change-order send reason',{exact:true}).fill('Buyer reviewed the requester date correction');
        await panel.getByRole('checkbox').check();
        const accepted=buyer.waitForResponse(response=>response.url().endsWith('/api/purse/order-send')&&response.request().method()==='POST');
        await panel.getByRole('button',{name:'Send exact change order',exact:true}).click();assert.equal((await accepted).status(),200);
        await panel.getByText('The send outcome is uncertain.',{exact:false}).waitFor();
        const oldLink=orderLink(h),original=orderMessage(h);
        await panel.getByText('Resend exact frozen order',{exact:true}).click();
        const resendForm=panel.locator('form').filter({has:buyer.getByRole('button',{name:'Send a new attempt',exact:true})});
        await resendForm.getByLabel('Resend reason',{exact:true}).fill('synthetic-purse-2893 reviewed provider uncertainty');await resendForm.getByRole('checkbox').check();
        const retry=buyer.waitForResponse(response=>response.url().endsWith('/api/purse/order-send')&&response.request().method()==='POST');await resendForm.getByRole('button',{name:'Send a new attempt',exact:true}).click();assert.equal((await retry).status(),200);
        assert.equal((await fetch(oldLink)).status,410);assert.deepEqual(h.messages.filter(message=>message.subject.startsWith('Change order ')).at(-1).attachments,original.attachments);
        await panel.getByText('Mail provider accepted this change order. Mailbox delivery is not confirmed.',{exact:false}).waitFor();
        await panel.getByText('Send attempt history',{exact:true}).click();await panel.getByText(/Attempt 1.*uncertain.*Link withdrawn/).waitFor();await panel.getByText(/Attempt 2.*accepted/).waitFor();
        await buyer.screenshot({path:join(evidence,`PO-004-buyer-sent-${width}.png`),fullPage:true});
        const link=new URL(h.messages.filter(message=>message.subject.startsWith('Change order ')).at(-1).text.split(/\s+/).find(word=>word.startsWith(h.origin+'/api/purse/order-link/'))),supplierContext=await browser.newContext({viewport:{width,height:1000}});contexts.push(supplierContext);const supplier=await supplierContext.newPage();
        await supplier.goto(link.href);await supplier.getByRole('heading',{name:'Change order 1 · approved revision 2',exact:true}).waitFor();
        const pdf=await supplierContext.request.get(link.href+'/pdf');assert.equal(pdf.status(),200);assert.deepEqual(await pdf.body(),Buffer.from(orderMessage(h).attachments[0].content,'base64'));
        await writeFile(join(evidence,`PO-004-supplier-${width}.pdf`),await pdf.body());
        for(let index=0;index<2;index++){const original=await supplierContext.request.get(link.href+'/original/'+index);assert.equal(original.status(),200);assert.deepEqual(await original.body(),Buffer.from(index?f.certificate:f.terms,'base64'));}
        await supplier.screenshot({path:join(evidence,`PO-004-supplier-review-${width}.png`),fullPage:true});
        const acknowledgmentForm=supplier.locator('form').filter({has:supplier.getByRole('button',{name:'Acknowledge revision 2',exact:true})});await acknowledgmentForm.getByLabel('Your name',{exact:true}).fill('synthetic-purse-2821');await acknowledgmentForm.getByRole('checkbox').check();const acknowledgmentResponse=supplier.waitForResponse(response=>response.request().method()==='POST'&&response.url()===link.href);await supplier.getByRole('button',{name:'Acknowledge revision 2',exact:true}).click();const acknowledgment=await acknowledgmentResponse;assert.equal(acknowledgment.status(),200,await acknowledgment.text());const acknowledgmentHeaders=await acknowledgment.request().allHeaders();assert.ok(!acknowledgmentHeaders.referer||new URL(acknowledgmentHeaders.referer).pathname==='/', 'Acknowledgment does not expose the private supplier-link path in a referrer');
        await supplier.getByRole('heading',{name:'Change order 1 acknowledged',exact:true}).waitFor();
        await supplier.screenshot({path:join(evidence,`PO-004-supplier-acknowledged-${width}.png`),fullPage:true});
        await panel.getByRole('button',{name:'Refresh supplier acknowledgment',exact:true}).click();await panel.getByText(/Supplier acknowledged Change order 1, approved revision 2/).waitFor();
        await buyer.locator('section.panel').filter({has:buyer.getByRole('heading',{name:'Supplier follow-up',exact:true})}).getByText(/Supplier acknowledged approved revision 2/).waitFor();
        await buyer.screenshot({path:join(evidence,`PO-004-buyer-acknowledged-${width}.png`),fullPage:true});
        await requester.goto(h.origin+'/app?tab=Requests');await requester.getByRole('article').filter({hasText:'synthetic-purse-2815'}).getByRole('button',{name:'Open request',exact:true}).click();
        const requesterPanel=requester.getByRole('region',{name:'Supplier change order',exact:true});await requesterPanel.getByText(/Supplier acknowledged Change order 1, approved revision 2/).waitFor();
        assert.equal(await requesterPanel.getByText('Send approved change order',{exact:true}).count(),0,'Requester reads current acknowledgment without buyer send authority');
        await requester.screenshot({path:join(evidence,`PO-012-requester-acknowledged-${width}.png`),fullPage:true});
        const respond = async (decision, date) => {
            const form=supplier.locator('form').filter({has:supplier.getByRole('button',{name:'Record supplier response',exact:true})});
            await form.getByLabel('Your response name',{exact:true}).fill('synthetic-purse-2877');await form.getByLabel('Response',{exact:true}).selectOption(decision);await form.getByLabel('Promised delivery date',{exact:false}).fill(date);await form.getByRole('checkbox').check();
            const outcome=supplier.waitForResponse(response=>response.url()===link.href&&response.request().method()==='POST');await form.getByRole('button',{name:'Record supplier response',exact:true}).click();const result=await outcome;assert.equal(result.status(),200,await result.text());await supplier.getByRole('heading',{name:'Supplier response recorded',exact:true}).waitFor();
        };
        await supplier.goto(link.href);await respond('accept','2026-11-12');
        await panel.getByRole('button',{name:'Refresh supplier acknowledgment',exact:true}).click();await panel.getByText(/Supplier response to approved revision 2: Accepted\. Promised delivery: 2026-11-12/).waitFor();
        await supplier.goto(link.href);await respond('reject','');
        await panel.getByRole('button',{name:'Refresh supplier acknowledgment',exact:true}).click();await panel.getByText(/Supplier response to approved revision 2: Rejected\. Promised delivery: No promise on rejected order/).waitFor();assert.equal(await panel.getByRole('button',{name:'Create amendment draft from supplier response',exact:true}).count(),0);
        await supplier.goto(link.href);await supplier.getByLabel('Quantity',{exact:true}).fill('3.125');await supplier.getByLabel('Unit price (USD)',{exact:true}).fill('112.25');await supplier.getByLabel('Response note',{exact:true}).fill('synthetic-purse-2878');await respond('change','2026-11-22');
        await supplier.screenshot({path:join(evidence,`PO-004-supplier-response-${width}.png`),fullPage:true});
        await panel.getByRole('button',{name:'Refresh supplier acknowledgment',exact:true}).click();await panel.getByText(/Supplier response to approved revision 2: Accepted with proposed changes/).waitFor();
        for(const text of ['Supplier response 1 · Accepted','Supplier response 2 · Rejected','Supplier response 3 · Accepted with proposed changes'])await panel.getByText(text,{exact:true}).waitFor();
        await panel.getByText('Supplier response 3 · Accepted with proposed changes',{exact:true}).click();await panel.getByText(/quantity 2 → 3.125; unit price/).waitFor();await panel.getByText(/stated identity is unverified/).waitFor();
        await buyer.screenshot({path:join(evidence,`PO-004-buyer-proposal-${width}.png`),fullPage:true});
        await requesterPanel.getByRole('button',{name:'Refresh supplier acknowledgment',exact:true}).click();await requesterPanel.getByText(/Supplier response to approved revision 2: Accepted with proposed changes/).waitFor();assert.equal(await requesterPanel.getByRole('button',{name:'Create amendment draft from supplier response',exact:true}).count(),0);
        await requester.screenshot({path:join(evidence,`PO-004-requester-proposal-${width}.png`),fullPage:true});
        const composer=requester.locator('.composer'),icon=composer.getByRole('button',{name:'New purchase request',exact:true}),tooltip=composer.getByRole('tooltip');await icon.focus();assert.equal(await tooltip.isVisible(),true);await composer.getByRole('textbox').focus();await tooltip.waitFor({state:'hidden'});await icon.hover();await tooltip.waitFor({state:'visible'});
        const unchanged=(await h.state()).data.order.find(row=>row.id===f.order.id);assert.equal(unchanged.lines[0].quantity,'2');assert.equal(unchanged.lines[0].unitMinor,10000);assert.deepEqual(await (await supplierContext.request.get(link.href+'/pdf')).body(),await pdf.body());
        for(let index=0;index<2;index++)assert.deepEqual(await (await supplierContext.request.get(link.href+'/original/'+index)).body(),Buffer.from(index?f.certificate:f.terms,'base64'));
        for(const page of [buyer,requester,supplier])assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No overflow at '+width);
        await panel.getByLabel('Amendment reason',{exact:true}).fill('synthetic-purse-2879');await panel.getByLabel('Use the supplier-promised date as the amendment’s need date.',{exact:true}).check();await panel.getByLabel('I adopt this exact supplier proposal into a draft that needs renewed approval.',{exact:true}).check();
        const adoption=buyer.waitForResponse(response=>response.url().endsWith('/adopt-response')&&response.request().method()==='POST');await panel.getByRole('button',{name:'Create amendment draft from supplier response',exact:true}).click();const adopted=await adoption;assert.equal(adopted.status(),200,await adopted.text());
        const draft=(await h.state()).data.request.find(row=>row.id===f.request.id);assert.equal(draft.status,'draft');assert.equal(draft.revision,3);assert.equal(draft.amends,f.order.id);assert.equal(draft.lines[0].quantity,'3.125');assert.equal(draft.lines[0].unitMinor,11225);assert.equal(draft.needDate,'2026-11-22');assert.equal(h.messages.filter(message=>message.subject.startsWith('Change order ')).length,2);
        assert.equal((await h.send('/api/purse/command/convert',{id:draft.id,revision:3,issue:true},f.buyer)).status,409);assert.equal((await supplierContext.request.get(link.href)).status(),410);
        await h.command('submit',{id:draft.id,revision:3},f.requester);await h.command('decision',{id:draft.id,revision:3,decision:'approved',reason:'synthetic-purse-2897'},f.approver);
        const renewed=await h.command('convert',{id:draft.id,revision:3,issue:true},f.buyer);
        await buyer.goto(h.origin+'/app?tab=Orders');await buyer.getByRole('row').filter({has:buyer.getByText(renewed.number,{exact:true})}).getByRole('button',{name:'Open order',exact:true}).click();
        await buyer.getByText('Prepare approved cancellation',{exact:true}).click();await buyer.getByLabel('Cancellation reason',{exact:true}).fill('synthetic-purse-2898');
        const cancellation=buyer.waitForResponse(response=>response.url().endsWith('/command/propose-order-cancellation'));await buyer.getByRole('button',{name:'Create cancellation draft',exact:true}).click();assert.equal((await cancellation).status(),200);
        await h.command('submit',{id:draft.id,revision:4},f.requester);await h.command('decision',{id:draft.id,revision:4,decision:'approved',reason:'synthetic-purse-2899'},f.approver);const cancelled=await h.command('convert',{id:draft.id,revision:4,issue:true},f.buyer);
        assert.equal(cancelled.status,'cancelled');await buyer.goto(h.origin+'/app?tab=Orders');await buyer.getByRole('row').filter({has:buyer.getByText(cancelled.number,{exact:true})}).getByRole('button',{name:'Open order',exact:true}).click();
        await panel.getByText('Send approved change order',{exact:true}).click();await panel.getByLabel('Supplier change-order contact',{exact:true}).fill(original.to[0]);await panel.getByLabel('Change-order send reason',{exact:true}).fill('synthetic-purse-2900');await panel.getByRole('checkbox').check();
        const cancelSend=buyer.waitForResponse(response=>response.url().endsWith('/api/purse/order-send')&&response.request().method()==='POST');await panel.getByRole('button',{name:'Send exact change order',exact:true}).click();assert.equal((await cancelSend).status(),200);
        const cancelMessage=h.messages.filter(message=>message.subject.startsWith('Change order ')).at(-1),cancelLink=new URL(cancelMessage.text.split(/\s+/).find(word=>word.startsWith(h.origin+'/api/purse/order-link/')));
        await supplier.goto(cancelLink.href);await supplier.getByRole('heading',{name:'Change order 3 · approved revision 4',exact:true}).waitFor();await supplier.getByText('Approved cancellation',{exact:true}).waitFor();
        await supplier.getByText('Accept, propose changes or reject',{exact:true}).click();const cancelForm=supplier.locator('form').filter({has:supplier.getByRole('button',{name:'Record supplier response',exact:true})});await cancelForm.getByLabel('Your response name',{exact:true}).fill('synthetic-purse-2901');await cancelForm.getByLabel('Response',{exact:true}).selectOption('accept');await cancelForm.getByRole('checkbox').check();
        const cancelResponse=supplier.waitForResponse(response=>response.url()===cancelLink.href&&response.request().method()==='POST');await cancelForm.getByRole('button',{name:'Record supplier response',exact:true}).click();assert.equal((await cancelResponse).status(),200);
        await panel.getByRole('button',{name:'Refresh supplier acknowledgment',exact:true}).click();await panel.getByText(/Supplier response to approved revision 4: Accepted/).waitFor();assert.equal(await panel.getByRole('button',{name:'Create amendment draft from supplier response',exact:true}).count(),0);
        assert.equal((await h.state()).data.order.find(row=>row.id===cancelled.id).status,'cancelled');assert.deepEqual(await (await supplierContext.request.get(cancelLink.href+'/pdf')).body(),Buffer.from(cancelMessage.attachments[0].content,'base64'));
        await buyer.screenshot({path:join(evidence,`PO-004-cancellation-buyer-${width}.png`),fullPage:true});await supplier.screenshot({path:join(evidence,`PO-004-cancellation-supplier-${width}.png`),fullPage:true});
        for(const page of [buyer,supplier])assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Cancellation screen fits '+width);
        const adoptedPurchase=await adoptedSendFixture(h);await buyer.goto(h.origin+'/app?tab=Orders');await buyer.getByRole('row').filter({has:buyer.getByText(adoptedPurchase.order.number,{exact:true})}).getByRole('button',{name:'Open order',exact:true}).click();
        const adoptedPanel=buyer.getByRole('region',{name:'Supplier purchase order',exact:true});await adoptedPanel.getByText('Resend adopted purchase order',{exact:true}).click();await adoptedPanel.getByLabel('Supplier order contact',{exact:true}).fill(original.to[0]);await adoptedPanel.getByLabel('Purchase-order send reason',{exact:true}).fill('synthetic-purse-2906');await adoptedPanel.getByRole('checkbox').check();
        const adoptedSend=buyer.waitForResponse(response=>response.url().endsWith('/api/purse/order-send')&&response.request().method()==='POST');await adoptedPanel.getByRole('button',{name:'Send exact purchase order',exact:true}).click();assert.equal((await adoptedSend).status(),200);
        const adoptedMessage=h.messages.find(message=>message.subject.startsWith('Adopted purchase order:')),adoptedLink=new URL(adoptedMessage.text.split(/\s+/).find(word=>word.startsWith(h.origin+'/api/purse/order-link/')));
        await supplier.goto(adoptedLink.href);await supplier.getByRole('heading',{name:'Adopted purchase order · historical revision 1',exact:true}).waitFor();await supplier.getByText(/Legacy document fields not recorded/).waitFor();
        assert.deepEqual(await (await supplierContext.request.get(adoptedLink.href+'/pdf')).body(),Buffer.from(adoptedMessage.attachments[0].content,'base64'));
        const adoptedForm=supplier.locator('form');await adoptedForm.getByLabel('Your name',{exact:true}).fill('synthetic-purse-2907');await adoptedForm.getByLabel('Response',{exact:true}).selectOption('accept');await adoptedForm.getByLabel('Promised delivery date',{exact:false}).fill('2026-11-22');await adoptedForm.getByRole('checkbox').check();
        const adoptedResponse=supplier.waitForResponse(response=>response.url()===adoptedLink.href&&response.request().method()==='POST');await adoptedForm.getByRole('button',{name:'Record supplier response',exact:true}).click();assert.equal((await adoptedResponse).status(),200);
        await adoptedPanel.getByRole('button',{name:'Refresh supplier acknowledgment',exact:true}).click();await adoptedPanel.getByText(/Supplier response to historical revision 1: Accepted/).waitFor();
        const retained=(await h.state()).data.order.find(row=>row.id===adoptedPurchase.order.id);assert.equal(retained.status,'adopted');assert.equal(retained.issuedAt,null);
        await buyer.screenshot({path:join(evidence,`PO-004-adopted-buyer-${width}.png`),fullPage:true});await supplier.screenshot({path:join(evidence,`PO-004-adopted-supplier-${width}.png`),fullPage:true});
        for(const page of [buyer,supplier])assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Adopted screen fits '+width);
        const source=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive=join(evidence,`PO-004-${width}.rer`);await exportArchive(source,archive,[]);
        restored=await harness();const destination=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});await importArchive(destination,archive,[]);
        for(const kind of ['orderSend','orderAcknowledgment','orderSupplierResponse','supplierOrderEvidence']){const rows=async db=>(await db.prepare('SELECT * FROM p_records WHERE kind=? ORDER BY id').bind(kind).all()).results;assert.deepEqual(await rows(h.db),await rows(restored.db));}
        const restoredLink=new URL(link.href);restoredLink.host=new URL(restored.origin).host;assert.equal((await fetch(restoredLink)).status,410,'Archive never restores bearer authority');assert.equal((await fetch(restoredLink,{method:'POST',headers:{origin:restored.origin,'content-type':'application/json'},body:JSON.stringify({revision:2,version:3,decision:'accept',promisedDate:'2026-11-22',name:'synthetic-purse-2880',consent:true})})).status,410);
        assert.equal((await restored.db.prepare('SELECT count(*) AS n FROM p_order_send_links').first()).n,0);
        for(const url of [cancelLink,adoptedLink]){const inert=new URL(url);inert.host=new URL(restored.origin).host;assert.equal((await fetch(inert)).status,410);}
        assert.deepEqual(errors,[]);
        return {width,order:f.order.id,revision:2,changeOrder:1,responses:['accept','reject','change'],amendmentDraft:3,provider:'network-edge acceptance only',archive};
    } finally {for(const context of contexts)await context.close();await restored?.close();await h.close();}
}

export async function initialOrderSendJourney(browser, bundle, width, evidence) {
    const h = await harness(), contexts = []; let restored;
    try {
        const f = await orderSendFixture(h), errors = [];
        const request = await h.command('request', { ...f.request, id: undefined, revision: undefined, title: 'synthetic-purse-2860', needDate: '2026-11-01', lines: f.request.lines.map(line => ({ ...line, id: undefined })) }, f.requester);
        await h.command('submit', { id: request.id, revision: 1 }, f.requester); await h.command('decision', { id: request.id, revision: 1, decision: 'approved', reason: 'synthetic-purse-2861' }, f.approver);
        const order = await h.command('convert', { id: request.id, revision: 1, issue: true }, f.buyer);
        const open = async cookie => { const context = await nativeWebContext(browser, h, width, bundle, cookie); contexts.push(context); const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); return page; };
        const buyer = await open(f.buyer), requester = await open(f.requester);
        await buyer.goto(h.origin + '/app?tab=Orders'); await buyer.getByRole('row').filter({ has: buyer.getByText(order.number, { exact: true }) }).getByRole('button', { name: 'Open order', exact: true }).click();
        const panel = buyer.getByRole('region', { name: 'Supplier purchase order', exact: true }); await panel.getByText('Send approved purchase order', { exact: true }).click();
        await panel.getByLabel('Supplier order contact', { exact: true }).fill('synthetic-purse-2862@example.test'); await panel.getByLabel('Purchase-order send reason', { exact: true }).fill('synthetic-purse-2863'); await panel.getByRole('checkbox').check();
        const send = buyer.waitForResponse(response => response.url().endsWith('/api/purse/order-send') && response.request().method() === 'POST'); await panel.getByRole('button', { name: 'Send exact purchase order', exact: true }).click(); assert.equal((await send).status(), 200);
        await panel.getByText('Mail provider accepted this purchase order. Mailbox delivery is not confirmed.', { exact: false }).waitFor();
        const message = h.messages.find(message => message.subject.startsWith('Purchase order:')), link = new URL(message.text.split(/\s+/).find(word => word.startsWith(h.origin + '/api/purse/order-link/')));
        const supplierContext = await browser.newContext({ viewport: { width, height: 1000 } }); contexts.push(supplierContext); const supplier = await supplierContext.newPage();
        await supplier.goto(link.href); await supplier.getByRole('heading', { name: 'Purchase order · approved revision 1', exact: true }).waitFor();
        const pdf = await supplierContext.request.get(link.href + '/pdf'); assert.equal(pdf.status(), 200); assert.deepEqual(await pdf.body(), Buffer.from(message.attachments[0].content, 'base64')); await writeFile(join(evidence, `PO-001-supplier-${width}.pdf`), await pdf.body());
        for (let index = 0; index < 2; index++) { const original = await supplierContext.request.get(link.href + '/original/' + index); assert.equal(original.status(), 200); assert.deepEqual(await original.body(), Buffer.from(index ? f.certificate : f.terms, 'base64')); }
        await supplier.screenshot({ path: join(evidence, `PO-001-supplier-review-${width}.png`), fullPage: true });
        const respond = async (decision, date) => { await supplier.getByLabel('Your name', { exact: true }).fill('synthetic-purse-2864'); await supplier.getByLabel('Response', { exact: true }).selectOption(decision); await supplier.getByLabel('Promised delivery date', { exact: false }).fill(date); await supplier.getByRole('checkbox').check(); const outcome = supplier.waitForResponse(response => response.url() === link.href && response.request().method() === 'POST'); await supplier.getByRole('button', { name: 'Record supplier response', exact: true }).click(); const result = await outcome; assert.equal(result.status(), 200, await result.text()); await supplier.getByRole('heading', { name: 'Supplier response recorded', exact: true }).waitFor(); };
        await respond('accept', '2026-11-08');
        await panel.getByRole('button', { name: 'Refresh supplier acknowledgment', exact: true }).click(); await panel.getByText(/Supplier response to approved revision 1: Accepted\. Promised delivery: 2026-11-08/).waitFor();
        await supplier.goto(link.href); await supplier.getByLabel('Quantity', { exact: true }).fill('3'); await supplier.getByLabel('Unit price (USD)', { exact: true }).fill('112.25'); await supplier.getByLabel('Response note', { exact: true }).fill('synthetic-purse-2865'); await respond('change', '2026-11-22');
        await panel.getByRole('button', { name: 'Refresh supplier acknowledgment', exact: true }).click(); await panel.getByText(/Supplier response to approved revision 1: Accepted with proposed changes/).waitFor();
        await panel.getByText('Supplier response 2 · Accepted with proposed changes', { exact: true }).click(); await panel.getByText(/quantity 2 → 3; unit price/).waitFor();
        await buyer.screenshot({ path: join(evidence, `PO-001-buyer-response-${width}.png`), fullPage: true });
        await requester.goto(h.origin + '/app?tab=Requests'); await requester.getByRole('article').filter({ hasText: 'synthetic-purse-2860' }).getByRole('button', { name: 'Open request', exact: true }).click();
        const requesterPanel = requester.getByRole('region', { name: 'Supplier purchase order', exact: true }); await requesterPanel.getByText(/Supplier response to approved revision 1: Accepted with proposed changes/).waitFor(); assert.equal(await requesterPanel.getByRole('button', { name: 'Create amendment draft from supplier response', exact: true }).count(), 0);
        await requester.screenshot({ path: join(evidence, `PO-001-requester-response-${width}.png`), fullPage: true });
        const composer = requester.locator('.composer'), icon = composer.getByRole('button', { name: 'New purchase request', exact: true }), tooltip = composer.getByRole('tooltip'); await icon.focus(); assert.equal(await tooltip.isVisible(), true, 'Keyboard focus immediately describes the icon'); await requester.screenshot({path:join(evidence,`PO-001-request-tooltip-focus-${width}.png`)}); await composer.getByRole('textbox').focus(); await tooltip.waitFor({state:'hidden'}); await icon.hover(); await tooltip.waitFor({state:'visible'}); await requester.screenshot({path:join(evidence,`PO-001-request-tooltip-hover-${width}.png`)});
        for (const page of [buyer, requester, supplier]) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No overflow at ' + width);
        const before = (await h.state()).data.order.find(row => row.id === order.id); assert.equal(before.lines[0].unitMinor, 10000);
        await panel.getByLabel('Amendment reason', { exact: true }).fill('synthetic-purse-2866'); await panel.getByLabel('Use the supplier-promised date as the amendment’s need date.', { exact: true }).check(); await panel.getByLabel('I adopt this exact supplier proposal into a draft that needs renewed approval.', { exact: true }).check();
        const adoption = buyer.waitForResponse(response => response.url().endsWith('/adopt-response') && response.request().method() === 'POST'); await panel.getByRole('button', { name: 'Create amendment draft from supplier response', exact: true }).click(); const adopted = await adoption; assert.equal(adopted.status(), 200, await adopted.text());
        const draft = (await h.state()).data.request.find(row => row.id === request.id); assert.equal(draft.status, 'draft'); assert.equal(draft.revision, 2); assert.equal(draft.lines[0].unitMinor, 11225); assert.equal(draft.needDate, '2026-11-22'); assert.equal(h.messages.filter(message => message.subject.startsWith('Purchase order:')).length, 1);
        assert.equal((await supplierContext.request.get(link.href)).status(), 410, 'Draft adoption closes old revision capability');
        const source = await createPortability({ db: h.db, buckets: { ORIGINALS: h.originals }, policy: portability }), archive = join(evidence, `PO-001-${width}.rer`); await exportArchive(source, archive, []);
        restored = await harness(); const destination = await createPortability({ db: restored.db, buckets: { ORIGINALS: restored.originals }, policy: portability }); await importArchive(destination, archive, []);
        for (const kind of ['orderSend', 'orderAcknowledgment', 'orderSupplierResponse', 'supplierOrderEvidence']) { const rows = async db => (await db.prepare('SELECT * FROM p_records WHERE kind=? ORDER BY id').bind(kind).all()).results; assert.deepEqual(await rows(h.db), await rows(restored.db)); }
        const restoredLink = new URL(link.href); restoredLink.host = new URL(restored.origin).host; assert.equal((await fetch(restoredLink)).status, 410); assert.equal((await restored.db.prepare('SELECT count(*) AS n FROM p_order_send_links').first()).n, 0);
        assert.deepEqual(errors, []); return { width, order: order.id, initialRevision: 1, supplierResponses: 2, amendmentDraft: 2, provider: 'network-edge acceptance only; live delivery/bounce qualification pending', archive };
    } finally { for (const context of contexts) await context.close(); await restored?.close(); await h.close(); }
}

async function main() {
    const selected=process.argv.find(argument=>argument.startsWith('--width=')),widths=selected?[Number(selected.slice(8))]:[1440,390];
    assert.ok(widths.every(width=>[1440,390].includes(width)),'Use 1440 or 390');
    const evidence=resolve(process.env.PURSE_EVIDENCE??'.cache/order-send');await mkdir(evidence,{recursive:true});
    const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
    const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE??'@playwright/test');
    const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic','--no-sandbox'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
    try {for(const width of widths){console.log(JSON.stringify(await orderSendJourney(browser,bundle.outputFiles[0].text,width,evidence)));console.log(JSON.stringify(await initialOrderSendJourney(browser,bundle.outputFiles[0].text,width,evidence)));}} finally {await browser.close();}
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
