// Supported RER lifecycle, durable owner/data and same-release recovery/upgrade.
import assert from 'node:assert/strict';
import {cp,symlink,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fresh,freePort,command,start} from './browser-runtime.mjs';
import {readDevKey,signInAs} from '../src/modules/operator-auth/dev/sign-in-as.mjs';
const roots=[];let server;
async function installation(){
 const root=await fresh({sourceCopy:true});roots.push(root);
 await cp('node_modules',join(root,'node_modules'),{recursive:true,verbatimSymlinks:true});
 await cp('dist',join(root,'dist'),{recursive:true});
 return root;
}
async function signed(root,origin){
 const login=await signInAs({origin,key:await readDevKey(root),as:'owner',returnTo:'/app'});
 return login.cookies.map(c=>c.name+'='+c.value).join('; ');
}
try{
 const source=await installation(),port=await freePort();
 await command(source,['install']);await command(source,['setup','--owner-email','owner@example.test','--port',String(port),'--non-interactive'],{env:{PURSE_PREBUILT_ROOT:process.cwd()}});
 await command(source,['check']);await command(source,['describe']);
 server=await start(source,port);let cookie=await signed(source,server.origin);
 let response=await fetch(server.origin+'/api/purse/command/business',{method:'POST',headers:{origin:server.origin,cookie,'content-type':'application/json'},body:JSON.stringify({name:'Recovery business',currencies:['USD'],locations:['Denver'],costCentres:['Operations'],projects:['Safety']})});assert.equal(response.status,200,await response.text());
 let before=await (await fetch(server.origin+'/api/purse/state',{headers:{cookie}})).json();assert.equal(before.data.business[0].name,'Recovery business');
 await server.close();server=undefined;
 // Preview serves the emitted Worker under the same native session boundary.
 server=await start(source,port,'preview');assert.equal((await fetch(server.origin+'/health')).status,200);assert.equal((await fetch(server.origin+'/api/purse/state')).status,401);await server.close();server=undefined;
 // The supported in-place upgrade path reruns install/setup without losing private state.
 await command(source,['install']);await command(source,['setup','--owner-email','owner@example.test','--port',String(port),'--non-interactive'],{env:{PURSE_PREBUILT_ROOT:process.cwd()}});
 await command(source,['deploy','--dry-run'],{expected:3,env:{PURSE_PREBUILT_ROOT:process.cwd()}});
 await mkdir(join(source,'exports'),{recursive:true});await command(source,['export','--output','exports/recovery.rer']);
 await command(source,['import','--input','exports/recovery.rer','--journal','exports/recovery.rer','--yes'],{expected:4});
 const destination=await installation(),nextPort=await freePort();
 await command(destination,['setup','--owner-email','restored-owner@example.test','--port',String(nextPort),'--non-interactive'],{env:{PURSE_PREBUILT_ROOT:process.cwd()}});
 await mkdir(join(destination,'exports'),{recursive:true});await cp(join(source,'exports/recovery.rer'),join(destination,'exports/recovery.rer'));
 const bytes=await readFile(join(destination,'exports/recovery.rer'));await writeFile(join(destination,'exports/corrupt.rer'),bytes.subarray(0,Math.floor(bytes.length/2)),{mode:0o600});
 await command(destination,['import','--input','exports/corrupt.rer','--yes'],{expected:2});
 await command(destination,['import','--input','exports/recovery.rer','--yes'],{expected:4});
 await command(destination,['import','--input','exports/recovery.rer','--journal','exports/recovery.rer','--yes']);
 server=await start(destination,nextPort);cookie=await signed(destination,server.origin);
 const after=await (await fetch(server.origin+'/api/purse/state',{headers:{cookie}})).json();
 assert.deepEqual(after.data.business,before.data.business);assert.deepEqual(after.data.totals,before.data.totals);
 assert.equal((await fetch(server.origin+'/api/purse/state')).status,401);
 await server.close();server=undefined;await command(destination,['reset','--yes']);
 console.log('RER install/setup/check/describe, in-place upgrade, export, held/corrupt/nonempty restore, native owner continuation and reset passed');
}finally{await server?.close();for(const root of roots)await rm(root,{recursive:true,force:true});}
