import {api} from '../src/purse/api'
import {authResponse} from '../src/auth.server'
export default {async fetch(request:Request,env:any,ctx:ExecutionContext){return await authResponse(request,env)??api.fetch(request,env,ctx)}}
