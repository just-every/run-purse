import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { build } from 'esbuild';
import { nativeWebContext } from './native-web-fixture.mjs';
import { approvalEmailFixture,rows } from './approval-email-fixture.mjs';
const {chromium} = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const widthArg = process.argv.find(a=>a.startsWith('--width='));
const widths = widthArg ? [Number(widthArg.split('=')[1])] : [1440,390];
const evidence = resolve(process.env.PURSE_EVIDENCE || '.cache/approval-email'); await mkdir(evidence,{recursive:true});
const bundle = await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser = await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
try {
    for (const width of widths) {
        const f = await approvalEmailFixture(), {h} = f, contexts = [], errors = [];
        const open = async (link,cookie=f.approver) => {
            const context = await nativeWebContext(browser,h,width,bundle.outputFiles[0].text,cookie); contexts.push(context);
            const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
            await page.goto(link.url.href);
            return {page,region:page.getByRole('region',{name:'Email approval',exact:true})};
        };
        const capture = async ({page,region},name) => {
            await region.screenshot({path:join(evidence,name+'-'+width+'.png')});
            if (width===1440) {
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
                const sizes = await region.locator('p,label,button,a,h1,h2').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>parseFloat(getComputedStyle(n).fontSize)));
                assert.ok(sizes.every(s=>s>=13));
                assert.equal(await region.locator('button').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()).length),0,'This confirmation uses labelled controls');
            }
        };
        try {
            for (const verb of ['approved','rejected','returned']) {
                const request = await f.create(), link = await f.link(request), before = await rows(h);
                const screen = await open(link); await screen.region.getByRole('heading',{name:request.title,exact:true}).waitFor();
                if(width===1440) assert.deepEqual(await rows(h),before,'Opening the transport link never decides or consumes the source');
                await capture(screen,'confirm-'+verb);
                await screen.region.getByLabel('Decision',{exact:true}).selectOption(verb);
                await screen.region.getByLabel('Decision reason',{exact:true}).fill('synthetic-purse-6880 browser reviewed');
                await screen.region.getByRole('checkbox').check();
                await screen.region.getByRole('button',{name:'Confirm decision',exact:true}).click();
                await screen.region.getByRole('status').getByText('Decision recorded: '+verb+'.',{exact:true}).waitFor();
                if(width===1440) {
                    const state=(await h.state()).data;
                    assert.equal(state.request.find(r=>r.id===request.id).status,verb);
                    assert.equal(state.decision.filter(d=>d.request===request.id).length,1);
                    assert.equal(state.commitment.filter(e=>e.request===request.id).reduce((s,e)=>s+e.amountMinor,0),verb==='approved'?100000:0);
                }
                await capture(screen,'recorded-'+verb);
            }
            const request = await f.create(), link = await f.link(request);
            const forwarded = await open(link,f.other); await forwarded.region.getByRole('alert').waitFor();
            if(width===1440) assert.equal(await forwarded.region.getByRole('button',{name:'Confirm decision',exact:true}).count(),0);
            await capture(forwarded,'forwarded-refused');
            await h.command('amend',{...request,revision:1,title:'synthetic-purse-6881 revised',reason:'synthetic-purse-6882 amendment'},f.requester);
            const stale = await open(link); await stale.region.getByRole('alert').waitFor();
            if(width===1440) {
                assert.match(await stale.region.getByRole('alert').textContent(),/source or authority changed/);
                assert.equal(await stale.region.getByRole('button',{name:'Confirm decision',exact:true}).count(),0);
            }
            await capture(stale,'amended-refused'); assert.deepEqual(errors,[]);
            console.log('Email transport links: approve, reject, return, forwarded recipient and amended revision screens passed at '+width);
        } finally { for(const context of contexts) await context.close(); await h.close(); }
    }
} finally { await browser.close(); }
