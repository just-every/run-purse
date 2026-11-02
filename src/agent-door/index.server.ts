import { createAgentDoor, type Trust } from '../modules/agent-door/index.ts'
import type { Bindings } from '../auth.server'
export { purseBusinessSettings } from './business.server'
import { nativePeople } from './people.server'
import { purchasingTools } from './tools.server'
import { purchasingResources } from './resources.server'

function trust(env: Bindings): Trust | null {
  const issuer=env.RER_OWNER_CLAIM_ISSUER, installationId=env.RER_OWNER_CLAIM_INSTALLATION_ID, publicKeys=env.RER_OWNER_CLAIM_PUBLIC_KEYS
  if (![issuer,installationId,publicKeys].some(Boolean)) return null
  if (!issuer || !installationId || !publicKeys) throw new Error('Incomplete agent door trust')
  return { issuer,installationId,appOrigin:env.AUTH_ORIGIN,publicKeys:JSON.parse(publicKeys) }
}
export function purseAgentDoor(env: Bindings) {
  return createAgentDoor({ seed:'purse',name:'Purse',specialist:'procurement',db:env.DB,origin:env.AUTH_ORIGIN,trust:trust(env),
    capabilities:['tools','resources','policy','pause','audit','idempotency'],
    people:nativePeople(env),tools:purchasingTools(env),resources:purchasingResources(env),
    notTools:[
      {clauses:['PUR-013','IMPORT-001','IMPORT-002'],reason:'import-door'},
      {clauses:['PUR-015'],reason:'installation'},
      {clauses:['MOBILE-001'],reason:'screen'},
      {clauses:['MOBILE-002'],reason:'device'},
      {clauses:['INTAKE-002','INTAKE-003','PUNCHOUT-001','PUNCHOUT-002'],reason:'connector'},
    ],
  })
}
