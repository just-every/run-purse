import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
import {nativeWebContext} from './native-web-fixture.mjs';
import {invoiceMatchingFixture} from './invoice-matching-fixture.mjs';
const {chromium}=await import(process.env.PURSE_PLAYWRIGHT_MODULE||'@playwright/test');
const widthArg=process.argv.find(a=>a.startsWith('--width='));
const widths=widthArg?[Number(widthArg.split('=')[1])]:[1440,390];
const evidence=resolve(process.env.PURSE_EVIDENCE||'.cache/invoice-matching');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
try {
 for(const width of widths) {
    const f=await invoiceMatchingFixture(),contexts=[];
    try {
        const owner=await nativeWebContext(browser,f.h,width,bundle.outputFiles[0].text,f.h.owner);contexts.push(owner);
        const buyer=await nativeWebContext(browser,f.h,width,bundle.outputFiles[0].text,f.buyer);contexts.push(buyer);
        const page=await owner.newPage(),ap=await buyer.newPage(),errors=[];for(const p of [page,ap])p.on('pageerror',e=>errors.push(e.message));
        const snap=async(p,name,region)=>{assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await region.screenshot({path:join(evidence,name+'-'+width+'.png')});};
        await page.goto(f.h.origin+'/app?tab=Settings');
        const rules=page.getByRole('region',{name:'Invoice matching rules',exact:true});await rules.waitFor();
        await rules.getByLabel('Matching supplier',{exact:true}).selectOption(f.supplier.id);
        await rules.getByLabel('Matching category (* means all)',{exact:true}).fill('*');
        await rules.getByLabel('Price tolerance percent',{exact:true}).fill('2');await rules.getByLabel('Price tolerance amount',{exact:true}).fill('20.00');
        await rules.getByLabel('Quantity tolerance percent',{exact:true}).fill('2');await rules.getByLabel('Quantity tolerance amount',{exact:true}).fill('20.00');
        await rules.getByLabel('Unplanned charge tolerance percent',{exact:true}).fill('5');await rules.getByLabel('Unplanned charge tolerance amount',{exact:true}).fill('50.00');
        await rules.getByLabel('Unplanned freight GL account',{exact:true}).fill('Freight expense');await rules.getByLabel('Unplanned fuel GL account',{exact:true}).fill('Fuel expense');
        await rules.getByLabel('Matching consent reason',{exact:true}).fill('Owner explicitly consents to exact received goods and both variance limits');await rules.getByRole('checkbox').check();
        await rules.getByRole('button',{name:'Save matching consent',exact:true}).click();await rules.getByText('Active owner consent',{exact:true}).waitFor();await snap(page,'owner-matching-consent',rules);
        for(const [name,received,unitMinor,approved,reason,extra={}] of [['exact','6',10000,true,null],['within-two-percent','6',10200,true,null],['above-tolerance','6',10201,false,'Price exceeds tolerance for Safety equipment'],['before-receipt','0',10000,false,'Receipt shortfall for Safety equipment'],['unplanned-freight','10',10000,true,null,{quantity:'10',freightMinor:3500}],['unplanned-fuel','10',10000,false,'Unplanned charges exceed tolerance',{quantity:'10',charges:[{type:'fuel',amountMinor:12000}]}],['unplanned-before-receipt','0',10000,false,'Receipt shortfall for Safety equipment',{freightMinor:2500}]]) {
            const order=await f.order({received}),source=await f.stage(order,{unitMinor,reference:'synthetic-purse-'+name,...extra});
            await ap.goto(f.h.origin+'/app?tab=Orders');
            await ap.getByRole('row').filter({hasText:order.number}).getByRole('button',{name:'Open order',exact:true}).click();
            // Select and confirm the staged original through the same source-bound web form.
            await ap.getByText('Confirm reviewed invoice',{exact:true}).click();
            await ap.getByRole('link',{name:source.document.name,exact:true}).waitFor();
            await ap.getByLabel('Invoice item 1 PO line',{exact:true}).selectOption(order.lines[0].id);
            for(const [index,charge] of (extra.charges??[]).entries())await ap.getByLabel('Invoice item '+(index+2)+' PO line',{exact:true}).selectOption('charge:'+charge.type);
            await ap.getByLabel('Invoice confirmation reason',{exact:true}).fill('AP compared every value with the private original');
            await ap.getByLabel('I reviewed every invoice field and original',{exact:true}).check();
            await ap.getByRole('button',{name:'Create invoice from reviewed original',exact:true}).click();
            const matching=ap.getByRole('region',{name:'Automatic matching synthetic-purse-'+name,exact:true});await matching.waitFor();
            if(approved)await matching.getByText('Approved automatically under owner-consented matching',{exact:true}).waitFor();else await matching.getByText(reason,{exact:true}).waitFor();
            if(name==='unplanned-freight')await matching.getByText('Unplanned freight: $35.00 · GL account Freight expense',{exact:true}).waitFor();
            await snap(ap,'invoice-'+name,matching.locator('..'));
            const state=(await f.h.state()).data,invoice=state.invoice.find(i=>i.reference==='synthetic-purse-'+name);assert.equal(Boolean(invoice.paymentApproval),approved);
            if(approved){const cash=state.cashRequirements.bills.find(b=>b.invoice===invoice.id);assert.equal(cash.dueDate,new Date(Date.parse(invoice.invoiceDate+'T12:00:00Z')+30*86400000).toISOString().slice(0,10));assert.equal(cash.amountMinor,unitMinor*Number(extra.quantity??6)+(extra.freightMinor??0));}else assert.ok(!state.cashRequirements.bills.some(b=>b.invoice===invoice.id));
        }
        const [download]=await Promise.all([ap.waitForEvent('download'),ap.getByRole('link',{name:'Download coded invoice CSV',exact:true}).click()]);
        const {parse}=await import('csv-parse/sync'),exportRows=parse(await readFile(await download.path(),'utf8'),{columns:true}).filter(row=>row.invoice==='synthetic-purse-unplanned-freight');
        assert.deepEqual(exportRows.map(row=>[row.amount_minor,row.gl_account,row.charge_type]),[['100000','',''],['3500','Freight expense','freight']]);
        const awardedOrder=await f.order({unitMinor:90000,awardFirstUnitMinor:100000}),awardedSource=await f.stage(awardedOrder,{unitMinor:90000,reference:'synthetic-purse-awarded',freightMinor:3500}),awarded=await f.confirm(awardedSource);
        assert.equal(awarded.paymentApproval.kind,'native-matching');
        const unapproved=await f.cmd('invoice',{order:awardedOrder.id,reference:'synthetic-purse-unapproved',source:'Unconfirmed extra supplier evidence',allocations:[{line:awardedOrder.lines[0].id,quantity:'1',amountMinor:90000}]},f.buyer);
        const report=await f.h.send('/api/purse/performance-report',undefined,f.buyer);assert.equal(report.status,200);assert.equal(report.value.savings.totals[0].realizedMinor,60000);assert.ok(!report.value.savings.realizedRows.some(r=>r.invoice===unapproved.id));
        await ap.goto(f.h.origin+'/app?tab=Reports');await ap.getByRole('button',{name:'Procurement performance',exact:true}).click();
        await ap.getByRole('button',{name:'Realized savings USD',exact:true}).click();const detail=ap.getByRole('region',{name:'Performance source records',exact:true});
        const row=detail.getByRole('row').filter({hasText:'Invoice synthetic-purse-awarded'});await row.getByText('Source evidence',{exact:true}).click();
        await row.getByText('$600.00 · first offer $6,000.00 · billed $5,400.00',{exact:true}).waitFor();assert.equal(await detail.getByText('Invoice synthetic-purse-unapproved',{exact:true}).count(),0);
        await snap(ap,'genuine-realized-savings',detail);
        await f.cmd('attachment',{kind:'invoice',record:unapproved.id,...awardedSource.document},f.buyer);
        await f.cmd('attachment',{kind:'invoice',record:awarded.id,...awardedSource.document},f.buyer);
        const held=(await f.h.state()).data;assert.deepEqual(held.invoice.find(i=>i.id===awarded.id).paymentApproval,awarded.paymentApproval);assert.ok(!held.cashRequirements.bills.some(b=>b.invoice===awarded.id));
        const heldReport=await f.h.send('/api/purse/performance-report',undefined,f.buyer);assert.equal(heldReport.value.savings.totals[0].realizedMinor,0);
        await ap.goto(f.h.origin+'/app?tab=Orders');await ap.getByRole('row').filter({hasText:awardedOrder.number}).getByRole('button',{name:'Open order',exact:true}).click();
        const historical=ap.getByRole('region',{name:'Automatic matching synthetic-purse-awarded',exact:true});await historical.getByText('Historical automatic approval held',{exact:true}).waitFor();await snap(ap,'historical-approval-held',historical.locator('..'));
        assert.deepEqual(errors,[]);console.log('Native invoice matching web journey passed at '+width);
    } finally {for(const context of contexts)await context.close();await f.h.close();}
 }
} finally {await browser.close();}
