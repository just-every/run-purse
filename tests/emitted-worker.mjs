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

// Serve a CLI-prepared installation's exact emitted Worker. Only the provider
// network edge is supplied here; native email links and invitations create the
// sessions, and CLI export/import reads the same persisted D1 and R2 stores.
export async function emittedInstallation(root,port){
 const {productionPlan}=await import('@runeditrun/rer/internal/onboarding/production-options.mjs');
 const {readFile,stat}=await import('node:fs/promises');
 const {createServer}=await import('node:http');
 const origin='http://127.0.0.1:'+port,messages=[],sessions={};
 const options=await productionPlan(root,origin,port);
 const worker=options.workers[0];
 worker.bindings={...worker.bindings,AUTH_ORIGIN:origin,RER_DEV_ORIGIN:origin,AUTH_LOCAL:'true',MAIL_PROVIDER:'resend',MAIL_API_KEY:'network-edge-test-key',MAIL_FROM:'Purse <purse@example.test>'};
 const screening=ofacCsv+'"Specially Designated Nationals (SDN) - Treasury Department",36,"AEROCARIBBEAN AIRLINES",,"Havana, Cuba",TEST,https://sanctionslist.ofac.treas.gov/Home/SdnList\n';
 worker.outboundService=async request=>{
  const url=new URL(request.url);
  if(url.origin==='https://data.trade.gov')return new Response(screening,{headers:{'last-modified':'Sun, 18 Oct 2026 12:00:00 GMT'}});
  assert.equal(url.origin,'https://api.resend.com','Only the declared mail and screening network edges are fixtures');
  assert.equal(request.method,'POST');messages.push(await request.json());return Response.json({id:crypto.randomUUID()});
 };
 options.unsafeTriggerHandlers=true;
 const mf=new Miniflare({...convertV4MiniflareOptions(options),resourcePersistencePath:join(root,'.wrangler/state/v3')});
 let site;
 try{
  await mf.ready;
  const call=(path,body,cookie='')=>fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(30000)});
  async function signIn(as){
   const email=as==='owner'?worker.bindings.OWNER_EMAIL:as+'@dev.localhost';
   if(!sessions[as]){
    let response=await call('/auth/magic-link',{email,returnTo:'/app'});
    assert.equal(response.status,202,await response.text());
    let message=messages.findLast(m=>Array.isArray(m.to)?m.to.includes(email):m.to===email);
    if(!message&&as!=='owner'){
     const owner=await signIn('owner'),cookie=owner.header;
     response=await call('/api/purse/invite',{email},cookie);assert.equal(response.status,200,await response.text());
     message=messages.findLast(m=>Array.isArray(m.to)?m.to.includes(email):m.to===email);
    }
    assert.ok(message,'Native sign-in or invitation reaches the mail network edge for '+as);
    const link=message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/);assert.ok(link,'Native confirmation URL exists');
    const token=new URL(link[0]).searchParams.get('token');
    response=await call('/auth/confirm',{token});assert.equal(response.status,303,await response.text());
    sessions[as]=response.headers.get('set-cookie').split(';')[0];
   }
   const split=sessions[as].indexOf('=');
   return {header:sessions[as],cookies:[{name:sessions[as].slice(0,split),value:sessions[as].slice(split+1)}]};
  }
  // The declared run site is served from its emitted bytes, with clean URLs.
  site=createServer(async(request,response)=>{
   try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    assert.ok(!pathname.split('/').includes('..'));
    let file=join(root,'dist/site',pathname==='/'?'index.html':pathname);
    if(!(await stat(file).catch(()=>null))?.isFile())file+='.html';
    const data=await readFile(file),extension=file.split('.').pop();
    response.setHeader('content-type',({html:'text/html',css:'text/css',js:'text/javascript',svg:'image/svg+xml',woff2:'font/woff2',png:'image/png'})[extension]??'application/octet-stream');response.end(data);
   }catch{response.statusCode=404;response.end('Not found');}
  });
  await new Promise((resolve,reject)=>{site.once('error',reject);site.listen(0,'127.0.0.1',resolve);});
  return {origin,siteOrigin:'http://127.0.0.1:'+site.address().port,signIn,
   async mailMode(provider){worker.bindings.MAIL_PROVIDER=provider;await mf.setOptions({...convertV4MiniflareOptions(options),resourcePersistencePath:join(root,'.wrangler/state/v3')});},
   async nativeOwnerProof(options){
    const {localCliProof}=await import('@runeditrun/rer/adapter-auth');
    assert.equal(new Headers(options.headers).get('x-rer-local-cli'),localCliProof(worker.bindings.SESSION_SECRET),'The fixture requires possession of this installation’s local owner proof');
    const email=worker.bindings.OWNER_EMAIL;
    const confirm=async cookie=>{const message=messages.findLast(m=>Array.isArray(m.to)?m.to.includes(email):m.to===email);assert.ok(message);const token=new URL(message.text.match(/http:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]).searchParams.get('token');const response=await call('/auth/confirm',{token},cookie);assert.equal(response.status,303,await response.text());return response;};
    let response=await call('/auth/magic-link',{email,returnTo:'/app'});assert.equal(response.status,202,await response.text());
    const login=await confirm(''),cookie=login.headers.get('set-cookie').split(';')[0];
    response=await call('/auth/step-up',{action:'export'},cookie);assert.equal(response.status,202,await response.text());await confirm(cookie);
    return new Response(null,{status:login.status,headers:login.headers});
   },
   async schedule(time){const r=await mf.dispatchFetch(origin+'/cdn-cgi/local/scheduled?time='+time);assert.equal(r.status,200,await r.text());},
   async close(){site.closeAllConnections();await new Promise((resolve,reject)=>site.close(e=>e?reject(e):resolve()));await mf.dispose();}
  };
 }catch(error){site?.close();await mf.dispose();throw error;}
}
