import type { DevPersona } from './modules/operator-auth/dev/index.mjs'
export function devPersonas(): DevPersona[] { return ['requester','approver','buyer','receiver'].map(as=>({as,role:'member',displayName:`Purse ${as}`})) }
