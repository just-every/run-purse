import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath} from 'node:fs/promises';
import {processInfo} from '@runeditrun/rer/internal/modules/job-queue/processes.mjs';
import {processCwd} from '@runeditrun/rer/internal/onboarding/process-diagnostics.mjs';
const exec=promisify(execFile);

/** The public RER proxy intentionally refuses trigger URLs. Find only the
 * Vite runtime below this journey's owned foreground server, never a port sweep. */
export async function privateSchedule(root,parent,time) {
 const expected=await realpath(root),pending=[parent],seen=new Set();let runtime;
 while(pending.length) {
  const pid=pending.pop();if(seen.has(pid))continue;seen.add(pid);
  const info=await processInfo(pid);
  const match=info?.title.match(/\/vite\/bin\/vite\.js\s+dev\b.*?--port\s+(\d+)/);
  if(match&&await realpath(await processCwd(pid))===expected){if(runtime)throw new Error('More than one owned application runtime');runtime=Number(match[1]);}
  try {const result=await exec('pgrep',['-P',String(pid)]);pending.push(...result.stdout.trim().split(/\s+/).filter(Boolean).map(Number));}
  catch(error){if(error.code!==1)throw error;}
 }
 if(!runtime)throw new Error('Owned foreground Vite runtime was not found');
 const response=await fetch(`http://127.0.0.1:${runtime}/cdn-cgi/local/scheduled?time=${time}`);
 if(!response.ok)throw new Error('Private scheduled handler refused: '+response.status+' '+await response.text());
 await response.body?.cancel();
}
