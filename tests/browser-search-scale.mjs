import assert from 'node:assert/strict';
import { mkdir,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { fresh,freePort,command } from './browser-runtime.mjs';
import { prepareSearchArchive } from './search-fixtures.mjs';
import { seedNativeSearchScale } from './search-scale-native.mjs';
import { searchJourney } from './browser-search.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if(process.platform==='darwin'&&!process.env.PURSE_CHROMIUM_EXECUTABLE_PATH)throw new Error('Set PURSE_CHROMIUM_EXECUTABLE_PATH to a current chrome-headless-shell (build 1243 or later) before running this Mac journey');
const evidence=process.env.PURSE_EVIDENCE??'.cache/purse-search-scale-proof',root=await fresh();let child,browser;
const rerEntry=fileURLToPath(import.meta.resolve('@runeditrun/rer/internal/global/rer.mjs'));
try {
 await mkdir(evidence,{recursive:true});await command(root,['install']);const port=await freePort();await command(root,['setup','--owner-email','owner@example.test','--port',String(port)]);await mkdir(join(root,'exports'),{recursive:true});await prepareSearchArchive(join(root,'exports/search-source.rer'),{scale:false});await command(root,['import','--input','exports/search-source.rer','--journal','exports/search-source.rer','--yes']);await seedNativeSearchScale(root);
 child=spawn(process.execPath,[rerEntry,'dev','--port',String(port),'--foreground'],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false',RER_SERVER_JOURNEY:'1'},stdio:['ignore','pipe','pipe']});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes;});const deadline=Date.now()+10*60*1000;while(!output.includes('RER_READY')&&Date.now()<deadline){assert.equal(child.exitCode,null,'Own dev process exited');await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(output.includes('RER_READY'),'Own dev process ready');
 browser=await chromium.launch({headless:true,...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PURSE_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--use-mock-keychain','--password-store=basic']});
 for(const width of [1440,390]){console.log('SEARCH-001 browser width '+width+' in 100000-record native workspace');await searchJourney(browser,root,`http://127.0.0.1:${port}`,width,evidence,{as:'owner',scale:true});}
 console.log('SEARCH-001 native browser journey passed at 1440 and 390');
}finally{await browser?.close();if(child?.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}await rm(root,{recursive:true,force:true});}
