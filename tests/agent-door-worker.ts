// Focused proofs use the native adapter with its production admission limits.
import native from './purse-worker'
import { purseAgentDoor, purseBusinessSettings } from '../src/agent-door/index.server'
const systemNow=Date.now
export default { ...native, async fetch(request: Request, env: any, ctx: ExecutionContext) {
  // Freeze the policy admission day in this disposable test Worker only.
  // Native sessions, signed envelopes and the unmodified door share that clock.
  Date.now=env.PURSE_TEST_CLOCK ? ()=>Date.parse(env.PURSE_TEST_CLOCK) : systemNow
  const originalHost=request.headers.get('x-purse-native-test-host')
  if(originalHost!==null){const headers=new Headers(request.headers);headers.set('host',originalHost);headers.delete('x-purse-native-test-host');request=new Request(request,{headers})}
  return await purseBusinessSettings(env).handle(request) ?? await purseAgentDoor(env).handle(request) ?? native.fetch(request,env,ctx)
}}
