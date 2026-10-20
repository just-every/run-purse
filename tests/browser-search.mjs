import assert from 'node:assert/strict';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { readDevKey,signInAs } from '../src/modules/operator-auth/dev/sign-in-as.mjs';
import { pdfPhrase,bankNumber } from './search-fixtures.mjs';

export async function searchJourney(browser,root,origin,width,evidence,{as='buyer',scale=false}={}) {
 const key=await readDevKey(root),login=await signInAs({origin,key,as,returnTo:'/app?search=1'}),context=await browser.newContext({viewport:{width,height:1000}});await context.addCookies(login.cookies.map(cookie=>({...cookie,url:origin})));const page=await context.newPage();
 try {
  await page.goto(origin+'/app?search=1');if(page.url().endsWith('/setup')){await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.goto(origin+'/app?search=1');}await page.getByRole('button',{name:'Search records',exact:true}).waitFor();
  const terms=scale?['OLD-42','VENDOR-2026-0889','smith jones co','$1,234.56',pdfPhrase]:[pdfPhrase];
  for(const q of terms){await page.getByLabel('Number, supplier or text',{exact:true}).fill(q);const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/purse/search'),at=performance.now();await page.getByRole('button',{name:'Search records',exact:true}).click();const result=await response;assert.equal(result.status(),200);const body=await result.json();assert.ok(body.total>0,q);await page.getByRole('region',{name:'Search results'}).getByRole('link').first().waitFor();assert.ok(performance.now()-at<1000,`SEARCH-001 ${width}px query ${q} exceeded one second`);await page.screenshot({path:join(evidence,`SEARCH-001-results-${width}-${q===pdfPhrase?'document':q.startsWith('$')?'amount':q.startsWith('smith')?'supplier':q.startsWith('OLD')?'imported':'invoice'}.png`),fullPage:true});}
  await page.getByRole('region',{name:'Search results'}).getByRole('link').first().click();const record=page.getByRole('region',{name:'Purchasing record'});await record.getByText('Read-only record. Purchasing decisions use the ordinary request and order workflows.',{exact:true}).waitFor();await page.screenshot({path:join(evidence,`SEARCH-001-open-record-${width}.png`),fullPage:true});
  await page.getByLabel('Number, supplier or text',{exact:true}).fill(bankNumber);const refused=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/purse/search');await page.getByRole('button',{name:'Search records',exact:true}).click();assert.equal((await(await refused).json()).total,0);await page.getByText('No records in your scope match these filters.',{exact:true}).waitFor();await page.screenshot({path:join(evidence,`SEARCH-001-no-protected-results-${width}.png`),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  return {clause:'SEARCH-001',width,scale};
 }catch(error){await page.screenshot({path:join(evidence,`SEARCH-001-failure-${width}.png`),fullPage:true});throw error;}finally{await context.close();}
}
