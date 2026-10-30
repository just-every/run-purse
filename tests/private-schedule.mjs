import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath} from 'node:fs/promises';
import {processInfo} from '@runeditrun/rer/internal/modules/job-queue/processes.mjs';
import {processCwd,listeners} from '@runeditrun/rer/internal/onboarding/process-diagnostics.mjs';
const exec=promisify(execFile);

/** The public RER proxy intentionally refuses trigger URLs. Find only the
 * Vite runtime below this journey's owned foreground server, never a port sweep. */
export async function privateSchedule(root,parent,time) {
 const expected=await realpath(root),pending=[parent],seen=new Set();let runtime;
 while(pending.length) {
  const pid=pending.pop();if(seen.has(pid))continue;seen.add(pid);
  const info=await processInfo(pid);
  const match=info?.title.match(/\/(?:vite\/bin\/vite\.js|@runeditrun\/rer\/onboarding\/development-runtime\.mjs)\s+dev\b.*?--port\s+(\d+)/);
  if(match&&await realpath(await processCwd(pid))===expected){
   if(runtime)throw new Error('More than one owned application runtime');
   // The CLI binds port zero and announces the actual Vite listener privately.
   // Inspect this proven descendant's own sockets, never unrelated processes
   // or workerd's helper listeners, to recover the bound application port.
   const ports=[...new Set((await listeners([pid])).flatMap(row=>row.names)
    .map(name=>/^127\.0\.0\.1:(\d+)$/.exec(name)?.[1]).filter(Boolean).map(Number))];
   const healthy=[];
   for(const port of ports){
    const response=await fetch(`http://127.0.0.1:${port}/health`,{redirect:'manual',signal:AbortSignal.timeout(5000)});
    if(response.ok&&response.headers.get('content-type')?.includes('application/json')){
     const health=await response.json();if(health.ok===true&&health.status==='ok')healthy.push(port);
    }else await response.body?.cancel();
   }
   if(healthy.length!==1)throw new Error('Owned Vite listener is unavailable or ambiguous');
   runtime=healthy[0];
   if(Number(match[1])!==0&&runtime!==Number(match[1]))throw new Error('Owned Vite listener differs from its requested port');
  }
  try {const result=await exec('pgrep',['-P',String(pid)]);pending.push(...result.stdout.trim().split(/\s+/).filter(Boolean).map(Number));}
  catch(error){if(error.code!==1)throw error;}
 }
 if(!runtime)throw new Error('Owned foreground Vite runtime was not found');
 const response=await fetch(`http://127.0.0.1:${runtime}/cdn-cgi/local/scheduled?time=${time}`);
 if(!response.ok)throw new Error('Private scheduled handler refused: '+response.status+' '+await response.text());
 await response.body?.cancel();
}
