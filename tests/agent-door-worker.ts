import native from './purse-worker'
import { purseAgentDoor, purseBusinessSettings } from '../src/agent-door/index.server'
export default { ...native, async fetch(request: Request, env: any, ctx: ExecutionContext) {
  const originalHost=request.headers.get('x-purse-native-test-host')
  if(originalHost!==null){const headers=new Headers(request.headers);headers.set('host',originalHost);headers.delete('x-purse-native-test-host');request=new Request(request,{headers})}
  return await purseBusinessSettings(env).handle(request) ?? await purseAgentDoor(env).handle(request) ?? native.fetch(request,env,ctx)
}}
