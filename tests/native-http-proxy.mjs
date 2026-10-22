import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {once} from 'node:events';

// Keep the public listener bound while workerd chooses its own port atomically.
// Every request reaches the real worker with the configured public auth origin.
export async function nativeHttpProxy() {
 let worker,origin;
 const server=createServer(async(request,response)=>{
  try {
   const headers=new Headers();
   for(let i=0;i<request.rawHeaders.length;i+=2)headers.append(request.rawHeaders[i],request.rawHeaders[i+1]);
   const result=await worker.dispatchFetch(origin+request.url,{method:request.method,headers,redirect:'manual',
    ...(['GET','HEAD'].includes(request.method)?{}:{body:Readable.toWeb(request),duplex:'half'})});
   response.statusCode=result.status;
   for(const [key,value] of result.headers)if(key!=='set-cookie')response.setHeader(key,value);
   const cookies=result.headers.getSetCookie();if(cookies.length)response.setHeader('set-cookie',cookies);
   if(result.body)for await(const chunk of result.body)if(!response.write(chunk))await once(response,'drain');
   response.end();
  } catch(error) { response.destroy(error); }
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 origin='http://127.0.0.1:'+server.address().port;
 return {origin,attach(value){worker=value;},async close(){server.closeAllConnections();if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
