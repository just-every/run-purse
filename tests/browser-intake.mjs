import {approvalPoolsJourney} from './browser-approval-pools.mjs';
import {budgetDimensionsJourney} from './browser-budget-dimensions.mjs';
import {pendingApprovalJourney,conversionChargeJourney,periodBudgetJourney} from './browser-approver-edits.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {build} from 'esbuild';
const {chromium} = await import(process.env.PURSE_PLAYWRIGHT_MODULE ?? '@playwright/test');
import {createPortability} from '@runeditrun/rer/modules/portability';
import {exportArchive,importArchive} from '@runeditrun/rer/internal/modules/portability/files.mjs';
import portability from '../scripts/installer/portability.mjs';
import {harness} from './purse-harness.mjs';
import {nativeWebContext} from './native-web-fixture.mjs';
import {createEmailIntakeEdge} from './email-intake-fixture.mjs';
import {guidedIntakeJourney} from './browser-guided-intake.mjs';

const selected=process.argv.find(arg=>arg.startsWith('--width='));
const widths=selected?[Number(selected.slice(8))]:[1440,390];
const evidence=resolve(process.env.PURSE_EVIDENCE??'.cache/intake');await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?['--no-sandbox']:[])],...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{})});
try {
 for(const width of widths) {
  if(process.argv.includes('--journey=approval-pools')) {await approvalPoolsJourney({browser,bundle:bundle.outputFiles[0].text,width,evidence});continue;}
  const edge=await createEmailIntakeEdge(),h=await harness({mailRequest:edge.mailRequest}),contexts=[];let restored;
  try {
   const context=async(cookie,size)=>{const value=await nativeWebContext(browser,h,size,bundle.outputFiles[0].text,cookie);contexts.push(value);return value;};
   await h.command('business',{name:'synthetic-purse-1600',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Office']});
   const requester=await h.member('synthetic-purse-1601@example.test',['requester']);
   await h.member('synthetic-purse-1602@example.test',['approver']);
   await h.command('policy',{name:'Current office authority',currency:'USD',category:'Office',project:'Office',approver:'synthetic-purse-1602@example.test',limitMinor:10000000,budgetMinor:100000000});
   const supplier=await h.command('supplier',{name:'synthetic-purse-1603',status:'preferred',reason:'Reviewed office supplier',contacts:[{name:'Office purchasing',email:'synthetic-purse-1604@example.test'}]});
   await guidedIntakeJourney({h,context,width,evidence,requester,supplier,edge});
   await pendingApprovalJourney({h,context,width,evidence});
   await conversionChargeJourney({h,context,width,evidence});
   await periodBudgetJourney({h,context,width,evidence});
   await budgetDimensionsJourney({h,context,width,evidence});
   await approvalPoolsJourney({browser,bundle:bundle.outputFiles[0].text,width,evidence});
   const source=await createPortability({db:h.db,buckets:{ORIGINALS:h.originals},policy:portability});
   const archive=join(evidence,`INTAKE-001-${width}.rer`);await exportArchive(source,archive,[]);
   restored=await harness();const target=await createPortability({db:restored.db,buckets:{ORIGINALS:restored.originals},policy:portability});
   await importArchive(target,archive,[]);
   for(const kind of ['intakeForm','intakeDraft','request','revision','attachment','supplier','policy','audit']) {
    const values=async db=>(await db.prepare('SELECT * FROM p_records WHERE kind=? ORDER BY id').bind(kind).all()).results;
    assert.deepEqual(await values(restored.db),await values(h.db),kind+' retains exact draft, source and revision data');
   }
   for(const original of (await h.originals.list()).objects) {
    const [before,after]=await Promise.all([h.originals.get(original.key),restored.originals.get(original.key)]);
    assert.ok(after,'Retained private original restored');assert.deepEqual(Buffer.from(await after.arrayBuffer()),Buffer.from(await before.arrayBuffer()));
   }
   const privateDraft=(await h.state(requester)).data.intakeDraft.find(d=>d.status==='draft');assert.ok(privateDraft);
   assert.equal((await restored.send('/api/purse/command/intake-draft',{id:privateDraft.id,version:privateDraft.version,fields:privateDraft.fields},restored.owner)).status,403,'Archive history never grants another native identity custody of a private draft');
   console.log('INTAKE-001 App and actual portability continuation passed at '+width);
  } finally {for(const context of contexts)await context.close();await restored?.close();await h.close();}
 }
} finally {await browser.close();}
