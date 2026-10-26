import {readFile} from 'node:fs/promises';
/** Serve the shipped UI/assets. Every native API request reaches the real Worker. */
export async function nativeWebContext(browser,h,width,bundle,cookie=h.owner){
 const context=await browser.newContext({viewport:{width,height:1000}}),[name,value]=cookie.split('=');await context.addCookies([{name,value,url:h.origin}]);
 await context.route(h.origin+'/**',async route=>{const path=new URL(route.request().url()).pathname;
  if(path==='/app')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/rer-theme.css"><link rel="stylesheet" href="/purse.css"></head><body><div id="root"></div><script type="module" src="/test-app.js"></script></body></html>'});
  if(path==='/test-app.js')return route.fulfill({contentType:'text/javascript',body:bundle});
  if(['/rer-theme.css','/purse.css'].includes(path)||/^\/(fonts|brand)\/[a-zA-Z0-9./_-]+$/.test(path)&&!path.includes('..'))return route.fulfill({body:await readFile('public'+path),contentType:({css:'text/css',woff2:'font/woff2',svg:'image/svg+xml'})[path.split('.').pop()]||'application/octet-stream'});
  return route.continue();
 });return context;
}
