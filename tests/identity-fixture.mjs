import {workerNodeBuiltins} from './worker-bundle.mjs'
import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {build} from 'esbuild'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {unstable_splitSqlQuery} from 'wrangler'
import {identityIdp} from './identity-idp.mjs'

function cookies(response){const values=response.headers.getSetCookie?.()??response.headers.get('set-cookie')?.split(/,(?=\s*[^;,]+=)/)??[];return values.map(value=>value.trim().split(';')[0])}
export async function identityFixture({providerFactory,samlFactory,samlOnly=false,ofac}={}){
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const origin='http://127.0.0.1:'+port,idp=providerFactory?await providerFactory('http://127.0.0.1:'+port+'/auth/oidc/company/callback'):await identityIdp(),saml=samlFactory?await samlFactory('http://127.0.0.1:'+port):undefined,dir=await mkdtemp(join(tmpdir(),'purse-identity-')),messages=[];
 idp.setCallback?.(origin+'/auth/oidc/company/callback');let mf;
 const transactionSecret='synthetic-purse-100000000000000000000001',sessionSecret='synthetic-purse-100000000000000000000002',setupToken='synthetic-purse-100000000000000000000003';
 try{
  const bundle=await build({entryPoints:['tests/purse-worker.ts'],plugins:[workerNodeBuiltins],bundle:true,loader:{'.ttf':'dataurl'},write:false,format:'esm',platform:'neutral',mainFields:['module','main'],conditions:['workerd','worker','browser'],external:['node:*','cloudflare:*'],target:'es2023'});
  mf=new Miniflare({...convertV4MiniflareOptions({host:'127.0.0.1',port,modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'purse'},r2Buckets:{ORIGINALS:'purse-originals'},outboundService:async request=>{
   if(new URL(request.url).origin==='https://data.trade.gov'&&ofac)return ofac();
   if(new URL(request.url).origin===idp.origin){const response=await fetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),...(request.method==='POST'?{body:await request.text()}:{}),redirect:'manual'});if(providerFactory){const value=response.ok?null:await response.clone().json().catch(()=>null);console.error(JSON.stringify({oktaNetwork:{method:request.method,path:new URL(request.url).pathname,status:response.status,error:value?.error}}))}return response;}
   assert.equal(new URL(request.url).origin,'https://api.resend.com');messages.push(await request.json());return Response.json({id:crypto.randomUUID()});
  },bindings:{AUTH_ORIGIN:origin,AUTH_LOCAL:'true',OWNER_EMAIL:'owner@example.test',SESSION_SECRET:sessionSecret,SETUP_TOKEN:setupToken,MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-purse-1004',MAIL_FROM:'Purse <purse@example.test>',...(saml?{SAML_PROVIDERS:JSON.stringify([saml.provider])}:{}),OIDC_PROVIDERS:JSON.stringify([{id:'company',preset:providerFactory?'okta':'auth',issuer:idp.origin,clientId:idp.clientId,label:providerFactory?'Okta Purse test':'Local test company',...(providerFactory?{tokenAuthMethod:'client_secret_post',subjectEmails:{[idp.user.id]:idp.user.profile.email}}:{})}]),OIDC_CREDENTIALS:JSON.stringify({company:providerFactory?{clientSecret:idp.clientSecret}:{privateKey:idp.privateKey}}),OIDC_TRANSACTION_SECRET:transactionSecret,...(samlOnly?{OIDC_PROVIDERS:'[]'}:{})}}),unsafeTriggerHandlers:true,resourcePersistencePath:dir});
  const db=await mf.getD1Database('DB');for(const file of (await readdir('migrations/core')).filter(value=>value.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile('migrations/core/'+file,'utf8')).map(sql=>db.prepare(sql)));
  const request=async(path,{cookie='',body,method=body===undefined?'GET':'POST',headers={}}={})=>mf.dispatchFetch(origin+path,{method,headers:{host:new URL(origin).host,origin,cookie,'CF-Connecting-IP':'127.0.0.1',...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),redirect:'manual'});
  const send=async(path,body,cookie='',status=200)=>{const response=await request(path,{body,cookie}),text=await response.text();let value;try{value=JSON.parse(text)}catch{value=text}assert.equal(response.status,status,typeof value==='string'?value:JSON.stringify(value));return {response,value,cookie:cookies(response).find(value=>value.startsWith('operator_session_local_'))}};
  const command=(op,body,cookie=owner,status=200)=>send('/api/purse/command/'+op,body,cookie,status).then(result=>result.value);
  const owner=(await send('/auth/bootstrap',{token:setupToken,displayName:'Owner'},'',303)).cookie;assert.ok(owner);
  const settings=async(action,cookie=owner,status=303,headers={})=>{const response=await request('/auth/purse/identity',{cookie,body:new URLSearchParams({action}).toString(),headers:{'content-type':'application/x-www-form-urlencoded',...headers}});assert.equal(response.status,status);return response};
  const begin=async()=>{
   const start=await request('/auth/oidc/company/start',{body:{returnTo:'/app'}});assert.equal(start.status,303);
   const provider=idp.authorize?await idp.authorize(start.headers.get('location')):await fetch(start.headers.get('location'),{redirect:'manual'}).then(response=>{assert.equal(response.status,303);return response.headers.get('location')});
   return {path:new URL(provider).pathname+new URL(provider).search,cookie:cookies(start).join('; ')};
  };
  const complete=async(transaction,status=303)=>{
   const response=await request(transaction.path,{cookie:transaction.cookie});assert.equal(response.status,status,await response.clone().text());return {response,cookie:cookies(response).find(value=>value.startsWith('operator_session_local_'))};
  };
  const signIn=async()=>complete(await begin());
  return {idp,saml,origin,db,mf,messages,owner,request,send,command,settings,begin,complete,signIn,transactionSecret,sessionSecret,async close(){await mf.dispose();await saml?.close?.();await idp.close();await rm(dir,{recursive:true,force:true})}};
 }catch(error){await mf?.dispose();await saml?.close?.();await idp.close();await rm(dir,{recursive:true,force:true});throw error}
}
