import {createServer} from 'node:net'
import {unstable_splitSqlQuery} from 'wrangler'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {build} from 'esbuild'
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import assert from 'node:assert/strict'
export async function harness({ofac}={}){const messages=[];const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const origin=`http://127.0.0.1:${port}`;const dir=await mkdtemp(join(tmpdir(),'purse-test-')),bundle=await build({entryPoints:['tests/purse-worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',conditions:['workerd','worker','browser'],external:['node:*','cloudflare:*'],target:'es2023'});const mf=new Miniflare({...convertV4MiniflareOptions({host:'127.0.0.1',port,modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'purse'},outboundService:async request=>{if(new URL(request.url).origin==='https://data.trade.gov'){return ofac?ofac():new Response(ofacCsv,{headers:{'last-modified':'Sun, 18 Oct 2026 12:00:00 GMT'}})}assert.equal(new URL(request.url).origin,'https://api.resend.com');messages.push(await request.json());return Response.json({id:crypto.randomUUID()});},bindings:{AUTH_ORIGIN:origin,AUTH_LOCAL:'true',OWNER_EMAIL:'owner@example.test',SESSION_SECRET:'local-test-secret-not-production-0123456789',SETUP_TOKEN:'synthetic-local-test-bootstrap-token-0123456789',MAIL_PROVIDER:'resend',MAIL_API_KEY:'network-edge-test-key',MAIL_FROM:'Purse <purse@example.test>'}}),resourcePersistencePath:dir});try{const db=await mf.getD1Database('DB');for(const file of (await readdir('migrations/core')).filter(f=>f.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile('migrations/core/'+file,'utf8')).map(sql=>db.prepare(sql)));
 const send=async(path,b,cookie='')=>{const r=await mf.dispatchFetch(origin+path,{method:b===undefined?'GET':'POST',headers:{host:new URL(origin).host,origin,'content-type':'application/json',cookie},...(b===undefined?{}:{body:JSON.stringify(b)}),redirect:'manual'});let value;const content=await r.text();try{value=JSON.parse(content)}catch{value=content}return {status:r.status,value,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers}};
 const bootstrap=await send('/auth/bootstrap',{token:'synthetic-local-test-bootstrap-token-0123456789',displayName:'Owner'});assert.equal(bootstrap.status,303,JSON.stringify(bootstrap.value));const owner=bootstrap.cookie;
 const command=async(op,b,cookie=owner,status=200)=>{const r=await send('/api/purse/command/'+op,b,cookie);assert.equal(r.status,status,`${op}: ${JSON.stringify(r.value)}`);return r.value};
 const state=async(cookie=owner)=>{const r=await send('/api/purse/state',undefined,cookie);assert.equal(r.status,200,JSON.stringify(r.value));return r.value};
 const confirmMail=async(email,cookie='')=>{const message=[...messages].reverse().find(m=>m.to.includes(email));assert.ok(message);const token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');const confirmed=await send('/auth/confirm',{token},cookie);assert.equal(confirmed.status,303,JSON.stringify(confirmed.value));return confirmed};
 const member=async(email,roles,nativeRole='member')=>{
  await command('member',{email,name:email,roles,active:true});
  if(nativeRole==='owner'){
   const stepUp=await send('/auth/step-up',{action:'owner:transfer'},owner);assert.equal(stepUp.status,202,JSON.stringify(stepUp.value));
   const confirmed=await confirmMail('owner@example.test',owner);assert.ok(!confirmed.cookie,'Step-up must preserve the requesting session');
  }
  const invite=nativeRole==='owner'?await send('/auth/invite',{email,displayName:email,role:'owner'},owner):await send('/api/purse/invite',{email},owner);assert.equal(invite.status,nativeRole==='owner'?202:200,JSON.stringify(invite.value));
  const confirmed=await confirmMail(email);assert.ok(confirmed.cookie,'Invitation confirmation must create a native session');return confirmed.cookie;
 };
 return {db,mf,dir,owner,send,command,state,member,messages,async close(){await mf.dispose();await rm(dir,{recursive:true,force:true})}}}catch(error){await mf.dispose();await rm(dir,{recursive:true,force:true});throw error}}

// Synthetic Commerce CSL-format records at the public network edge only.
export const ofacCsv = 'source,entity_number,name,alt_names,addresses,programs,source_list_url\n"Specially Designated Nationals (SDN) - Treasury Department",901,"Restricted Test Trading","Blocked Alias Test","123 Test Street, Denver, CO 80202, United States",TEST,https://sanctionslist.ofac.treas.gov/Home/SdnList\n"Entity List (EL) - Bureau of Industry and Security",902,"Safe Office Supply",,,TEST,https://www.bis.gov\n'
