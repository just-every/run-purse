import { demoEffect } from './modules/demo/index.mjs'
import { createMailSender } from './modules/mail/index.mjs'

// Dev delivery validates and silently suppresses mail. Demo sends also return
// the provider success expected by auth, without constructing a transport.
export function operatorMail(env) {
 if (!env.MAIL_PROVIDER && env.RER_DEMO !== '1') return undefined
 return {
  send(message) {
   return demoEffect(() => {
    if (env.MAIL_PROVIDER === 'development' && env.AUTH_LOCAL !== 'true') throw new Error('mail_unavailable')
    return createMailSender({ provider: env.MAIL_PROVIDER, mode: env.MAIL_PROVIDER === 'development' ? 'development' : 'production',
     ...(env.MAIL_PROVIDER === 'development' ? {} : { apiKey: env.MAIL_API_KEY }),
     ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}),
    }).send(message)
   }, () => ({ provider: 'development', status: 'accepted', providerMessageId: null }))
  },
 }
}
