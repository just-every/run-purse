import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { nativeWebContext } from './native-web-fixture.mjs';
import { commentsFixture } from './comments-fixture.mjs';
const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const selector = process.argv.find(a => a.startsWith('--width=')), widths = selector ? [Number(selector.split('=')[1])] : [1440, 390];
const evidence = resolve(process.env.PURSE_EVIDENCE || '.cache/comments'); await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'], ...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PURSE_CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
    for (const width of widths) {
        const f = await commentsFixture(), contexts = [];
        try {
            const context = async cookie => { const c = await nativeWebContext(browser, f.h, width, bundle.outputFiles[0].text, cookie); contexts.push(c); return c; };
            const page = await (await context(f.approver)).newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
            await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') });
            await page.clock.setFixedTime(new Date('2026-10-28T12:00:00Z'));
            const before = await f.h.state(f.approver);
            await page.goto(f.h.origin + '/app?request=' + f.pending.id);
            const thread = page.getByRole('region', { name: 'Internal comments', exact: true });
            await thread.getByLabel('Internal comment', { exact: true }).waitFor();
            const queue = () => page.locator('.thread-item[data-waiting="yes"]').evaluateAll(items => items.map(item => ({ id: item.id, age: item.querySelector('.ask-when').textContent, status: item.querySelector('.request-status').textContent, holder: item.querySelector('.check-who')?.textContent, mayApprove: Array.from(item.querySelectorAll('button')).some(button => button.textContent === 'Approve') })));
            const pendingQueue = await queue();

            await thread.getByLabel('Internal comment', { exact: true }).fill('synthetic-purse-5201: Please review delivery before deciding.');
            await thread.getByLabel('Mention members', { exact: true }).selectOption([f.requesterId, f.scopedId]);
            await thread.getByRole('button', { name: 'Post internal comment', exact: true }).click();
            await thread.getByText('synthetic-purse-5201: Please review delivery before deciding.', { exact: true }).first().waitFor();
            await thread.getByText('synthetic-purse-5102:', { exact: false }).waitFor();
            const capture = async (name, target = thread, p = page) => {
                assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Comments fit viewport');
                const icons = await p.locator('button').evaluateAll(buttons => buttons.filter(b => !b.textContent.trim()).map(b => ({ label: b.getAttribute('aria-label'), tooltip: b.getAttribute('aria-describedby') })));
                assert.ok(icons.every(b => b.label && b.tooltip));
                await target.screenshot({ path: join(evidence, `${name}-${width}.png`) });
            };
            await capture('pending-comment');
            await capture('pending-queue-card', page.locator('#request-' + f.pending.id + ' .request-card').first());
            if (width === 1440) {
                assert.ok(pendingQueue.some(item => item.id === 'request-' + f.pending.id && item.status.includes('pending') && item.mayApprove));
                assert.deepEqual(await queue(), pendingQueue, 'Same approver, position, pending status and displayed age');
                assert.deepEqual((await f.h.state(f.approver)).data.request, before.data.request);
                assert.deepEqual((await f.h.state(f.approver)).data.decision, before.data.decision);
                const sizes = await thread.locator('p,label,button,a,summary,textarea,select').evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => parseFloat(getComputedStyle(el).fontSize)));
                assert.ok(sizes.every(size => size >= 13), 'Comment text is at least 13px');
            }
            await thread.getByRole('button', { name: 'Edit comment', exact: true }).click();
            await thread.getByLabel('Edit comment', { exact: true }).fill('synthetic-purse-5202: Corrected delivery context.');
            await thread.getByRole('button', { name: 'Save comment edit', exact: true }).click();
            await thread.getByText('synthetic-purse-5202: Corrected delivery context.', { exact: true }).first().waitFor();
            await thread.getByText('Comment version history', { exact: true }).click();
            await thread.getByText('synthetic-purse-5201: Please review delivery before deciding.', { exact: true }).waitFor();
            await capture('comment-history');
            await thread.getByRole('button', { name: 'Delete comment', exact: true }).click();
            await thread.getByText('Comment deleted', { exact: true }).waitFor(); await capture('deleted-comment');
            const requesterPage = await (await context(f.requester)).newPage();
            await requesterPage.goto(f.h.origin + '/app');
            const mentions = requesterPage.getByRole('region', { name: 'Comment mentions', exact: true });
            await mentions.locator('summary').click(); await mentions.getByText('Comment deleted', { exact: true }).waitFor(); await capture('requester-mention', mentions, requesterPage);
            const outsider = await (await context(f.scoped)).newPage();
            await outsider.goto(f.h.origin + '/app');
            const redacted = outsider.getByRole('region', { name: 'Comment mentions', exact: true });
            await redacted.locator('summary').click(); await redacted.getByText('You were mentioned on a record you cannot access.', { exact: true }).waitFor();
            if (width === 1440) { assert.ok(!(await redacted.textContent()).includes(f.pending.title)); assert.equal(await redacted.getByRole('link').count(), 0); }
            await capture('redacted-mention', redacted, outsider);
            const buyer = await (await context(f.buyer)).newPage(); await buyer.goto(f.h.origin + '/app?tab=Orders&receipt=' + f.order.id);
            const poThread = buyer.getByRole('region', { name: 'Internal comments', exact: true });
            await poThread.getByLabel('Internal comment', { exact: true }).fill('synthetic-purse-5203: Internal receiving photo.');
            await poThread.getByLabel('Comment attachment (up to 1 MB)', { exact: true }).setInputFiles({ name: 'synthetic-purse-5204.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic-purse-5205 private bytes') });
            await poThread.getByRole('button', { name: 'Post internal comment', exact: true }).click();
            await poThread.getByRole('link', { name: 'synthetic-purse-5204.txt', exact: true }).first().waitFor();
            await capture('po-comment-attachment', poThread, buyer);
            assert.deepEqual(errors, []);
            console.log('Native request comments, member picker, redacted notices, history and PO attachment screens passed at ' + width);
        } finally { for (const c of contexts) await c.close(); await f.h.close(); }
    }
} finally { await browser.close(); }
