import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
import {nativeWebContext} from './native-web-fixture.mjs';
import {crossTeamFixture} from './cross-team-reviews-fixture.mjs';
const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
const selector=process.argv.find(arg=>arg.startsWith('--width=')),widths=selector?[Number(selector.split('=')[1])]:[1440,390];
const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/cross-team-reviews');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
try {
    for(const width of widths) {
        const f=await crossTeamFixture(),contexts=[];
        try {
            const pageFor=async cookie=>{const context=await nativeWebContext(browser,f.h,width,bundle.outputFiles[0].text,cookie);contexts.push(context);return context.newPage();};
            const page=await pageFor(f.reviewers.security.cookie),errors=[];page.on('pageerror',e=>errors.push(e.message));
            const url=f.h.origin+'/app?request='+f.request.id;
            await page.goto(url);
            const reviews=page.getByRole('region',{name:'Cross-team reviews',exact:true});
            await reviews.getByText('Purchase approval waits for every required review.',{exact:false}).waitFor();
            const security=reviews.locator('details').filter({has:page.locator('summary').filter({hasText:'SECURITY review'})});
            await security.locator('summary').click();
            await security.getByLabel('Review outcome',{exact:true}).selectOption('question');
            await security.getByLabel('Review questions or decision notes',{exact:true}).fill('synthetic-purse-6160: How is access withdrawn?');
            await security.getByLabel('Review file (up to 1 MB)',{exact:true}).setInputFiles({name:'synthetic-purse-6161.txt',mimeType:'text/plain',buffer:Buffer.from('synthetic-purse-6162 browser review bytes')});
            await security.getByRole('button',{name:'Record security review',exact:true}).click();
            await security.getByText('synthetic-purse-6160: How is access withdrawn?',{exact:true}).waitFor();
            const capture=async(name,p=page,target=reviews)=>{
                await target.scrollIntoViewIfNeeded();
                assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Review screens fit viewport');
                if(width===1440) {
                    const sizes=await target.locator('p,label,button,a,summary,textarea,select,input').evaluateAll(elements=>elements.filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize)));
                    assert.ok(sizes.every(size=>size>=13));
                    const icons=await p.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.textContent.trim()).map(b=>({label:b.getAttribute('aria-label'),tooltip:b.getAttribute('aria-describedby')})));
                    assert.ok(icons.every(b=>b.label&&b.tooltip));
                }
                await target.screenshot({path:join(evidence,name+'-'+width+'.png')});
            };
            await capture('security-question-and-file');
            if(width===1440) {
                assert.equal(await security.getByRole('link',{name:'synthetic-purse-6161.txt',exact:true}).isVisible(),true);
                assert.equal(await reviews.getByRole('button',{name:'Record legal review',exact:true}).count(),0);
                assert.equal(await page.getByRole('button',{name:'Record decision',exact:true}).count(),0,'Review-only membership grants no purchase approval');
            }
            await security.getByLabel('Review outcome',{exact:true}).selectOption('approved');
            await security.getByLabel('Review questions or decision notes',{exact:true}).fill('synthetic-purse-6163: Withdrawal reviewed.');
            await security.getByRole('button',{name:'Record security review',exact:true}).click();
            await security.getByText('synthetic-purse-6163: Withdrawal reviewed.',{exact:true}).waitFor();
            for(const type of ['privacy','it','legal']) {
                const p=await pageFor(f.reviewers[type].cookie);p.on('pageerror',e=>errors.push(e.message));await p.goto(url);
                const region=p.getByRole('region',{name:'Cross-team reviews',exact:true}),review=region.locator('details').filter({has:p.locator('summary').filter({hasText:type.toUpperCase()+' review'})});
                await review.locator('summary').click();
                await review.getByLabel('Review outcome',{exact:true}).selectOption('approved');
                await review.getByLabel('Review questions or decision notes',{exact:true}).fill('synthetic-purse-6164 '+type+' approved');
                await review.getByRole('button',{name:'Record '+type+' review',exact:true}).click();
                await review.getByText('synthetic-purse-6164 '+type+' approved',{exact:true}).waitFor();
                await capture(type+'-review',p,region);
            }
            const approver=await pageFor(f.approver);await approver.goto(url);
            const completed=approver.getByRole('region',{name:'Cross-team reviews',exact:true});
            await completed.getByText('Required reviews approved for this revision.',{exact:false}).waitFor();
            await capture('all-reviews-complete',approver,completed);
            if(width===1440) {
                const form=approver.locator('form').filter({has:approver.getByRole('button',{name:'Record decision',exact:true})});
                await form.getByLabel('Decision',{exact:true}).selectOption('approved');await form.getByLabel('Decision reason',{exact:true}).fill('synthetic-purse-6165 independent buyer authority');
                await form.getByRole('button',{name:'Record decision',exact:true}).click();
                await approver.waitForFunction(async id=>{const r=await fetch('/api/purse/state');const s=await r.json();return s.data.request.find(r=>r.id===id)?.status==='approved';},f.request.id);
            }
            const owner=await pageFor(f.h.owner);await owner.goto(f.h.origin+'/app?tab=Settings');
            const settings=owner.getByRole('region',{name:'Category form configuration',exact:true});
            await settings.getByLabel('Existing form',{exact:true}).selectOption(f.form.id);
            const config=settings.getByRole('group',{name:'Required cross-team reviews',exact:true});
            await config.getByLabel('Assigned reviewer',{exact:true}).first().waitFor();
            await capture('review-configuration-settings',owner,config);
            {
                await config.getByLabel('Review stage',{exact:true}).last().fill('3');
                await settings.getByLabel('Publish for requesters',{exact:true}).check();
                await settings.getByRole('button',{name:'Publish category form',exact:true}).click();
                await owner.waitForFunction(async id=>{const r=await fetch('/api/purse/state');const s=await r.json();return s.data.intakeForm.find(f=>f.id===id)?.version===2;},f.form.id);
                const updated=(await f.h.state()).data.intakeForm.find(form=>form.id===f.form.id);if(width===1440)assert.equal(updated.reviews.find(row=>row.type==='legal').stage,3);
            }
            await approver.goto(url);
            const changed=approver.getByRole('region',{name:'Cross-team reviews',exact:true});
            await changed.getByText('Review configuration changed. Revise and submit the request to use the new requirements.',{exact:true}).waitFor();
            await capture('changed-review-configuration',approver,changed);
            assert.deepEqual(errors,[]);
            console.log('Native cross-team request reviews and Settings screens passed at '+width);
        } finally {for(const context of contexts)await context.close();await f.h.close();}
    }
} finally {await browser.close();}
