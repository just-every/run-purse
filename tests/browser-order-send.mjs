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
import { orderSendFixture, orderLink, orderMessage } from './order-send-fixture.mjs';

export async function orderSendJourney(browser, bundle, width, evidence) {
    const h=await harness(),contexts=[];let restored;
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
        await panel.getByText('Mail provider accepted this change order. Mailbox delivery is not confirmed.',{exact:false}).waitFor();
        await buyer.screenshot({path:join(evidence,`PO-004-buyer-sent-${width}.png`),fullPage:true});
        const link=orderLink(h),supplierContext=await browser.newContext({viewport:{width,height:1000}});contexts.push(supplierContext);const supplier=await supplierContext.newPage();
        await supplier.goto(link.href);await supplier.getByRole('heading',{name:'Change order 1 · approved revision 2',exact:true}).waitFor();
        const pdf=await supplierContext.request.get(link.href+'/pdf');assert.equal(pdf.status(),200);assert.deepEqual(await pdf.body(),Buffer.from(orderMessage(h).attachments[0].content,'base64'));
        await writeFile(join(evidence,`PO-004-supplier-${width}.pdf`),await pdf.body());
        for(let index=0;index<2;index++){const original=await supplierContext.request.get(link.href+'/original/'+index);assert.equal(original.status(),200);assert.deepEqual(await original.body(),Buffer.from(index?f.certificate:f.terms,'base64'));}
        await supplier.screenshot({path:join(evidence,`PO-004-supplier-review-${width}.png`),fullPage:true});
        await supplier.getByLabel('Your name',{exact:true}).fill('synthetic-purse-2821');await supplier.getByRole('checkbox').check();const acknowledgmentResponse=supplier.waitForResponse(response=>response.request().method()==='POST'&&response.url()===link.href);await supplier.getByRole('button',{name:'Acknowledge revision 2',exact:true}).click();const acknowledgment=await acknowledgmentResponse;assert.equal(acknowledgment.status(),200,await acknowledgment.text());const acknowledgmentHeaders=await acknowledgment.request().allHeaders();assert.ok(!acknowledgmentHeaders.referer||new URL(acknowledgmentHeaders.referer).pathname==='/', 'Acknowledgment does not expose the private supplier-link path in a referrer');
        await supplier.getByRole('heading',{name:'Change order 1 acknowledged',exact:true}).waitFor();
        await supplier.screenshot({path:join(evidence,`PO-004-supplier-acknowledged-${width}.png`),fullPage:true});
        await panel.getByRole('button',{name:'Refresh supplier acknowledgment',exact:true}).click();await panel.getByText(/Supplier acknowledged Change order 1, approved revision 2/).waitFor();
        await buyer.locator('section.panel').filter({has:buyer.getByRole('heading',{name:'Supplier follow-up',exact:true})}).getByText(/Supplier acknowledged approved revision 2/).waitFor();
        await buyer.screenshot({path:join(evidence,`PO-004-buyer-acknowledged-${width}.png`),fullPage:true});
        await requester.goto(h.origin+'/app?tab=Requests');await requester.getByRole('article').filter({hasText:'synthetic-purse-2815'}).getByRole('button',{name:'Open request',exact:true}).click();
        const requesterPanel=requester.getByRole('region',{name:'Supplier change order',exact:true});await requesterPanel.getByText(/Supplier acknowledged Change order 1, approved revision 2/).waitFor();
        assert.equal(await requesterPanel.getByText('Send approved change order',{exact:true}).count(),0,'Requester reads current acknowledgment without buyer send authority');
        await requester.screenshot({path:join(evidence,`PO-012-requester-acknowledged-${width}.png`),fullPage:true});
        for(const page of [buyer,requester,supplier])assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No overflow at '+width);
        const source=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability}),archive=join(evidence,`PO-004-${width}.rer`);await exportArchive(source,archive,[]);
        restored=await harness();const destination=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});await importArchive(destination,archive,[]);
        for(const kind of ['orderSend','orderAcknowledgment']){const rows=async db=>(await db.prepare('SELECT * FROM p_records WHERE kind=? ORDER BY id').bind(kind).all()).results;assert.deepEqual(await rows(h.db),await rows(restored.db));}
        const restoredLink=new URL(link.href);restoredLink.host=new URL(restored.origin).host;assert.equal((await fetch(restoredLink)).status,410,'Archive never restores bearer authority');
        assert.equal((await restored.db.prepare('SELECT count(*) AS n FROM p_order_send_links').first()).n,0);
        assert.deepEqual(errors,[]);
        return {width,order:f.order.id,revision:2,changeOrder:1,provider:'network-edge acceptance only',archive};
    } finally {for(const context of contexts)await context.close();await restored?.close();await h.close();}
}
async function main() {
    const selected=process.argv.find(argument=>argument.startsWith('--width=')),widths=selected?[Number(selected.slice(8))]:[1440,390];
    assert.ok(widths.every(width=>[1440,390].includes(width)),'Use 1440 or 390');
    const evidence=resolve(process.env.PURSE_EVIDENCE??'.cache/order-send');await mkdir(evidence,{recursive:true});
    const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
    const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE??'@playwright/test');
    const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
    try {for(const width of widths)console.log(JSON.stringify(await orderSendJourney(browser,bundle.outputFiles[0].text,width,evidence)));} finally {await browser.close();}
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
