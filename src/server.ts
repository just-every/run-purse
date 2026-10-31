import { runNotificationDeliveries } from './purse/notification-delivery'
import { withDemo } from './modules/demo/index.mjs'
import start from '@tanstack/react-start/server-entry'
import { api } from './purse/api'
import { dispatch } from './base/dispatch'
import { staticAssetResponse } from './base/static-assets'
import { lobbyResponse } from './base/lobby'
import { setupStateResponse } from './base/setup-state'
import { authResponse, runtimeBindings, type Bindings } from './auth.server'
import { identity } from './identity'
import { seedDemo } from './demo'
import { purseAgentDoor, purseBusinessSettings } from './agent-door/index.server'
import { runPurchasingSchedule } from './purse/schedule'

function noTransform(response: Response): Response {
  const headers = new Headers(response.headers), policy = headers.get('cache-control')
  headers.set('cache-control', policy ? `${policy}, no-transform` : 'no-transform')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const worker = {
  async scheduled(event, env, ctx) { ctx.waitUntil(new Date(event.scheduledTime).getUTCMinutes()===0 ? runPurchasingSchedule(env, event.scheduledTime) : runNotificationDeliveries(env,event.scheduledTime)); },
  async fetch(request, env, execution) {
    const bindings = runtimeBindings(env)
    const business = await purseBusinessSettings(bindings).handle(request)
    if (business) return business
    const agent = await purseAgentDoor(bindings).handle(request)
    if (agent) return agent
    const asset = await staticAssetResponse(request, env)
    if (asset) return asset
    const state = await setupStateResponse(request, runtimeBindings(env))
    if (state) return state
    const lobby = await lobbyResponse(request, runtimeBindings(env), identity)
    if (lobby) return lobby
    const auth = await authResponse(request, env)
    if (auth) return auth
    return dispatch(request, () => api.fetch(request, env, execution), async () => noTransform(await start.fetch(request)))
  },
} satisfies ExportedHandler<Bindings>

// Demo mode only under RER_DEMO=1 (`rer demo`, a hosted demo); otherwise the worker is unchanged.
export default withDemo(worker, { seed: seedDemo })
