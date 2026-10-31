import { createAgentDoor, type AgentDoorOptions, type Trust } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
export { purseBusinessSettings } from './business.server'
import { nativePeople } from './people.server'
import { purchasingTools } from './tools.server'
import { purchasingResources } from './resources.server'
import { purchasingPrompts } from './prompts.server'
import { specialistInstructions } from './docs.server'

function trust(env: Bindings): Trust | null {
  const issuer=env.RER_OWNER_CLAIM_ISSUER, installationId=env.RER_OWNER_CLAIM_INSTALLATION_ID, publicKeys=env.RER_OWNER_CLAIM_PUBLIC_KEYS
  if (![issuer,installationId,publicKeys].some(Boolean)) return null
  if (!issuer || !installationId || !publicKeys) throw new Error('Incomplete agent door trust')
  return { issuer,installationId,appOrigin:env.AUTH_ORIGIN,publicKeys:JSON.parse(publicKeys) }
}
export function purseAgentOptions(env: Bindings): AgentDoorOptions {
  return { seed:'purse',name:'Purse',specialist:'procurement',db:env.DB,origin:env.AUTH_ORIGIN,trust:trust(env),
    capabilities:['tools','policy','pause','audit','idempotency','prompts'],
    limits:{requestsPerMinute:600,maxBodyBytes:1048576},prompts:purchasingPrompts(),
    people:nativePeople(env),tools:purchasingTools(env),resources:purchasingResources(env),
    notTools:[
      {clauses:['PUR-013','IMPORT-001','IMPORT-002'],reason:'import-door'},
      {clauses:['PUR-015'],reason:'installation'},
      {clauses:['MOBILE-001'],reason:'screen'},
      {clauses:['MOBILE-002'],reason:'device'},
      {clauses:['INTAKE-002','INTAKE-003','PUNCHOUT-001','PUNCHOUT-002'],reason:'connector'},
    ],
  }
}
export function purseAgentDoor(env: Bindings) {
  const options=purseAgentOptions(env), door=createAgentDoor(options)
  return {...door, async handle(request:Request) {
    const response=await door.handle(request)
    if(!response || new URL(request.url).pathname!=='/mcp' || !response.ok || !response.headers.get('content-type')?.includes('application/json'))return response
    const body=await response.clone().json() as {result?:{instructions?:string}}
    if(typeof body.result?.instructions!=='string')return response
    body.result.instructions=specialistInstructions(options)
    return new Response(JSON.stringify(body),{status:response.status,headers:response.headers})
  }}
}
