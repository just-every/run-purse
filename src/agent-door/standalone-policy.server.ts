import type { Bindings } from '../auth.server'
import { CATALOGUE } from '../modules/agent-door/policy/catalogue.ts'
import { SCHEMA, validateDocument } from '../modules/agent-door/policy/document.ts'

/** Purse's default agent policy for a standalone installation. Without pairing no
 * outside agent can authenticate, so it decides only Purse's own assistants: their
 * source-scoped reports and their scheduled supplier and requester messages, which
 * still need the owner's per-type enablement, native grants, consent and limits.
 * Every other agent action is blocked. The owner replaces it at /agents. */
export const standalonePolicy = validateDocument({
  schema: SCHEMA, catalogue: CATALOGUE,
  rules: [
    { id: 'purse-assistants', class: 'sensitive', do: 'autonomous' },
    { id: 'purse-scheduled-messages', class: 'external', do: 'autonomous' },
    { id: 'other-agent-actions', class: '*', do: 'blocked' },
  ],
  spend: { none: true },
})

/** A paired installation's policy comes from its Business; the default never applies. */
export const paired = (env: Bindings) => Boolean(env.RER_BUSINESS_TRUST || env.RER_OWNER_CLAIM_ISSUER)

/** Saves the default once, before an assistant call on an unpaired installation that has
 * no saved policy. A saved owner policy or an owner's pause is never replaced. */
export async function ensureStandalonePolicy(env: Bindings) {
  if (paired(env)) return
  await env.DB.prepare(`INSERT INTO agent_door_state(id,local_document,local_revision) VALUES(1,?,1)
    ON CONFLICT(id) DO UPDATE SET local_document=excluded.local_document,local_revision=agent_door_state.local_revision+1
    WHERE agent_door_state.local_document IS NULL AND agent_door_state.local_paused=0`).bind(JSON.stringify(standalonePolicy)).run()
}
