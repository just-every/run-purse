// Real purchasing App and native Worker/auth doors; only static asset delivery
// and the outbound mail network edge are fixtures. No API responses are mocked.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { harness } from './purse-harness.mjs';

const widthArg = process.argv.find(arg => arg.startsWith('--width='));
const widths = widthArg ? [Number(widthArg.slice(8))] : [1440, 390];
assert.ok(widths.every(width => [1440,390].includes(width)));
const evidence = resolve(process.env.PURSE_EVIDENCE ?? '.cache/purse-browser-proof');
await mkdir(evidence, {recursive:true});
const bundle = await build({stdin:{contents:"import React from 'react'; import {createRoot} from 'react-dom/client'; import {App} from './src/ui/app'; createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const h = await harness({protectedKey:createHash('sha256').update('synthetic-protected-web-key').digest('hex')});
let browser;
try {
    await h.command('business',{name:'Synthetic native web acceptance',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Office']});
    const buyer = await h.member('buyer@example.test',['buyer']);
    browser = await chromium.launch({headless:true,...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']});
    for (const width of widths) {
        const supplier = await h.command('supplier',{name:'Protected web '+width,status:'active',reason:'Synthetic native web acceptance'});
        const context = await browser.newContext({viewport:{width,height:1000}});
        const [name,value] = h.owner.split('=');
        await context.addCookies([{name,value,url:h.origin}]);
        // Serve the shipped App, theme and assets at the native Worker's origin.
        await context.route(h.origin+'/**', async route => {
            const path = new URL(route.request().url()).pathname;
            if (path === '/app') return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/rer-theme.css"><link rel="stylesheet" href="/purse.css"></head><body><div id="root"></div><script type="module" src="/test-app.js"></script></body></html>'});
            if (path === '/test-app.js') return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
            if (['/rer-theme.css','/purse.css'].includes(path) || /^\/(fonts|brand)\/[a-zA-Z0-9./_-]+$/.test(path) && !path.includes('..')) {
                const types = {css:'text/css',woff2:'font/woff2',svg:'image/svg+xml',png:'image/png',ico:'image/x-icon'};
                return route.fulfill({contentType:types[path.split('.').pop()]??'application/octet-stream',body:await readFile('public'+path)});
            }
            return route.continue();
        });
        const page = await context.newPage();
        const failures=[];page.on('pageerror',error=>failures.push(error.message));
        const openSupplier = async () => {
            await page.goto(h.origin+'/app?tab=Suppliers');
            await page.getByRole('row').filter({has:page.getByText(supplier.name,{exact:true})}).getByRole('button',{name:'Open',exact:true}).click();
            await page.getByRole('region',{name:'Protected supplier values',exact:true}).locator('dt').first().waitFor();
        };
        await openSupplier();
        const panel = page.getByRole('region',{name:'Protected supplier values',exact:true});
        const values={tin:'987651234',bankAccount:'9876543215678',bankRouting:'123456789'};
        for (const [label,value] of [['TIN to store',values.tin],['Bank account to store',values.bankAccount],['Bank routing number to store',values.bankRouting],['Private storage reason','Synthetic storage reason'],['Private evidence reference','synthetic-original']]) await panel.getByLabel(label,{exact:true}).fill(value);
        const stored = page.waitForResponse(r=>r.url().endsWith('/store'));
        await panel.getByRole('button',{name:'Store protected values',exact:true}).click();
        assert.equal((await stored).status(),200);
        await panel.getByRole('status').filter({hasText:'Protected values saved'}).waitFor();
        for (const label of ['TIN to store','Bank account to store','Bank routing number to store','Private storage reason','Private evidence reference']) assert.equal(await panel.getByLabel(label,{exact:true}).inputValue(),'');
        for (const suffix of ['••••1234','••••5678','••••6789']) await panel.getByText(suffix,{exact:true}).waitFor();
        await panel.getByText('Recorded, not verified – not active for payment',{exact:true}).waitFor();
        for (const value of Object.values(values)) assert.ok(!(await page.locator('body').innerText()).includes(value));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.screenshot({path:join(evidence,`SECURITY-001-web-masks-${width}.png`),fullPage:true});
        // Before email proof, the actual native handler refuses the form.
        const expired = Date.now()-11*60*1000;
        await h.db.prepare('UPDATE oa_step_up_challenges SET consumed_at=? WHERE consumed_at IS NOT NULL').bind(expired).run();
        await panel.getByLabel('Private reveal reason',{exact:true}).fill('Synthetic reason without fresh proof');
        const refused=page.waitForResponse(r=>r.url().endsWith('/reveal'));
        await panel.getByRole('button',{name:'Reveal protected value',exact:true}).click();
        assert.equal((await refused).status(),403);
        await panel.getByRole('alert').filter({hasText:'Native reauthentication required'}).waitFor();
        assert.equal(await panel.getByLabel('Private reveal reason',{exact:true}).inputValue(),'');
        assert.equal(await panel.getByRole('region',{name:'Revealed protected value',exact:true}).count(),0);
        await page.screenshot({path:join(evidence,`SECURITY-001-web-reauth-refusal-${width}.png`),fullPage:true});
        // The UI requests the real email challenge. Only its network edge is fake.
        const step=page.waitForResponse(r=>r.url().endsWith('/auth/step-up'));
        await panel.getByRole('button',{name:'Request native reauthentication',exact:true}).click();
        assert.equal((await step).status(),202);
        const message=[...h.messages].reverse().find(m=>m.to.includes('owner@example.test'));
        const token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
        const confirmed=await context.request.post(h.origin+'/auth/confirm',{headers:{origin:h.origin},data:{token},maxRedirects:0});
        assert.equal(confirmed.status(),303);
        for (const field of ['tin','bankAccount','bankRouting']) {
            await panel.getByLabel('Protected field',{exact:true}).selectOption(field);
            await panel.getByLabel('Private reveal reason',{exact:true}).fill('Synthetic authorized field inspection');
            const response=page.waitForResponse(r=>r.url().endsWith('/reveal'));
            await panel.getByRole('button',{name:'Reveal protected value',exact:true}).click();
            const revealed=await response;assert.equal(revealed.status(),200);assert.equal(revealed.headers()['cache-control'],'no-store');
            const region=panel.getByRole('region',{name:'Revealed protected value',exact:true});
            await region.getByText(values[field],{exact:true}).waitFor();
            for (const other of Object.keys(values).filter(name=>name!==field)) assert.ok(!(await page.locator('body').innerText()).includes(values[other]));
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
            if(field==='tin') await page.screenshot({path:join(evidence,`SECURITY-001-web-reveal-${width}.png`),fullPage:true});
            await region.getByRole('button',{name:'Hide protected value',exact:true}).click();
            assert.equal(await panel.getByRole('region',{name:'Revealed protected value',exact:true}).count(),0);
        }
        // Navigation removes the value and returning never restores a reveal.
        await panel.getByLabel('Private reveal reason',{exact:true}).fill('Synthetic navigation check');
        await panel.getByRole('button',{name:'Reveal protected value',exact:true}).click();
        await panel.getByRole('region',{name:'Revealed protected value',exact:true}).waitFor();
        await page.getByRole('navigation').getByRole('button',{name:'Requests',exact:true}).click();
        for(const value of Object.values(values)) assert.ok(!(await page.locator('body').innerText()).includes(value));
        await openSupplier();
        assert.equal(await panel.getByRole('region',{name:'Revealed protected value',exact:true}).count(),0);
        // Buyer sees the same masks and no store, reveal or reauthentication controls.
        const [buyerName,buyerValue]=buyer.split('=');
        await context.clearCookies();await context.addCookies([{name:buyerName,value:buyerValue,url:h.origin}]);
        await openSupplier();
        for(const suffix of ['••••1234','••••5678','••••6789']) await panel.getByText(suffix,{exact:true}).waitFor();
        for(const label of ['Store protected values','Reveal protected value','Request native reauthentication']) assert.equal(await panel.getByRole('button',{name:label,exact:true}).count(),0);
        await panel.getByText('Only the current native owner can change or reveal protected values.',{exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.screenshot({path:join(evidence,`SECURITY-001-web-buyer-${width}.png`),fullPage:true});
        assert.deepEqual(failures,[]);
        const audit=await h.send('/api/purse/audit',undefined,h.owner);
        for(const action of ['protected-store','protected-reveal','protected-refused']) assert.ok(audit.value.events.some(e=>e.action===action));
        for(const value of Object.values(values)) assert.ok(!JSON.stringify(audit.value).includes(value));
        await context.close();
        console.log('SECURITY-001 actual App/native HTTP/email-edge web journey passed at '+width);
    }
} finally { await browser?.close(); await h.close(); }
