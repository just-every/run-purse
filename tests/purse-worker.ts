import {api} from '../src/purse/api'
import { runPurchasingSchedule } from '../src/purse/schedule'
import {authResponse} from '../src/auth.server'
export default {async scheduled(event:ScheduledController,env:any,ctx:ExecutionContext){ctx.waitUntil(runPurchasingSchedule(env,event.scheduledTime))},async fetch(request:Request,env:any,ctx:ExecutionContext){
 // The test ingress overwrites this marker from the original HTTP Host before
 // Miniflare's internal transport changes Host to its private runtime listener.
 const originalHost=request.headers.get('x-purse-native-test-host');
 if(originalHost!==null){const headers=new Headers(request.headers);headers.set('host',originalHost);headers.delete('x-purse-native-test-host');request=new Request(request,{headers});}
 return await authResponse(request,env)??api.fetch(request,env,ctx)
}}
