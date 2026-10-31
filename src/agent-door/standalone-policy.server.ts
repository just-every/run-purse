import type { Bindings } from '../auth.server'
import { CATALOGUE } from '../modules/agent-door/policy/catalogue.ts'
import { SCHEMA, type PolicyDocument } from '../modules/agent-door/policy/document.ts'

/** The answer an installation with no company pairing and no saved owner policy
 * gives until its owner saves one at /agents. In-app assistants the owner enabled
 * may read their sources into nonbinding reports; every other class is blocked
 * and no paid AI is used. It is not an owner answer, so scheduled assistants keep
 * their native governance under it (companyConfigured). */
export const standalonePolicy: PolicyDocument = {
  schema: SCHEMA, catalogue: CATALOGUE,
  rules: [{ id: 'standalone-assistants', class: 'sensitive', do: 'autonomous' }, { id: 'standalone-default', class: '*', do: 'blocked' }],
  spend: { none: true },
}
export const standaloneDocument = JSON.stringify(standalonePolicy)

export async function adoptStandalonePolicy(env: Bindings) {
  if (env.RER_OWNER_CLAIM_ISSUER || env.RER_BUSINESS_TRUST) return
  await env.DB.prepare('INSERT INTO agent_door_state(id,local_document,local_revision) VALUES(1,?,1) ON CONFLICT(id) DO UPDATE SET local_document=excluded.local_document,local_revision=1 WHERE agent_door_state.local_document IS NULL AND agent_door_state.local_revision=0 AND agent_door_state.envelope IS NULL')
    .bind(standaloneDocument).run()
}
