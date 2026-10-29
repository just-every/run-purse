import { createBusinessSettings } from '../modules/business-settings/index.ts'
import { operatorAuth, type Bindings } from '../auth.server'

export function purseBusinessSettings(env: Bindings) {
  return createBusinessSettings({ db: env.DB, trust: env.RER_BUSINESS_TRUST ?? null,
    business: { settings: 1, values: ['display_name'], team: { roles: { admin: 'admin', member: 'member' } } },
    // Public health, assets and the unclaimed lobby need no native auth config.
    // Construct the real team service only when signed settings synchronize it.
    team: { prepare: input=>operatorAuth(env).businessTeam!.prepare(input) },
  })
}
