import {createServer} from 'node:http'
import {spawn} from 'node:child_process'

/** Expose only the disposable native SCIM transport while testing the real Okta connection API. */
export async function oktaScimConnection(h,token){
 const observed=[],server=createServer(async(request,response)=>{
  try{
   const url=new URL(request.url,'http://localhost')
   if(!/^\/scim\/v2(?:\/|$)/.test(url.pathname)){response.writeHead(404);return response.end()}
   const chunks=[];let size=0
   for await(const chunk of request){size+=chunk.length;if(size>1600000){response.writeHead(413);return response.end()}chunks.push(chunk)}
   const native=await h.request(url.pathname+url.search,{method:request.method,headers:{authorization:request.headers.authorization??'','content-type':request.headers['content-type']??'application/scim+json'},...(chunks.length?{body:Buffer.concat(chunks).toString()}: {})})
   observed.push({method:request.method,path:url.pathname,status:native.status});response.writeHead(native.status,Object.fromEntries(native.headers));response.end(Buffer.from(await native.arrayBuffer()))
  }catch{response.writeHead(502);response.end()}
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const tunnel=spawn('cloudflared',['tunnel','--no-autoupdate','--url','http://127.0.0.1:'+server.address().port,'--protocol','http2'],{stdio:['ignore','pipe','pipe']})
 let app
 try{
  const origin=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('Disposable SCIM tunnel did not start')),30000);const data=chunk=>{log=(log+chunk.toString()).slice(-16000);const match=log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match){clearTimeout(timer);resolve(match[0])}};tunnel.stdout.on('data',data);tunnel.stderr.on('data',data);tunnel.once('error',error=>{clearTimeout(timer);reject(error)});tunnel.once('exit',()=>{clearTimeout(timer);reject(new Error('Disposable SCIM tunnel stopped'))})})
  app=await h.idp.api('/apps',{name:'scim2headerauth',label:'Purse ACCESS-002 SCIM '+Date.now(),signOnMode:'AUTO_LOGIN'})
  const connection=await h.idp.api('/apps/'+app.id+'/connections/default?activate=true',{baseUrl:origin+'/scim/v2',profile:{authScheme:'TOKEN',token}})
  return {app:app.id,connection:connection.status,scheme:connection.profile?.authScheme,providerRequests:observed,gap:connection.status==='ENABLED'? 'User mapping and provider lifecycle push remain unqualified':'The custom SCIM test app needs owner Admin Console provisioning setup; the public connection API returns UNKNOWN'}
 }finally{
  if(app){await h.idp.api('/apps/'+app.id+'/lifecycle/deactivate',{});await h.idp.api('/apps/'+app.id,undefined,'DELETE')}
  tunnel.kill('SIGTERM');server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
 }
}
