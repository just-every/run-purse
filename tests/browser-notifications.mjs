import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { nativeWebContext } from './native-web-fixture.mjs';
import { commentsFixture } from './comments-fixture.mjs';
const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const widthArg = process.argv.find(arg => arg.startsWith('--width='));
const widths = widthArg ? [Number(widthArg.split('=')[1])] : [1440,390];
const evidence = resolve(process.env.PURSE_EVIDENCE || '.cache/notifications'); await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--use-mock-keychain','--password-store=basic'], ...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PURSE_CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
    for (const width of widths) {
        const f = await commentsFixture(undefined, { worker: 'tests/accrual-worker.ts', clock: '2026-10-29T12:00:00Z' }), { h } = f, contexts = [], errors = [];
        const context = async cookie => { const c = await nativeWebContext(browser,h,width,bundle.outputFiles[0].text,cookie); contexts.push(c); return c; };
        const open = async cookie => { const p = await (await context(cookie)).newPage(); p.on('pageerror',e => errors.push(e.message)); await p.goto(h.origin + '/app'); const region = p.getByRole('region',{name:'Notifications',exact:true}); await region.locator('summary').click(); return { page:p, region }; };
        const capture = async (screen,name) => {
            await screen.region.screenshot({ path:join(evidence,`${name}-${width}.png`) });
            if (width === 1440) {
                assert.equal(await screen.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
                const sizes = await screen.region.locator('p,label,button,a,summary,time').evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => parseFloat(getComputedStyle(el).fontSize)));
                assert.ok(sizes.every(size => size >= 13));
                const icons = await screen.page.locator('button').evaluateAll(buttons => buttons.filter(b => !b.textContent.trim()).map(b => ({ label:b.getAttribute('aria-label'),tooltip:b.getAttribute('aria-describedby') })));
                assert.ok(icons.every(b => b.label && b.tooltip));
            }
        };
        try {
            const approver = await open(f.approver);
            await approver.page.clock.install({ time: new Date('2026-10-29T12:00:00Z') });
            await approver.page.clock.setFixedTime(new Date('2026-10-29T12:00:00Z'));
            const queue = () => approver.page.locator('.thread-item[data-waiting="yes"]').evaluateAll(items => items.map(item => ({ id:item.id, age:item.querySelector('.ask-when')?.textContent, status:item.querySelector('.request-status')?.textContent, holder:item.querySelector('.check-who')?.textContent })));
            const queued = await queue();
            const waiting = approver.region.getByRole('article',{name:'Approval needed',exact:true}).filter({has:approver.page.getByRole('link',{name:f.pending.title,exact:true})});
            await waiting.getByRole('button',{name:'Mark as read',exact:true}).click();
            await waiting.getByRole('button',{name:'Dismiss notification',exact:true}).click();
            await approver.region.getByLabel('Show dismissed notifications',{exact:true}).check();
            await waiting.getByText('Dismissed',{exact:false}).waitFor();
            if (width === 1440) { assert.ok(queued.some(row => row.id === 'request-' + f.pending.id)); assert.deepEqual(await queue(),queued,'Read and dismissal retain displayed queue position, age and holder'); }
            await capture(approver,'approval-read-dismissed');
            const before = (await h.state(f.approver)).data;
            // Native HTTP events are displayed by the same shipped app and real session transport.
            const body = 'synthetic-purse-6101 review context';
            const comment = await h.command('comment-add',{kind:'request',record:f.pending.id,attempt:'synthetic-purse-6102',body,mentions:[f.requesterId,f.scopedId]},f.approver);
            await h.command('comment-edit',{id:comment.id,version:1,body:'synthetic-purse-6103 later context',mentions:[f.requesterId,f.scopedId]},f.approver);
            await h.command('decision',{id:f.pending.id,revision:1,decision:'returned',reason:'synthetic-purse-6104'},f.approver);
            const requester = await open(f.requester);
            await requester.region.getByRole('article',{name:'Request returned',exact:true}).getByRole('link',{name:f.pending.title,exact:true}).waitFor();
            await requester.region.getByText(body,{exact:true}).waitFor();
            if (width === 1440) assert.equal(await requester.region.getByText('synthetic-purse-6103 later context',{exact:true}).count(),0);
            await capture(requester,'returned-exact-mention');
            await h.command('submit',{id:f.pending.id,revision:1},f.requester);
            await h.command('decision',{id:f.pending.id,revision:1,decision:'approved',reason:'synthetic-purse-6105'},f.approver);
            await h.command('invoice',{order:f.order.id,reference:'synthetic-purse-6106',source:'synthetic-purse-6107',allocations:[{line:f.order.lines[0].id,quantity:'1',amountMinor:10000}]},f.buyer);
            const prompted = await h.send('/api/purse/receipt-prompts',{},h.owner); assert.equal(prompted.status,200);
            await requester.page.reload(); await requester.region.locator('summary').click();
            await requester.region.getByRole('article',{name:'Request approved',exact:true}).filter({has:requester.page.getByRole('link',{name:f.pending.title,exact:true})}).waitFor();
            const receipt = requester.region.getByRole('article',{name:'Receipt needed',exact:true});
            await receipt.getByRole('link',{name:f.order.number,exact:true}).waitFor();
            await capture(requester,'approved-receipt-needed');
            await receipt.getByRole('link',{name:f.order.number,exact:true}).click();
            await requester.page.locator('[data-tab="Orders"]').waitFor();
            await requester.page.getByRole('button',{name:'Settings',exact:true}).click();
            const preferences=requester.page.getByRole('region',{name:'Notification preferences',exact:true});
            await preferences.getByLabel('Notification channel',{exact:true}).selectOption('in-app');
            await preferences.getByLabel('Notification frequency',{exact:true}).selectOption('daily');
            await preferences.getByLabel('Your time zone',{exact:true}).fill('America/Los_Angeles');
            await preferences.getByLabel('Quiet weekends',{exact:true}).selectOption('true');
            await preferences.getByRole('button',{name:'Save notification preferences',exact:true}).click();
            await requester.page.waitForFunction(async()=>{const r=await fetch('/api/purse/notification-settings');return (await r.json()).preferences.version===1;});
            await requester.page.goto(h.origin+'/app?tab=Settings');
            await preferences.getByLabel('Your time zone',{exact:true}).waitFor();
            if(width===1440){assert.equal(await preferences.getByLabel('Notification frequency',{exact:true}).inputValue(),'daily');assert.equal(await preferences.getByLabel('Quiet weekends',{exact:true}).inputValue(),'true');}
            await capture({...requester,region:preferences},'recipient-notification-settings');
            const owner=await open(h.owner);await owner.page.getByRole('button',{name:'Settings',exact:true}).click();
            const ownerSettings=owner.page.getByRole('region',{name:'Notification preferences',exact:true});await ownerSettings.getByText('Urgent notification events',{exact:true}).click();
            await ownerSettings.getByLabel('Notification event',{exact:true}).selectOption('comment-mention');await ownerSettings.getByLabel('Urgency',{exact:true}).selectOption('true');
            await ownerSettings.getByRole('button',{name:'Save notification urgency',exact:true}).click();
            await ownerSettings.getByText('Immediate event families: Comment mention',{exact:true}).waitFor();
            await ownerSettings.getByText('Approval reminder schedule',{exact:true}).click();await ownerSettings.getByLabel('Approval reminders',{exact:true}).selectOption('true');await ownerSettings.getByLabel('Hours between reminders',{exact:true}).fill('24');await ownerSettings.getByRole('button',{name:'Save approval reminder schedule',exact:true}).click();await owner.page.waitForFunction(async()=>{const r=await fetch('/api/purse/notification-settings');return (await r.json()).nudgePolicy.version===1;});
            await capture({...owner,region:ownerSettings},'owner-notification-urgency');
            await h.command('comment-add',{kind:'request',record:f.pending.id,attempt:'synthetic-purse-6110',body:'synthetic-purse-6111 urgent mention',mentions:[f.requesterId]},f.approver);
            await requester.page.goto(h.origin+'/app?tab=Settings');await preferences.getByText('Notification delivery history',{exact:true}).click();await preferences.getByText(/in-app · Daily digest · available/).waitFor();await capture({...requester,region:preferences},'recipient-delivery-outcome');
            const outsider = await open(f.scoped);
            await outsider.region.getByText('This notification’s source is no longer available to you.',{exact:true}).waitFor();
            if (width === 1440) {
                assert.equal(await outsider.region.getByRole('link').count(),0);
                assert.equal(await outsider.region.getByRole('button').count(),0);
                for (const value of [f.pending.id,f.pending.title,body,comment.id]) assert.ok(!(await outsider.region.textContent()).includes(value));
            }
            await capture(outsider,'scope-redacted');
            await h.command('member',{email:f.email(2802),name:'synthetic-purse-6108',active:true,grants:[{role:'requester',scope:{locations:['Denver']}}]});
            await requester.page.goto(h.origin + '/app'); await requester.region.locator('summary').click();
            await requester.region.getByText('This notification’s source is no longer available to you.',{exact:true}).first().waitFor();
            if (width === 1440) { assert.equal(await requester.region.getByRole('link').count(),0); assert.equal(await requester.region.getByRole('button').count(),0); }
            await capture(requester,'revoked-source');
            if (width === 1440) assert.deepEqual(before.request.map(r => [r.id,r.revision]),(await h.state()).data.request.map(r => [r.id,r.revision]),'Read and dismissal do not create purchasing revisions');
            assert.deepEqual(errors,[]);
            console.log('Native notification list, exact mentions, read and dismiss, source links and current-scope redaction passed at ' + width);
        } finally { for (const c of contexts) await c.close(); await h.close(); }
    }
} finally { await browser.close(); }
