import {createServer,request as httpRequest} from 'node:http'
import {createHash} from 'node:crypto'

// Test-only one-use relay. The real Worker receives the original request bytes
// and headers. Drain its complete response without parsing or sending any of it
// to the caller, then destroy the caller's connection. No application fake.
export async function responseLossRelay(target) {
 const canonical=new URL('/mcp',target)
 let used=false,upstream,active
 let complete
 const completed=new Promise(resolve=>{complete=resolve})
 const server=createServer((incoming,downstream)=>{
  if(used||incoming.method!=='POST'||incoming.url!=='/mcp') {
   downstream.writeHead(410);downstream.end();return
  }
  used=true
  active=(async()=>{
   try {
    const chunks=[]
    for await(const chunk of incoming)chunks.push(chunk)
    const body=Buffer.concat(chunks)
    const observation={forwarded:1,requestSha256:createHash('sha256').update(body).digest('hex'),workerCompleted:false,downstreamBytes:0,responseBytes:0}
    await new Promise((resolve,reject)=>{
     upstream=httpRequest(canonical,{method:incoming.method,headers:incoming.headers,timeout:20_000},response=>{
      observation.status=response.statusCode
      response.on('data',chunk=>{observation.responseBytes+=chunk.length})
      response.once('error',reject)
      response.once('end',()=>{observation.workerCompleted=response.complete;resolve()})
     })
     upstream.once('error',reject)
     upstream.once('timeout',()=>upstream.destroy(new Error('Worker response timeout')))
     upstream.end(body)
    })
    // No headers or response body have been written downstream at this point.
    complete(observation)
    downstream.destroy()
   } catch(error) {
    complete({failure:error.message})
    downstream.destroy()
   }
  })()
 })
 try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  return {url:'http://127.0.0.1:'+server.address().port+'/mcp',completed,async close(){
   upstream?.destroy()
   server.closeAllConnections()
   await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
   await active
  }}
 } catch(error) {server.close();throw error}
}
