// Run the build artifact through its real HTTP listener, including assets and SSR.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {ofacCsv} from './purse-harness.mjs';

export async function emittedWorker(){
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const origin=`http://127.0.0.1:${port}`,directory=await mkdtemp(join(tmpdir(),'purse-emitted-')),messages=[];
 const modules=[{type:'ESModule',path:resolve('dist/server/index.js')},...(await readdir('dist/server/assets')).filter(x=>x.endsWith('.js')).map(x=>({type:'ESModule',path:resolve('dist/server/assets',x)}))];
 const mf=new Miniflare({...convertV4MiniflareOptions({host:'127.0.0.1',port,modules,assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true}},compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'purse'},r2Buckets:{ORIGINALS:'purse-originals'},bindings:{AUTH_ORIGIN:origin,AUTH_LOCAL:'true',OWNER_EMAIL:'owner@example.test',SESSION_SECRET:'synthetic-browser-session-secret-0123456789',SETUP_TOKEN:'synthetic-browser-bootstrap-0123456789',MAIL_PROVIDER:'rer',MAIL_API_KEY:'synthetic-browser-relay',MAIL_RELAY_URL:'https://relay.example.test/messages',MAIL_FROM:'Purse <purse@example.test>'},outboundService:async request=>{if(new URL(request.url).origin==='https://data.trade.gov')return new Response(ofacCsv,{headers:{'last-modified':'Sun, 18 Oct 2026 12:00:00 GMT'}});assert.equal(new URL(request.url).origin,'https://relay.example.test');assert.equal(request.method,'POST');assert.equal(request.headers.get('authorization'),'Bearer synthetic-browser-relay');messages.push(await request.json());return Response.json({messageId:'<'+crypto.randomUUID()+'@example.test>'},{status:202});}}),resourcePersistencePath:directory});
 try{
 const db=await mf.getD1Database('DB');
 for(const file of (await readdir('migrations/core')).filter(x=>x.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile('migrations/core/'+file,'utf8')).map(sql=>db.prepare(sql)));
 await mf.ready;
 const call=async(path,body,cookie='')=>{
  const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
  return response;
 };
 const bootstrap=await call('/auth/bootstrap',{token:'synthetic-browser-bootstrap-0123456789',displayName:'Owner'});assert.equal(bootstrap.status,303,await bootstrap.clone().text());
 const sessions={owner:bootstrap.headers.get('set-cookie').split(';')[0]};
 async function member(as){
  const email=as+'@dev.localhost';
  const configured=await call('/api/purse/command/member',{email,name:as,roles:[as],active:true},sessions.owner);assert.equal(configured.status,200,await configured.text());
  const invited=await call('/api/purse/invite',{email},sessions.owner);assert.equal(invited.status,200,await invited.text());
  const message=messages.findLast(m=>m.to===email);assert.ok(message,'Native invitation reaches the configured Managed relay');
  const token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');
  const confirmed=await call('/auth/confirm',{token});assert.equal(confirmed.status,303,await confirmed.clone().text());sessions[as]=confirmed.headers.get('set-cookie').split(';')[0];
 }
 return {origin,sessions,member,messages,call,async close(){await mf.dispose();await rm(directory,{recursive:true,force:true});}};
 }catch(error){await mf.dispose();await rm(directory,{recursive:true,force:true});throw error;}
}
