import {api} from '../src/purse/api'
import { runPurchasingSchedule } from '../src/purse/schedule'
import {authResponse} from '../src/auth.server'
export default {async scheduled(event:ScheduledController,env:any,ctx:ExecutionContext){ctx.waitUntil(runPurchasingSchedule(env,event.scheduledTime))},async fetch(request:Request,env:any,ctx:ExecutionContext){return await authResponse(request,env)??api.fetch(request,env,ctx)}}
